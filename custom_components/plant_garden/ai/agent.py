"""The garden agent: a chat that knows the garden, explains the software and acts.

A question starts a loop: the model answers or asks for tools, the tools run
here, their results go back, until the model has its answer (at most MAX_STEPS
rounds). All thinking happens at the AI provider; Home Assistant only looks
things up in data it holds anyway - no embeddings, no vector store, no SQL for
the model.

What the agent may do is exactly its tools: read the garden, look things up in
the handbook, search the web through the provider, and a few additive actions
(create a plant, change its details, tasks, waterings, problems). Every action
is reported to the panel and can be undone. It cannot delete, change settings or
switch anything, and it never sees plant notes, coordinates or entity ids.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
import json
import logging
from pathlib import Path
import re
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now

from .. import llm_api
from ..care import TaskKind, TaskStatus
from ..const import DOMAIN
from ..garden import NotFoundError
from ..models import ENUM_FIELDS, Light, PlantCategory, PlantStatus, WaterNeed
from .base import AIError, AIRequest, Feature, Message
from .prompts import agent as prompts
from .service import AIService
from .toolcalls import ToolCall, ToolSpec

_LOGGER = logging.getLogger(__name__)

STORE_KEY = f"{DOMAIN}.agent"
STORE_VERSION = 1
MAX_CHATS = 50  # the oldest conversation goes when a new one would be one too many
TITLE_LENGTH = 60
# what a model likes to wrap a title in: spaces, quotes of all kinds, markdown, a final dot
TITLE_EDGES = " \"'\u201e\u201c\u201d\u201a\u2018\u2019\u00ab\u00bb*#."
MAX_STEPS = 8  # rounds of tool calls per question
KEEP_MESSAGES = 60  # per conversation
SEND_MESSAGES = 12  # earlier messages the model gets with a question
MAX_RESULT_CHARS = 6000  # a tool result is cut to this for the model
MAX_PLANTS_LISTED = 150
HELP_SECTIONS = 2
HELP_CHARS = 3500
HELP_DIR = Path(__file__).parent.parent / "help"

# fields of a plant the agent may set when asked to
PLANT_TEXT = ("scientific_name", "variety", "care_water", "care_fertilize", "care_prune")
PLANT_CHOICES = ("category", "light", "water_need", "status")


def _obj(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required or []}


def _text(description: str) -> dict[str, Any]:
    return {"type": "string", "description": description}


_PLANT = _text("Name of the plant, as in the garden")
_PLANT_FIELDS: dict[str, Any] = {
    "scientific_name": _text("Botanical name"),
    "variety": _text("Variety"),
    "category": {"type": "string", "enum": [c.value for c in PlantCategory]},
    "light": {"type": "string", "enum": [v.value for v in Light]},
    "water_need": {"type": "string", "enum": [v.value for v in WaterNeed]},
    "min_temperature_c": {"type": "number", "description": "Coldest temperature it tolerates"},
    "care_water": _text("Short watering hint"),
    "care_fertilize": _text("Short fertilising hint"),
    "care_prune": _text("Short pruning hint"),
}

TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        "garden_overview",
        "What the garden needs now: plants that need water today and soon, frost and weather "
        "warnings, tasks due today and this week, active problems, rain today and tomorrow. "
        "Use it for 'what is to do today?'.",
        _obj({}),
    ),
    ToolSpec(
        "list_plants",
        "The plants of the garden with species, category, status and whether they are placed "
        "on the plan. Optionally only those matching a word.",
        _obj({"query": _text("Part of a name, botanical name or tag")}),
    ),
    ToolSpec(
        "plant_info",
        "Everything about one plant: species, care hints, soil water, last watering, open "
        "tasks, problems and the knowledge collected about it.",
        _obj({"plant": _PLANT}, ["plant"]),
    ),
    ToolSpec(
        "weather",
        "The weather of the last days and the forecast: temperatures, rain, evaporation.",
        _obj({}),
    ),
    ToolSpec(
        "list_tasks",
        "Open garden tasks, optionally of one plant.",
        _obj({"plant": _PLANT}),
    ),
    ToolSpec(
        "create_plant",
        "Add a plant to the garden when the user asks for it. It is not placed on the plan: "
        "the user drags it there. Fill in what you know for sure about the species.",
        _obj({"name": _text("Name shown in the garden"), **_PLANT_FIELDS}, ["name"]),
    ),
    ToolSpec(
        "update_plant",
        "Change details of a plant when the user asks for it.",
        _obj(
            {
                "plant": _PLANT,
                **_PLANT_FIELDS,
                "status": {
                    "type": "string",
                    "enum": [s.value for s in PlantStatus if s is not PlantStatus.REMOVED],
                },
            },
            ["plant"],
        ),
    ),
    ToolSpec(
        "log_watering",
        "Record that the user watered plants by hand, with the litres each received. Only "
        "for watering that has happened.",
        _obj(
            {
                "plants": {"type": "array", "items": {"type": "string"}},
                "liters": {"type": "number", "description": "Litres per plant"},
            },
            ["plants", "liters"],
        ),
    ),
    ToolSpec(
        "create_task",
        "Add a task to the garden's to-do list, optionally for a plant, due in a number of "
        "days (0 = today) and repeating every N days.",
        _obj(
            {
                "title": _text("What to do"),
                "plant": _PLANT,
                "kind": {"type": "string", "enum": [kind.value for kind in TaskKind]},
                "due_in_days": {"type": "integer"},
                "repeat_every_days": {"type": "integer"},
            },
            ["title"],
        ),
    ),
    ToolSpec(
        "complete_task",
        "Mark an open task as done when the user says it is done.",
        _obj({"title": _text("Title of the task, or part of it"), "plant": _PLANT}, ["title"]),
    ),
    ToolSpec(
        "report_problem",
        "Open a problem for a plant the user says looks ill, damaged or infested.",
        _obj(
            {"plant": _PLANT, "title": _text("What is wrong, in a few words")}, ["plant", "title"]
        ),
    ),
    ToolSpec(
        "help",
        "Look up how Autogarden works in its handbook: setting up, the plan, irrigation, "
        "weather, AI providers, dream garden, costs, automations, privacy, troubleshooting. "
        "Without a topic it lists the chapters.",
        _obj({"topic": _text("What the user wants to know, as keywords")}),
    ),
)
WEB_SEARCH = ToolSpec(
    "web_search",
    "Search the web for gardening knowledge: plants, pests, diseases, care, timing. Returns "
    "a researched answer with its sources. Not for the user's own garden data.",
    _obj({"query": _text("What to find out, as a full question")}, ["query"]),
)


def _split_chapter(heading: str, body: str) -> list[tuple[str, str]]:
    """A long chapter as its entries ("- **Title** ..."), so a lookup returns one of them."""
    if len(body) <= HELP_CHARS:
        return [(heading, body)]
    parts: list[tuple[str, str]] = []
    title = heading
    lines: list[str] = []
    for line in body.splitlines():
        entry = re.match(r"- \*\*(.+?)\*\*", line)
        if entry:
            if lines:
                parts.append((title, "\n".join(lines).strip()))
            title, lines = f"{heading} - {entry.group(1)}", [line]
        else:
            lines.append(line)
    if lines:
        parts.append((title, "\n".join(lines).strip()))
    return [(title, text) for title, text in parts if text]


def split_handbook(text: str) -> list[tuple[str, str]]:
    """(heading, text) of the handbook: its chapters, long ones entry by entry."""
    sections: list[tuple[str, str]] = []
    heading = ""
    lines: list[str] = []
    for line in [*text.splitlines(), "## "]:
        if line.startswith("## "):
            if heading:
                sections.extend(_split_chapter(heading, "\n".join(lines).strip()))
            heading, lines = line[3:].strip(), []
        elif heading:
            lines.append(line)
    return sections


def search_handbook(sections: list[tuple[str, str]], topic: str) -> list[tuple[str, str]]:
    """The sections that fit a topic best.

    A word in the heading counts three times; in the text a word counts at most
    three times, so a long section does not win by its length alone.
    """
    words = {word for word in re.findall(r"\w+", topic.casefold()) if len(word) >= 3}
    if not words:
        return []
    scored = []
    for heading, body in sections:
        head, text = heading.casefold(), body.casefold()
        score = sum(3 * min(head.count(word), 1) + min(text.count(word), 3) for word in words)
        if score:
            scored.append((score, heading, body))
    scored.sort(key=lambda item: -item[0])
    return [(heading, body) for _score, heading, body in scored[:HELP_SECTIONS]]


def clean_title(text: str) -> str:
    """A title as the model gave it: one line, without quotes or a final dot."""
    line = next((part.strip() for part in text.splitlines() if part.strip()), "")
    return line.strip(TITLE_EDGES).strip()[:TITLE_LENGTH]


def fallback_title(question: str) -> str:
    """The first words of the question, when the AI gave no title."""
    words = " ".join(question.split())
    if len(words) <= TITLE_LENGTH:
        return words
    return words[:TITLE_LENGTH].rsplit(" ", 1)[0] + " …"


class GardenAgent:
    """Answers questions with tools and keeps the conversation."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, *, ai: AIService) -> None:
        self.hass = hass
        self._entry = entry
        self._ai = ai
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        # conversations by id; `_messages` is the one a question is being answered in
        self._chats: dict[str, dict[str, Any]] = {}
        self._messages: list[dict[str, Any]] = []
        self._handbook: dict[str, list[tuple[str, str]]] = {}
        self._busy = False
        # of the question being answered
        self._web = False
        self._model = ""
        self._cost = 0.0
        self._cost_known = True
        self._sources: list[dict[str, str]] = []

    async def async_setup(self) -> None:
        data = await self._store.async_load() or {}
        self._chats = data.get("chats", {})
        if data.get("messages"):
            # before 0.6 there was one conversation: it becomes the first saved one
            old = data["messages"]
            chat = self._new_chat()
            chat["messages"] = old
            chat["created"] = old[0].get("created", chat["created"])
            chat["updated"] = old[-1].get("created", chat["updated"])
            chat["title"] = fallback_title(
                next((m["text"] for m in old if m["role"] == "user"), "")
            )

        def load() -> dict[str, list[tuple[str, str]]]:
            books = {}
            for language, name in (("en", "USER_GUIDE.md"), ("de", "USER_GUIDE.de.md")):
                path = HELP_DIR / name
                books[language] = (
                    split_handbook(path.read_text(encoding="utf-8")) if path.exists() else []
                )
            return books

        self._handbook = await self.hass.async_add_executor_job(load)

    async def async_shutdown(self) -> None:
        await self._store.async_save({"chats": self._chats})

    def _save(self) -> None:
        self._store.async_delay_save(lambda: {"chats": self._chats}, 1)

    # ------------------------------------------------------------ conversations
    def _new_chat(self) -> dict[str, Any]:
        """An empty conversation; the oldest one makes room when there are too many."""
        while len(self._chats) >= MAX_CHATS:
            oldest = min(self._chats.values(), key=lambda chat: chat["updated"])
            del self._chats[oldest["id"]]
        now = dt_util.utcnow().isoformat()
        chat: dict[str, Any] = {
            "id": ulid_now(),
            "title": "",
            "created": now,
            "updated": now,
            "messages": [],
        }
        self._chats[chat["id"]] = chat
        return chat

    def _chat(self, chat_id: str) -> dict[str, Any]:
        try:
            return self._chats[chat_id]
        except KeyError:
            raise NotFoundError(chat_id) from None

    @staticmethod
    def _summary(chat: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": chat["id"],
            "title": chat["title"],
            "created": chat["created"],
            "updated": chat["updated"],
            "messages": len(chat["messages"]),
        }

    def chats(self) -> list[dict[str, Any]]:
        """The saved conversations, the one used last first."""
        ordered = sorted(self._chats.values(), key=lambda chat: chat["updated"], reverse=True)
        return [self._summary(chat) for chat in ordered]

    def history(self, chat_id: str) -> dict[str, Any]:
        """A conversation with its messages."""
        chat = self._chat(chat_id)
        return {
            **self._summary(chat),
            "messages": [self._public(message) for message in chat["messages"]],
        }

    async def async_delete(self, chat_id: str) -> None:
        """Forget a conversation (what the agent did in the garden stays)."""
        self._chat(chat_id)
        if self._busy and self._chats[chat_id]["messages"] is self._messages:
            raise ValueError("the assistant is still answering in this conversation")
        del self._chats[chat_id]
        self._save()

    async def _async_title(self, question: str, answer: str, subentry: Any) -> str:
        """A short title for a conversation, from its first question and answer."""
        language = self._language()
        try:
            response = await self._ai.async_generate(
                Feature.AGENT,
                AIRequest(
                    feature=Feature.AGENT,
                    system=prompts.TITLE_SYSTEM[language],
                    messages=[Message(role="user", text=f"{question[:600]}\n\n{answer[:600]}")],
                    max_output_tokens=60,
                    prompt_version=prompts.VERSION,
                ),
                subentry,
            )
        except AIError as err:
            _LOGGER.debug("No title from the AI: %s", err)
            return fallback_title(question)
        return clean_title(response.text) or fallback_title(question)

    def _language(self) -> str:
        return "de" if self.hass.config.language == "de" else "en"

    @property
    def _data(self) -> Any:
        return self._entry.runtime_data

    # ------------------------------------------------------------ for the panel
    def status(self) -> dict[str, Any]:
        """Is there a provider that can run the agent, and can it search the web?"""
        subentry = self._ai.agent_subentry()
        return {
            "available": subentry is not None,
            "provider": subentry.title if subentry else None,
            "web": bool(subentry) and self._ai.can_search_web(Feature.AGENT),
            "currency": self._ai.currency(),
        }

    @staticmethod
    def _public(message: dict[str, Any]) -> dict[str, Any]:
        """A message without what only the backend needs (how to undo an action)."""
        return {
            **message,
            "actions": [
                {key: value for key, value in action.items() if key != "undo"}
                for action in message.get("actions", [])
            ],
        }

    # ------------------------------------------------------------ tools
    def _plants(self) -> list[Any]:
        return [p for p in self._data.manager.plants if p.status is not PlantStatus.REMOVED]

    def _find(self, name: str) -> Any:
        return llm_api.find_plant(self._plants(), name)

    async def _tool_garden_overview(self, args: dict[str, Any]) -> dict[str, Any]:
        return await llm_api.OverviewTool()._async_run(self.hass, {})  # noqa: SLF001

    async def _tool_list_plants(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip().casefold()
        found = []
        for plant in self._plants():
            words = [plant.name, plant.scientific_name or "", plant.variety or "", *plant.tags]
            if query and not any(query in word.casefold() for word in words):
                continue
            item = {
                "name": plant.name,
                "scientific_name": plant.scientific_name,
                "category": plant.category.value,
                "status": plant.status.value,
                "on_the_plan": plant.position is not None,
                "tags": plant.tags or None,
            }
            found.append({key: value for key, value in item.items() if value is not None})
        return {"count": len(found), "plants": found[:MAX_PLANTS_LISTED]}

    async def _tool_plant_info(self, args: dict[str, Any]) -> dict[str, Any]:
        info = await llm_api.PlantInfoTool()._async_run(self.hass, args)  # noqa: SLF001
        plant = self._find(str(args.get("plant") or ""))
        known = self._data.researcher.knowledge.get(plant.id)
        if known:
            info["knowledge"] = {
                "summary": known.get("summary"),
                "topics": {
                    section["topic"]: section["text"][:600] for section in known.get("sections", [])
                },
                "warnings": known.get("warnings") or None,
            }
        info["on_the_plan"] = plant.position is not None
        return info

    async def _tool_weather(self, args: dict[str, Any]) -> dict[str, Any]:
        water = self._data.water.data
        today = dt_util.now().date()
        days = [
            {
                "day": day.day.isoformat(),
                "forecast": day.day > today,
                "min_c": day.t_min,
                "max_c": day.t_max,
                "rain_mm": day.precip_mm,
                "rain_chance_percent": day.rain_probability,
                "evaporation_mm": day.et0_mm,
            }
            for day in (water.weather if water else [])
            if today - timedelta(days=3) <= day.day <= today + timedelta(days=7)
        ]
        if not days:
            return {"note": "No weather source is set up (integration settings: add weather)."}
        return {
            "today": today.isoformat(),
            "days": [{k: v for k, v in day.items() if v is not None} for day in days],
            "warnings": [
                {"kind": alert["kind"], "day": alert["day"]}
                for alert in self._data.alerts.summary()
            ],
        }

    async def _tool_list_tasks(self, args: dict[str, Any]) -> dict[str, Any]:
        plant = self._find(str(args["plant"])) if args.get("plant") else None
        names = {p.id: p.name for p in self._plants()}
        tasks = [
            task
            for task in await self._data.care.async_tasks(plant.id if plant else None)
            if task.status is TaskStatus.OPEN
        ]
        tasks.sort(key=lambda task: (task.due is None, task.due))
        return {
            "count": len(tasks),
            "tasks": [
                {
                    "title": task.title,
                    "kind": task.kind.value,
                    "plant": names.get(task.plant_id or ""),
                    "due": task.due.isoformat() if task.due else None,
                    "repeats": task.repeats,
                }
                for task in tasks[:60]
            ],
        }

    def _plant_fields(self, args: dict[str, Any]) -> dict[str, Any]:
        """The plant details in a tool call, checked."""
        fields: dict[str, Any] = {}
        for key in PLANT_TEXT:
            if isinstance(args.get(key), str) and args[key].strip():
                fields[key] = args[key].strip()[:1000]
        for key in PLANT_CHOICES:
            value = args.get(key)
            if value in {member.value for member in ENUM_FIELDS[key]} and value != "removed":
                fields[key] = value
        low = args.get("min_temperature_c")
        if isinstance(low, int | float) and not isinstance(low, bool) and -60 <= low <= 40:
            fields["min_temperature_c"] = float(low)
        return fields

    async def _tool_create_plant(self, args: dict[str, Any]) -> tuple[dict[str, Any], Any]:
        name = str(args.get("name") or "").strip()[:100]
        if not name:
            raise llm_api.ToolError("A plant needs a name.")
        manager = self._data.manager
        if any(plant.name.casefold() == name.casefold() for plant in self._plants()):
            raise llm_api.ToolError(f'A plant called "{name}" exists already.')
        plant = await manager.async_create_plant({"name": name})
        details = self._plant_fields(args)
        details.pop("status", None)
        if details:
            # what the model knows about the species is marked as the AI's
            await manager.async_apply_ai_fields(
                plant.id, details, confidence=None, model=self._model
            )
        return (
            {"created": name, "details": details, "on_the_plan": False},
            {"kind": "create_plant", "label": name, "undo": {"plant_id": plant.id}},
        )

    async def _tool_update_plant(self, args: dict[str, Any]) -> tuple[dict[str, Any], Any]:
        plant = self._find(str(args.get("plant") or ""))
        fields = self._plant_fields(args)
        if not fields:
            raise llm_api.ToolError("Nothing to change was given.")
        before = {}
        for key in fields:
            value = getattr(plant, key)
            before[key] = getattr(value, "value", value)
        await self._data.manager.async_update_plant(plant.id, fields)
        return (
            {"updated": plant.name, "changed": fields},
            {
                "kind": "update_plant",
                "label": plant.name,
                "undo": {"plant_id": plant.id, "fields": before},
            },
        )

    async def _tool_log_watering(self, args: dict[str, Any]) -> tuple[dict[str, Any], Any]:
        given = args.get("plants")
        names = given if isinstance(given, list) else []
        found = [self._find(str(name)) for name in names]
        liters = args.get("liters")
        if not found or not isinstance(liters, int | float) or not 0.05 <= liters <= 1000:
            raise llm_api.ToolError("Which plants, and how many litres each (0.05 to 1000)?")
        event = await self._data.irrigation.async_log_watering(
            {plant.id: float(liters) for plant in found}, note="Assistant"
        )
        label = ", ".join(plant.name for plant in found)
        return (
            {"logged": [plant.name for plant in found], "liters_each": float(liters)},
            {"kind": "log_watering", "label": label, "undo": {"event_id": event.id}},
        )

    async def _tool_create_task(self, args: dict[str, Any]) -> tuple[dict[str, Any], Any]:
        title = str(args.get("title") or "").strip()[:200]
        if not title:
            raise llm_api.ToolError("A task needs a title.")
        kinds = {kind.value for kind in TaskKind}
        fields: dict[str, Any] = {
            "title": title,
            "kind": args["kind"] if args.get("kind") in kinds else "other",
        }
        plant = self._find(str(args["plant"])) if args.get("plant") else None
        if plant is not None:
            fields["plant_id"] = plant.id
        due = args.get("due_in_days")
        if isinstance(due, int) and not isinstance(due, bool) and 0 <= due <= 730:
            fields["due"] = dt_util.now().date() + timedelta(days=due)
        every = args.get("repeat_every_days")
        if isinstance(every, int) and not isinstance(every, bool) and 1 <= every <= 365:
            fields["repeat"] = {"every": every, "unit": "days"}
        task = await self._data.care.async_create_task(fields, source="ai")
        return (
            {
                "created": task.title,
                "plant": plant.name if plant else None,
                "due": task.due.isoformat() if task.due else None,
            },
            {"kind": "create_task", "label": task.title, "undo": {"task_id": task.id}},
        )

    async def _tool_complete_task(self, args: dict[str, Any]) -> tuple[dict[str, Any], Any]:
        care = self._data.care
        plant = self._find(str(args["plant"])) if args.get("plant") else None
        wanted = str(args.get("title") or "").strip().casefold()
        tasks = [
            task
            for task in await care.async_tasks(plant.id if plant else None)
            if task.status is TaskStatus.OPEN and wanted and wanted in task.title.casefold()
        ]
        exact = [task for task in tasks if task.title.casefold() == wanted]
        if len(exact) == 1:
            tasks = exact
        if not tasks:
            raise llm_api.ToolError(f'No open task matches "{args.get("title")}".')
        if len(tasks) > 1:
            listed = "; ".join(task.title for task in tasks[:10])
            raise llm_api.ToolError(f"Several open tasks match: {listed}. Ask which one is meant.")
        task = tasks[0]
        following = await care.async_complete_task(task.id)
        return (
            {
                "completed": task.title,
                "next_due": following.due.isoformat() if following and following.due else None,
            },
            {
                "kind": "complete_task",
                "label": task.title,
                "undo": {"task_id": task.id, "next_id": following.id if following else None},
            },
        )

    async def _tool_report_problem(self, args: dict[str, Any]) -> tuple[dict[str, Any], Any]:
        plant = self._find(str(args.get("plant") or ""))
        title = str(args.get("title") or "").strip()[:120]
        if not title:
            raise llm_api.ToolError("What is wrong with the plant?")
        problem = await self._data.care.async_create_problem(plant.id, title)
        return (
            {"reported": problem.title, "plant": plant.name},
            {
                "kind": "report_problem",
                "label": f"{plant.name}: {problem.title}",
                "undo": {"problem_id": problem.id},
            },
        )

    async def _tool_help(self, args: dict[str, Any]) -> dict[str, Any]:
        sections = self._handbook.get(self._language()) or self._handbook.get("en") or []
        topic = str(args.get("topic") or "").strip()
        found = search_handbook(sections, topic) if topic else []
        if not found:
            return {"chapters": [heading for heading, _body in sections]}
        return {
            "chapters": [{"heading": heading, "text": body[:HELP_CHARS]} for heading, body in found]
        }

    async def _tool_web_search(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()[:500]
        if not query:
            raise llm_api.ToolError("What should be searched for?")
        language = self._language()
        response = await self._ai.async_generate(
            Feature.AGENT,
            AIRequest(
                feature=Feature.AGENT,
                system=prompts.SEARCH_SYSTEM[language],
                messages=[Message(role="user", text=query)],
                max_output_tokens=1500,
                prompt_version=prompts.VERSION,
            ),
            self._ai.agent_subentry(),
            web=True,
        )
        self._cost += response.cost or 0.0
        self._cost_known = self._cost_known and response.cost is not None
        for source in response.sources:
            if source not in self._sources:
                self._sources.append(source)
        return {"answer": response.text, "sources": response.sources[:8]}

    async def _async_call(self, call: ToolCall) -> tuple[str, bool, dict[str, Any] | None]:
        """Run one tool call: (result for the model, is error, action for the panel)."""
        handler = getattr(self, f"_tool_{call.name}", None)
        if handler is None or (call.name == "web_search" and not self._web):
            return json.dumps({"error": f"unknown tool {call.name}"}), True, None
        try:
            outcome = await handler(call.args)
        except (llm_api.ToolError, NotFoundError, ValueError) as err:
            return json.dumps({"error": str(err)}, ensure_ascii=False), True, None
        except AIError as err:
            return json.dumps({"error": f"the search failed: {err}"}), True, None
        result, action = outcome if isinstance(outcome, tuple) else (outcome, None)
        text = json.dumps(result, ensure_ascii=False, separators=(",", ":"), default=str)
        return text[:MAX_RESULT_CHARS], False, action

    # ------------------------------------------------------------ the loop
    def _context(self) -> list[dict[str, Any]]:
        """Earlier messages for the model: their text, and what the agent did."""
        result: list[dict[str, Any]] = []
        for message in self._messages[-SEND_MESSAGES:]:
            text = message["text"]
            done = [
                f"{action['kind']}: {action['label']}"
                + (" (undone)" if action.get("undone") else "")
                for action in message.get("actions", [])
            ]
            if done:
                text += "\n[actions: " + "; ".join(done) + "]"
            if result and result[-1]["role"] == message["role"]:
                result[-1]["text"] += "\n\n" + text
            else:
                result.append({"role": message["role"], "text": text})
        while result and result[0]["role"] != "user":
            result.pop(0)
        return result

    async def async_ask(
        self,
        text: str,
        *,
        chat_id: str | None = None,
        page: dict[str, Any] | None = None,
        on_event: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Answer a question in a conversation (a new one without `chat_id`).

        Tool use and actions are reported through `on_event`. Returns the answer
        and the conversation: `{"message": ..., "chat": ...}`. A new conversation
        gets its title from the AI after its first answer.
        """
        text = text.strip()[:4000]
        if not text:
            raise ValueError("question must not be empty")
        if self._busy:
            raise ValueError("the assistant is still answering")
        subentry = self._ai.agent_subentry()
        if subentry is None:
            raise AIError("No AI provider that can use tools is set up")
        chat = self._chat(chat_id) if chat_id else self._new_chat()
        self._messages = chat["messages"]
        self._busy = True
        try:
            reply = await self._async_answer(
                text, page or {}, subentry, on_event or (lambda _e: None)
            )
            if not chat["title"]:
                chat["title"] = await self._async_title(text, reply["text"], subentry)
        except Exception:
            if not chat["messages"]:  # a conversation that never got an answer
                self._chats.pop(chat["id"], None)
            elif not chat["title"]:
                chat["title"] = fallback_title(text)
            raise
        finally:
            chat["updated"] = dt_util.utcnow().isoformat()
            self._busy = False
            self._save()
        return {"message": reply, "chat": self._summary(chat)}

    async def _async_answer(
        self,
        text: str,
        page: dict[str, Any],
        subentry: Any,
        emit: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        language = self._language()
        self._web = self._ai.can_search_web(Feature.AGENT)
        self._model = str(subentry.data.get("model") or subentry.title)
        self._cost, self._cost_known = 0.0, True
        self._sources = []
        tools = [*TOOLS, WEB_SEARCH] if self._web else list(TOOLS)
        open_plant = None
        if page.get("plant_id"):
            try:
                open_plant = self._data.manager.get_plant(str(page["plant_id"])).name
            except NotFoundError:
                open_plant = None
        system = prompts.system(
            language,
            garden=self._entry.title,
            today=dt_util.now().date(),
            view=str(page.get("view") or ""),
            plant=open_plant,
            web=self._web,
            plants=len(self._plants()),
        )
        question = {
            "id": ulid_now(),
            "role": "user",
            "text": text,
            "created": dt_util.utcnow().isoformat(),
        }
        messages: list[dict[str, Any]] = [*self._context(), {"role": "user", "text": text}]
        self._messages.append(question)
        actions: list[dict[str, Any]] = []
        steps: list[str] = []
        answer = ""
        model = self._model
        try:
            for _ in range(MAX_STEPS + 1):
                turn, cost = await self._ai.async_tool_turn(
                    Feature.AGENT, subentry, system=system, messages=messages, tools=tools
                )
                self._cost += cost or 0.0
                self._cost_known = self._cost_known and cost is not None
                model = turn.model
                answer = turn.text.strip() or answer
                if not turn.calls:
                    break
                messages.append(
                    {"role": "assistant", "text": turn.text, "calls": turn.calls, "raw": turn.raw}
                )
                results = []
                for call in turn.calls:
                    steps.append(call.name)
                    emit({"step": call.name})
                    content, error, action = await self._async_call(call)
                    if action is not None:
                        action = {"id": ulid_now(), "undone": False, **action}
                        actions.append(action)
                        emit({"action": {k: v for k, v in action.items() if k != "undo"}})
                    results.append(
                        {
                            "id": call.id,
                            "call_id": turn.extra.get("native_ids", {}).get(call.id),
                            "name": call.name,
                            "content": content,
                            "error": error,
                        }
                    )
                messages.append({"role": "tool", "results": results})
        except Exception:
            # the question stays in the history only with an answer
            self._messages.remove(question)
            if actions:  # what was done stays visible
                self._messages.append(question)
                self._messages.append(self._reply(prompts.FAILED[language], actions, steps, model))
                self._save()
            raise
        reply = self._reply(answer or prompts.NO_ANSWER[language], actions, steps, model)
        self._messages.append(reply)
        del self._messages[:-KEEP_MESSAGES]
        self._save()
        return self._public(reply)

    def _reply(
        self, text: str, actions: list[dict[str, Any]], steps: list[str], model: str
    ) -> dict[str, Any]:
        return {
            "id": ulid_now(),
            "role": "assistant",
            "text": text,
            "created": dt_util.utcnow().isoformat(),
            "actions": actions,
            "steps": steps,
            "sources": self._sources[:8],
            "model": model,
            "cost": self._ai.display_cost(self._cost) if self._cost_known else None,
        }

    # ------------------------------------------------------------ undo
    async def async_undo(self, action_id: str) -> dict[str, Any]:
        """Take an action of the agent back; returns the message it belongs to."""
        for chat in self._chats.values():
            for message in chat["messages"]:
                for action in message.get("actions", []):
                    if action["id"] == action_id:
                        if not action.get("undone"):
                            await self._async_revert(action["kind"], action["undo"])
                            action["undone"] = True
                            self._save()
                        return self._public(message)
        raise NotFoundError(action_id)

    async def _async_revert(self, kind: str, undo: dict[str, Any]) -> None:
        data = self._data
        try:
            if kind == "create_plant":
                await data.manager.async_delete_plant(undo["plant_id"])
            elif kind == "update_plant":
                await data.manager.async_update_plant(undo["plant_id"], undo["fields"])
            elif kind == "log_watering":
                await data.irrigation.async_delete_event(undo["event_id"])
            elif kind == "create_task":
                await data.care.async_delete_task(undo["task_id"])
            elif kind == "complete_task":
                if undo.get("next_id"):
                    await data.care.async_delete_task(undo["next_id"])
                await data.care.async_reopen_task(undo["task_id"])
            elif kind == "report_problem":
                await data.care.async_delete_problem(undo["problem_id"])
        except NotFoundError:
            _LOGGER.debug("Nothing left to undo for %s", kind)  # the user removed it already
