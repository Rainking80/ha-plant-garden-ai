"""The garden assistant: diagnosis, tips, chat and the weekly check (spec 4.7).

Every call goes through `AIService.async_generate`, so it is budget-checked and
logged like an identification. Nothing runs without a user action except the
weekly check, which is opt-in (option `weekly_check`, default off).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now

from ..care import CareManager, ChatMessage, Problem
from ..const import CONF_CONTEXT_TOKENS, CONF_WEEKLY_CHECK, DEFAULT_CONTEXT_TOKENS, DOMAIN
from ..garden import GardenChange, GardenManager, NotFoundError
from ..photos import PhotoVariant
from . import context as context_builder
from .base import AIError, AIRequest, Feature, Message
from .prompts import assistant as prompts
from .schemas import DIAGNOSE_SCHEMA, TIPS_SCHEMA, clean_diagnosis, clean_tips
from .service import AIService

_LOGGER = logging.getLogger(__name__)

STORE_KEY = f"{DOMAIN}.assistant"
STORE_VERSION = 1
GARDEN = "garden"  # key of the garden-wide tips
WEEKLY_HOUR = 8  # Monday, local time
MAX_DIAGNOSE_PHOTOS = 3
CHAT_HISTORY = 10  # earlier messages sent along


def _alternating(messages: list[Message]) -> list[Message]:
    """Merge neighbours of the same role and start with the user (all providers accept that)."""
    result: list[Message] = []
    for message in messages:
        if result and result[-1].role == message.role:
            result[-1] = Message(role=message.role, text=f"{result[-1].text}\n\n{message.text}")
        elif result or message.role == "user":
            result.append(message)
    return result


class Assistant:
    """Diagnoses problems, gives tips with tasks to take over, answers questions."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        *,
        manager: GardenManager,
        care: CareManager,
        ai: AIService,
        water: Any,  # WaterCoordinator
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._manager = manager
        self._care = care
        self._ai = ai
        self._water = water
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"tips": {}}
        self._unsubs: list[CALLBACK_TYPE] = []

    async def async_setup(self) -> None:
        self._data = await self._store.async_load() or {"tips": {}}
        self._unsubs.append(self._manager.async_subscribe(self._on_garden_change))
        self._unsubs.append(
            async_track_time_change(
                self.hass, self._async_weekly_tick, hour=WEEKLY_HOUR, minute=0, second=0
            )
        )

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    @callback
    def _on_garden_change(self, change: GardenChange) -> None:
        if change.kind == "plant_removed" and change.plant_id in self._data["tips"]:
            del self._data["tips"][change.plant_id]
            self._save()

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self._data, 1)

    # ------------------------------------------------------------ helpers
    def _language(self) -> str:
        return prompts.lang(self.hass.config.language)

    def _budget(self, feature: str) -> int:
        value = self._entry.options.get(CONF_CONTEXT_TOKENS + feature)
        return int(value) if value else DEFAULT_CONTEXT_TOKENS[feature]

    async def _context(
        self, plant_id: str | None, feature: str
    ) -> tuple[dict[str, Any], dict[str, str]]:
        origin = self._manager.layout.origin
        return await context_builder.async_build(
            self._manager,
            self._care,
            self._water.data,
            plant_id=plant_id,
            budget=self._budget(feature),
            latitude=origin.latitude if origin else self.hass.config.latitude,
        )

    # ------------------------------------------------------------ diagnosis
    async def async_diagnose(self, problem_id: str) -> Problem:
        """Symptoms, causes, measures from the problem's photos and the garden data."""
        problem = await self._care.async_get_problem(problem_id)
        plant = self._manager.get_plant(problem.plant_id)
        language = self._language()
        photos = await self._manager.async_list_photos(plant.id)  # newest first
        by_id = {p.id: p for p in photos}
        chosen = [by_id[i] for i in reversed(problem.photo_ids) if i in by_id][:2]
        first = min((p.taken_at for p in chosen), default=None)
        earlier = [
            p for p in photos if first is not None and p.taken_at < first and p not in chosen
        ]
        if earlier:  # one older photo of the plant to compare with
            chosen.append(earlier[0])
        if not chosen:
            chosen = photos[:1]
        chosen = chosen[:MAX_DIAGNOSE_PHOTOS]
        images = await self._ai.async_images(
            [(p.id, "auto") for p in chosen], plant.id, PhotoVariant.MEDIUM
        )
        de = language == "de"
        labels = [
            f"{i + 1}. {dt_util.as_local(p.taken_at).date().isoformat()}"
            + (
                ""
                if p.id in problem.photo_ids
                else (" (früher, zum Vergleich)" if de else " (earlier, for comparison)")
            )
            for i, p in enumerate(chosen)
        ]
        log = [
            f"{dt_util.as_local(e.ts).date().isoformat()} {e.kind}: {e.text}"
            for e in (await self._care.async_problem_log(problem_id))[-8:]
            if e.kind in ("note", "action", "status")
        ]
        context, _refs = await self._context(plant.id, "diagnose")
        request = AIRequest(
            feature=Feature.DIAGNOSE,
            system=prompts.DIAGNOSE_SYSTEM[language],
            messages=[
                Message(
                    role="user",
                    text=prompts.context_text(language, context)
                    + "\n\n"
                    + prompts.diagnose_text(language, title=problem.title, log=log, photos=labels),
                    images=images,
                )
            ],
            json_schema=DIAGNOSE_SCHEMA,
            max_output_tokens=3000,
            plant_id=plant.id,
            prompt_version=prompts.DIAGNOSE_VERSION,
        )
        response = await self._ai.async_generate(Feature.DIAGNOSE, request)
        diagnosis = clean_diagnosis(response.data or {})
        diagnosis["model"] = response.model
        diagnosis["created"] = dt_util.utcnow().isoformat()
        diagnosis["photo_ids"] = [p.id for p in chosen]
        diagnosis["follow_up_title"] = (
            f"Neues Foto: {problem.title}" if de else f"New photo: {problem.title}"
        )
        return await self._care.async_set_diagnosis(
            problem_id, diagnosis, summary=diagnosis["summary"]
        )

    # ------------------------------------------------------------ tips
    def tips(self, plant_id: str | None) -> dict[str, Any] | None:
        record: dict[str, Any] | None = self._data["tips"].get(plant_id or GARDEN)
        return record

    async def async_tips(
        self, plant_id: str | None = None, *, weekly: bool = False
    ) -> dict[str, Any]:
        """A few tips for a plant or the garden; jobs among them can become tasks."""
        if plant_id is not None:
            self._manager.get_plant(plant_id)
        language = self._language()
        feature = Feature.DIGEST if weekly else Feature.TIPS
        context, refs = await self._context(plant_id, "tips")
        request = AIRequest(
            feature=feature,
            system=prompts.TIPS_SYSTEM[language],
            messages=[
                Message(
                    role="user",
                    text=prompts.context_text(language, context)
                    + "\n\n"
                    + prompts.tips_text(language, plant=plant_id is not None, weekly=weekly),
                )
            ],
            json_schema=TIPS_SCHEMA,
            max_output_tokens=3000,
            plant_id=plant_id,
            prompt_version=prompts.DIGEST_VERSION if weekly else prompts.TIPS_VERSION,
        )
        response = await self._ai.async_generate(feature, request)
        cleaned = clean_tips(response.data or {}, refs)
        tips = []
        for tip in cleaned["tips"]:
            tip["plant_id"] = tip["plant_id"] or plant_id
            tips.append({"id": ulid_now(), **tip, "state": "new" if tip["task"] else None})
        for question in cleaned["questions"]:
            question["plant_id"] = question["plant_id"] or plant_id
        await self._care.async_add_questions(cleaned["questions"])
        record = {
            "created": dt_util.utcnow().isoformat(),
            "model": response.model,
            "weekly": weekly,
            "tips": tips,
        }
        self._data["tips"][plant_id or GARDEN] = record
        self._save()
        self._manager.notify_care(plant_id)
        return record

    async def async_decide_tip(
        self, plant_id: str | None, tip_id: str, *, accept: bool
    ) -> dict[str, Any]:
        """Take the task of a tip over (it becomes a task) or dismiss it."""
        record = self.tips(plant_id)
        tip = next((t for t in (record or {}).get("tips", []) if t["id"] == tip_id), None)
        if record is None or tip is None:
            raise NotFoundError(tip_id)
        if tip.get("task") is None or tip.get("state") != "new":
            return record
        if accept:
            task = tip["task"]
            fields: dict[str, Any] = {
                "kind": task["kind"],
                "title": task["title"],
                "plant_id": tip["plant_id"],
                "repeat": task["repeat"],
            }
            if task["due_in_days"] is not None:
                fields["due"] = dt_util.now().date() + timedelta(days=task["due_in_days"])
            created = await self._care.async_create_task(fields, source="ai")
            tip["task_id"] = created.id
        tip["state"] = "accepted" if accept else "dismissed"
        self._save()
        self._manager.notify_care(plant_id)
        return record

    # ------------------------------------------------------------ chat
    async def async_chat(
        self,
        plant_id: str | None,
        text: str,
        on_delta: Callable[[str], None] | None = None,
    ) -> ChatMessage:
        """Answer a question about a plant or the garden; both sides land in the history."""
        text = text.strip()
        if not text:
            raise ValueError("question must not be empty")
        history = await self._care.async_chat(plant_id, CHAT_HISTORY)
        await self._care.async_add_chat(plant_id, "user", text[:4000])
        self._manager.notify_care(plant_id)
        language = self._language()
        context, _refs = await self._context(plant_id, "chat")
        messages = _alternating(
            [
                *(Message(role=m.role, text=m.text) for m in history),
                Message(role="user", text=prompts.context_text(language, context) + "\n\n" + text),
            ]
        )
        request = AIRequest(
            feature=Feature.CHAT,
            system=prompts.CHAT_SYSTEM[language],
            messages=messages,
            max_output_tokens=1500,
            plant_id=plant_id,
            prompt_version=prompts.CHAT_VERSION,
        )
        response = await self._ai.async_generate(Feature.CHAT, request, on_delta=on_delta)
        answer = await self._care.async_add_chat(
            plant_id, "assistant", response.text.strip(), model=response.model
        )
        self._manager.notify_care(plant_id)
        return answer

    # ------------------------------------------------------------ weekly check
    async def _async_weekly_tick(self, now: datetime) -> None:
        if now.weekday() != 0 or not self._entry.options.get(CONF_WEEKLY_CHECK):
            return
        if self._ai.subentry_for(Feature.DIGEST) is None:
            return
        try:
            await self.async_tips(None, weekly=True)
        except AIError as err:
            _LOGGER.warning("Weekly garden check failed: %s", err)
