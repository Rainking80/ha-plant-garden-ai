"""The assistant collects knowledge about the plants (D-038).

For one plant at a time it researches care, pests, toxicity and more - with the
AI provider's own web search where there is one (Claude, Gemini, OpenRouter),
else from a Wikipedia article - and keeps the result. A plant that has its
knowledge is never researched again until the user deletes it.

Researching on a schedule is opt-in (option `research_schedule`, default off);
a user can always research one plant by hand. Every AI call goes through
`AIService.async_generate`: budget-checked and logged with its cost.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..care import CareManager
from ..const import CONF_RESEARCH_SCHEDULE, DOMAIN, RESEARCH_SCHEDULES
from ..garden import GardenChange, GardenManager, NotFoundError
from ..models import Plant, PlantStatus
from . import wikipedia
from .base import AIError, AIRequest, Feature, Message
from .prompts import assistant as assistant_prompts, research as prompts
from .schemas import RESEARCH_SCHEMA, calendar_kind, clean_research
from .service import AIService, season_text

_LOGGER = logging.getLogger(__name__)

STORE_KEY = f"{DOMAIN}.research"
STORE_VERSION = 1
# how long a schedule waits between two plants
INTERVALS: dict[str, timedelta] = {
    "weekly": timedelta(days=7),
    "daily": timedelta(days=1),
    "three_daily": timedelta(hours=8),
    "hourly": timedelta(hours=1),
}
RETRY_AFTER = timedelta(days=3)  # a plant whose research failed waits this long
TICK_MINUTE = 11  # the schedule is checked every hour at this minute
SLACK = timedelta(minutes=5)  # an hourly schedule must not slip by an hour
SKIPPED_STATUS = frozenset({PlantStatus.REMOVED, PlantStatus.DEAD})


def first_day_in(months: list[int], today: date) -> date:
    """Today if this month is one of `months`, else the 1st of the next one that is."""
    if today.month in months:
        return today
    year, month = today.year, today.month
    for _ in range(12):
        month += 1
        if month > 12:
            year, month = year + 1, 1
        if month in months:
            return date(year, month, 1)
    return today


class Researcher:
    """Researches plants on demand or on the schedule and keeps what it found."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        *,
        manager: GardenManager,
        ai: AIService,
        care: CareManager,
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._manager = manager
        self._ai = ai
        self._care = care
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"plants": {}, "failed": {}, "last_run": None}
        self._lock = asyncio.Lock()
        self.running: str | None = None  # plant being researched
        self._unsubs: list[CALLBACK_TYPE] = []

    async def async_setup(self) -> None:
        stored = await self._store.async_load()
        if stored:
            self._data.update(stored)
        self._unsubs.append(self._manager.async_subscribe(self._on_garden_change))
        self._unsubs.append(
            async_track_time_change(self.hass, self._async_tick, minute=TICK_MINUTE, second=0)
        )

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    @callback
    def _on_garden_change(self, change: GardenChange) -> None:
        if change.kind != "plant_removed" or not change.plant_id:
            return
        removed = self._data["plants"].pop(change.plant_id, None)
        failed = self._data["failed"].pop(change.plant_id, None)
        if removed or failed:
            self._save()

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self._data, 1)

    # ------------------------------------------------------------ state
    @property
    def schedule(self) -> str:
        value = self._entry.options.get(CONF_RESEARCH_SCHEDULE, "off")
        return value if value in RESEARCH_SCHEDULES else "off"

    def knowledge(self) -> dict[str, dict[str, Any]]:
        """Plant id -> what is known about it (read only)."""
        plants: dict[str, dict[str, Any]] = self._data["plants"]
        return plants

    def info(self, plant_id: str) -> dict[str, Any] | None:
        info: dict[str, Any] | None = self._data["plants"].get(plant_id)
        return info

    def queue(self, now: datetime | None = None) -> list[str]:
        """Plants still without knowledge, oldest first; failed ones wait a while."""
        now = now or dt_util.utcnow()
        waiting = []
        for plant in sorted(self._manager.plants, key=lambda p: p.created_at):
            if plant.id in self._data["plants"] or plant.status in SKIPPED_STATUS:
                continue
            failed = self._data["failed"].get(plant.id)
            failed_at = dt_util.parse_datetime(failed["at"]) if failed else None
            if failed_at and failed_at + RETRY_AFTER > now:
                continue
            waiting.append(plant.id)
        return waiting

    def _due_after(self) -> datetime | None:
        """When the schedule may research again (None: off, or due since ever)."""
        interval = INTERVALS[self.schedule]
        last = dt_util.parse_datetime(self._data["last_run"] or "")
        return last + interval if last else None

    def is_due(self, now: datetime) -> bool:
        """Should the hourly check research a plant now? (A few minutes of slack.)"""
        if self.schedule not in INTERVALS or not self.queue(now):
            return False
        after = self._due_after()
        return after is None or after <= now + SLACK

    def next_run(self, now: datetime | None = None) -> datetime | None:
        """When the schedule researches the next plant (None: off or nothing to do)."""
        now = now or dt_util.utcnow()
        if self.schedule not in INTERVALS or not self.queue(now):
            return None
        due = max(self._due_after() or now, now)
        # the check runs every hour at minute TICK_MINUTE
        slot = due.replace(minute=TICK_MINUTE, second=0, microsecond=0)
        return slot if slot + SLACK >= due else slot + timedelta(hours=1)

    def summary(self) -> dict[str, Any]:
        """Everything the assistant page and the plant pages show."""
        available = self._ai.subentry_for(Feature.RESEARCH) is not None
        next_run = self.next_run()
        return {
            "schedule": self.schedule,
            "schedules": list(RESEARCH_SCHEDULES),
            "available": available,
            "web": available and self._ai.can_search_web(),
            "estimate": self._ai.estimate_research() if available else None,
            "currency": self._ai.currency(),
            "running": self.running,
            "next_run": next_run.isoformat() if next_run else None,
            "queue": self.queue(),
            "failed": dict(self._data["failed"]),
            "plants": {
                plant_id: {**info, "cost": self._ai.display_cost(info.get("cost"))}
                for plant_id, info in self._data["plants"].items()
            },
        }

    # ------------------------------------------------------------ changes
    async def async_set_schedule(self, schedule: str) -> None:
        if schedule not in RESEARCH_SCHEDULES:
            raise ValueError(f"unknown schedule {schedule}")
        self.hass.config_entries.async_update_entry(
            self._entry, options={**self._entry.options, CONF_RESEARCH_SCHEDULE: schedule}
        )
        self._manager.notify_ai()

    async def async_delete(self, plant_id: str) -> None:
        """Forget a plant's knowledge: the schedule will research it again."""
        self._manager.get_plant(plant_id)
        self._data["plants"].pop(plant_id, None)
        self._data["failed"].pop(plant_id, None)
        self._save()
        self._manager.notify_ai(plant_id)

    async def async_forget_deleted_tasks(self) -> None:
        """Calendar jobs whose task was deleted can be taken over again."""
        changed = False
        for info in self._data["plants"].values():
            for item in info.get("calendar") or []:
                if not item.get("task_id"):
                    continue
                try:
                    await self._care.async_get_task(item["task_id"])
                except NotFoundError:
                    item.pop("task_id")
                    changed = True
        if changed:
            self._save()

    async def async_calendar_task(self, plant_id: str, index: int) -> dict[str, Any]:
        """Take a job of the care calendar over as a yearly task (seasonal months)."""
        await self.async_forget_deleted_tasks()
        info = self._data["plants"].get(plant_id)
        if info is None:
            raise NotFoundError(f"knowledge of {plant_id}")
        calendar = info.get("calendar") or []
        if not 0 <= index < len(calendar):
            raise NotFoundError(f"calendar entry {index}")
        item = calendar[index]
        if item.get("task_id"):
            raise ValueError("this job is a task already")
        today = dt_util.now().date()
        task = await self._care.async_create_task(
            {
                "title": item["task"],
                "kind": calendar_kind(item["task"], item.get("kind")),
                "plant_id": plant_id,
                "due": first_day_in(item["months"], today),
                "repeat": {"every": 52, "unit": "weeks"},
                "months": item["months"],
            },
            source="ai",
        )
        item["task_id"] = task.id
        self._save()
        self._manager.notify_ai(plant_id)
        return dict(info)

    async def async_research(self, plant_id: str) -> dict[str, Any]:
        """Research one plant now and keep the result (replaces earlier knowledge)."""
        plant = self._manager.get_plant(plant_id)
        if self._lock.locked():
            raise AIError("Another plant is being researched")
        async with self._lock:
            self.running = plant_id
            self._manager.notify_ai(plant_id)
            try:
                info = await self._async_pipeline(plant)
            except AIError as err:
                self._data["failed"][plant_id] = {
                    "at": dt_util.utcnow().isoformat(),
                    "error": str(err)[:300],
                }
                raise
            finally:
                self.running = None
                self._save()
                self._manager.notify_ai(plant_id)
            self._data["plants"][plant_id] = info
            self._data["failed"].pop(plant_id, None)
            self._save()
            self._manager.notify_ai(plant_id)
            return info

    async def _async_tick(self, now: datetime) -> None:
        """Every hour: research the next plant when the schedule says so."""
        now = dt_util.as_utc(now)
        if not self.is_due(now) or self._lock.locked():
            return
        queue = self.queue(now)
        self._data["last_run"] = now.isoformat()
        self._save()
        try:
            await self.async_research(queue[0])
        except AIError as err:
            _LOGGER.warning("Researching a plant failed: %s", err)

    # ------------------------------------------------------------ the research
    async def _async_pipeline(self, plant: Plant) -> dict[str, Any]:
        language = assistant_prompts.lang(self.hass.config.language)
        origin = self._manager.layout.origin
        latitude = origin.latitude if origin else self.hass.config.latitude
        season = season_text(latitude, dt_util.now().date(), language)
        described = {
            "name": plant.name,
            "scientific_name": plant.scientific_name,
            "variety": plant.variety,
            "family": plant.family,
            "category": plant.category.value,
            "location_type": plant.location_type.value,
        }
        costs: list[float | None] = []
        sources: list[dict[str, str]] = []
        if self._ai.can_search_web():
            found = await self._ai.async_generate(
                Feature.RESEARCH,
                AIRequest(
                    feature=Feature.RESEARCH,
                    system=prompts.RESEARCH_SYSTEM[language],
                    messages=[
                        Message(
                            role="user", text=prompts.research_text(language, described, season)
                        )
                    ],
                    max_output_tokens=6000,
                    plant_id=plant.id,
                    prompt_version=prompts.VERSION,
                ),
                web=True,
            )
            costs.append(found.cost)
            notes, sources, method = found.text, found.sources, "web"
        else:
            article = await wikipedia.async_article(
                async_get_clientsession(self.hass),
                [plant.scientific_name or "", plant.name],
                [language, "en"],
            )
            if article is not None:
                notes = f"Wikipedia: {article.title}\n\n{article.text}"
                sources = [{"url": article.url, "title": f"Wikipedia: {article.title}"}]
                method = "wikipedia"
            else:
                notes, method = "", "model"
        tidy = await self._ai.async_generate(
            Feature.RESEARCH,
            AIRequest(
                feature=Feature.RESEARCH,
                system=prompts.tidy_system(language, web=method == "web"),
                messages=[
                    Message(
                        role="user",
                        text=prompts.tidy_text(language, described, season, notes),
                    )
                ],
                json_schema=RESEARCH_SCHEMA,
                max_output_tokens=4000,
                plant_id=plant.id,
                prompt_version=prompts.VERSION,
            ),
        )
        costs.append(tidy.cost)
        data = clean_research(tidy.data or {})
        if not data["summary"] and not data["sections"]:
            raise AIError("The research found nothing usable")
        return {
            **data,
            "sources": sources[:20],
            "method": method,
            "model": tidy.model,
            "language": language,
            "researched_at": dt_util.utcnow().isoformat(),
            "cost": None if None in costs else round(sum(c or 0 for c in costs), 6),
        }
