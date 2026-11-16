"""Talk to the garden: Plant Garden as an API for Home Assistant's voice assistants.

A conversation agent (Assist with a language model) that has this API switched
on can answer "what needs water today?" and act on "I watered the tomatoes with
five litres" or "remind me to prune the roses on Saturday". The tools read and
write the garden; they call no AI themselves and switch nothing.

What the agent's model gets to see is what the tools return: plant names and
garden data, never notes, coordinates or entity ids. Nothing is sent unless the
user selects this API for an agent.
"""

from __future__ import annotations

from datetime import timedelta
import importlib
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import llm
from homeassistant.util import dt as dt_util

from .care import TaskKind, TaskStatus
from .const import DOMAIN
from .models import Plant, PlantStatus
from .runtime import PlantGardenConfigEntry, get_loaded_entry

API_ID = DOMAIN
API_NAME = "Plant Garden"
MAX_NAMES = 80
MAX_TASKS = 25

# Home Assistant's schema library (probatio, in older versions voluptuous): the
# tools must use the one the LLM helper serialises.
_schema = importlib.import_module(type(llm.Tool.parameters).__module__.split(".")[0])

API_PROMPT = """You can read and update the user's garden with the Plant Garden tools.
- Use garden_overview for questions about what to do today: watering, frost, due tasks, problems.
- Plants are addressed by their name. Use the names exactly as listed below; if the user's \
wording fits several plants, ask which one is meant.
- Litres are per plant. Only log a watering or complete a task the user says was done.
- Water deficits are millimetres of soil water used up; a plant needs water when \
needs_water is true. Rain expected soon may make watering unnecessary.
- Nothing here switches valves or pumps."""


class ToolError(Exception):
    """A tool could not do what was asked; the text goes back to the model."""


def _result(data: dict[str, Any], *, error: bool = False) -> Any:
    """A tool result in the form this Home Assistant version expects."""
    if hasattr(llm, "ToolResult"):
        return llm.ToolResult(data=data, error=error)
    return data  # before 2026.10 tools answered with the plain object


def _annotations(*, read_only: bool) -> Any:
    """Tools stay inside Home Assistant; reading ones change nothing."""
    if not hasattr(llm, "ToolAnnotations"):
        return None
    return llm.ToolAnnotations(
        read_only=read_only, destructive=False, idempotent=read_only, open_world=False
    )


def _entry(hass: HomeAssistant) -> PlantGardenConfigEntry:
    entry = get_loaded_entry(hass)
    if entry is None:
        raise ToolError("Plant Garden is not set up")
    return entry


def _plants(entry: PlantGardenConfigEntry) -> list[Plant]:
    return [p for p in entry.runtime_data.manager.plants if p.status is not PlantStatus.REMOVED]


def find_plant(plants: list[Plant], name: str) -> Plant:
    """The plant a spoken name means: exact, else the only one containing it."""
    wanted = name.strip().casefold()
    if not wanted:
        raise ToolError("Which plant?")
    exact = [p for p in plants if p.name.casefold() == wanted]
    if len(exact) == 1:
        return exact[0]
    partial = exact or [
        p
        for p in plants
        if wanted in p.name.casefold()
        or (p.scientific_name and wanted in p.scientific_name.casefold())
    ]
    if len(partial) == 1:
        return partial[0]
    if partial:
        names = ", ".join(sorted(p.name for p in partial)[:10])
        raise ToolError(f'Several plants match "{name}": {names}. Ask which one is meant.')
    names = ", ".join(sorted(p.name for p in plants)[:MAX_NAMES])
    raise ToolError(f'No plant is called "{name}". The plants are: {names}')


def _task_dict(task: Any, names: dict[str, str]) -> dict[str, Any]:
    return {
        "title": task.title,
        "kind": task.kind.value,
        "plant": names.get(task.plant_id or ""),
        "due": task.due.isoformat() if task.due else None,
    }


class GardenTool(llm.Tool):
    """Base of the tools: errors become answers the model can pass on."""

    integration = DOMAIN
    read_only = False

    def __init__(self) -> None:
        annotations = _annotations(read_only=self.read_only)
        if annotations is not None:
            self.annotations = annotations

    async def async_call(
        self, hass: HomeAssistant, tool_input: llm.ToolInput, llm_context: llm.LLMContext
    ) -> Any:
        try:
            return _result(await self._async_run(hass, tool_input.tool_args))
        except ToolError as err:
            return _result({"error": str(err)}, error=True)

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class OverviewTool(GardenTool):
    name = "garden_overview"
    title = "Garden overview"
    description = (
        "What the garden needs now: plants that need water today and in the coming days, "
        "frost warnings, weather warnings, open and overdue tasks, plants with a problem, "
        "rain today and tomorrow."
    )
    read_only = True

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        entry = _entry(hass)
        data = entry.runtime_data
        plants = _plants(entry)
        names = {p.id: p.name for p in plants}
        today = dt_util.now().date()
        water = data.water.data
        states = water.plants if water else {}
        thirsty = [
            {"plant": names[pid], "deficit_mm": round(state.depletion)}
            for pid, state in states.items()
            if pid in names and state.needs_water
        ]
        coming: dict[str, list[str]] = {}
        for pid, state in states.items():
            for day in state.outlook:
                if pid in names and day.water and day.day > today:
                    coming.setdefault(day.day.isoformat(), []).append(names[pid])
        frost = [
            {"plant": names[pid], "lowest_c": state.frost}
            for pid, state in states.items()
            if pid in names and state.frost is not None
        ]
        tasks = [t for t in await data.care.async_tasks() if t.status is TaskStatus.OPEN]
        due = sorted((t for t in tasks if t.due and t.due <= today), key=lambda t: t.due or today)
        soon = sorted(
            (t for t in tasks if t.due and today < t.due <= today + timedelta(days=7)),
            key=lambda t: t.due or today,
        )
        problems = await data.care.async_problems(active_only=True)
        here, tomorrow = (
            (water.day(today), water.day(today + timedelta(days=1))) if water else (None, None)
        )
        return {
            "date": today.isoformat(),
            "needs_water_today": sorted(thirsty, key=lambda item: -item["deficit_mm"]),
            "needs_water_soon": dict(sorted(coming.items())),
            "frost_expected": frost,
            "weather_warnings": [
                {
                    "kind": alert["kind"],
                    "day": alert["day"],
                    "plants": [names[pid] for pid in alert.get("plants", []) if pid in names][:20],
                }
                for alert in data.alerts.summary()
            ],
            "tasks_due": [_task_dict(t, names) for t in due[:MAX_TASKS]],
            "tasks_this_week": [_task_dict(t, names) for t in soon[:MAX_TASKS]],
            "problems": [
                {
                    "plant": names.get(p.plant_id),
                    "title": p.title,
                    "since": p.observed_on.isoformat(),
                }
                for p in problems
            ],
            "rain_today_mm": here.precip_mm if here else None,
            "rain_tomorrow_mm": tomorrow.precip_mm if tomorrow else None,
            "plant_count": len(plants),
        }


class PlantInfoTool(GardenTool):
    name = "plant_info"
    title = "Plant details"
    description = (
        "Details of one plant: species, care hints, soil water, last watering, "
        "open tasks and problems."
    )
    read_only = True
    parameters = _schema.Schema({_schema.Required("plant", description="Name of the plant"): str})

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        entry = _entry(hass)
        data = entry.runtime_data
        plant = find_plant(_plants(entry), args["plant"])
        today = dt_util.now().date()
        water = data.water.data
        state = water.plants.get(plant.id) if water else None
        watered = data.irrigation.summary()["plants"].get(plant.id, {})
        tasks = [t for t in await data.care.async_tasks(plant.id) if t.status is TaskStatus.OPEN]
        problems = await data.care.async_problems(plant.id, active_only=True)
        info: dict[str, Any] = {
            "name": plant.name,
            "scientific_name": plant.scientific_name,
            "variety": plant.variety,
            "category": plant.category.value,
            "status": plant.status.value,
            "light": plant.light.value if plant.light else None,
            "water_need": plant.water_need.value if plant.water_need else None,
            "frost_limit_c": plant.min_temperature_c,
            "age_months": plant.age_months(today),
            "care": {
                "watering": plant.care_water,
                "fertilizing": plant.care_fertilize,
                "pruning": plant.care_prune,
            },
            "water_today_l": watered.get("today_l"),
            "last_watering": watered.get("last_watering"),
            "open_tasks": [_task_dict(t, {plant.id: plant.name}) for t in tasks[:MAX_TASKS]],
            "problems": [p.title for p in problems],
        }
        if state is not None:
            info["soil_water"] = {
                "needs_water": state.needs_water,
                "deficit_mm": round(state.depletion, 1),
                "capacity_mm": state.soil.taw,
                "measured_by_sensor": state.model_depletion is not None,
                "next_watering_days": [d.day.isoformat() for d in state.outlook if d.water][:3],
                "frost_expected_c": state.frost,
            }
        return {key: value for key, value in info.items() if value not in (None, [], {})}


class LogWateringTool(GardenTool):
    name = "log_watering"
    title = "Log a watering"
    description = (
        "Record that the user watered one or more plants by hand, with the litres each "
        "plant received. Only for watering that has happened."
    )
    parameters = _schema.Schema(
        {
            _schema.Required("plants", description="Names of the watered plants"): [str],
            _schema.Required("liters", description="Litres each plant received"): _schema.All(
                _schema.Coerce(float), _schema.Range(min=0.05, max=1000)
            ),
        }
    )

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        entry = _entry(hass)
        plants = _plants(entry)
        found = [find_plant(plants, name) for name in args["plants"]]
        if not found:
            raise ToolError("Which plants were watered?")
        liters = float(args["liters"])
        await entry.runtime_data.irrigation.async_log_watering(
            {plant.id: liters for plant in found}, note="Assist"
        )
        return {"logged": [plant.name for plant in found], "liters_each": liters}


class CreateTaskTool(GardenTool):
    name = "create_task"
    title = "Create a garden task"
    description = (
        "Add a task to the garden's to-do list, optionally for one plant and with a due "
        "day given as days from today (0 = today)."
    )
    parameters = _schema.Schema(
        {
            _schema.Required("title", description="What to do"): _schema.All(
                str, _schema.Length(min=1, max=200)
            ),
            _schema.Optional("plant", description="Name of the plant it is for"): str,
            _schema.Optional("kind", description="Kind of work"): _schema.In(
                [kind.value for kind in TaskKind]
            ),
            _schema.Optional("due_in_days", description="Days from today"): _schema.All(
                _schema.Coerce(int), _schema.Range(min=0, max=730)
            ),
        }
    )

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        entry = _entry(hass)
        fields: dict[str, Any] = {"title": args["title"], "kind": args.get("kind") or "other"}
        plant = find_plant(_plants(entry), args["plant"]) if args.get("plant") else None
        if plant is not None:
            fields["plant_id"] = plant.id
        if args.get("due_in_days") is not None:
            fields["due"] = dt_util.now().date() + timedelta(days=int(args["due_in_days"]))
        task = await entry.runtime_data.care.async_create_task(fields)
        return {
            "created": task.title,
            "plant": plant.name if plant else None,
            "due": task.due.isoformat() if task.due else None,
        }


class CompleteTaskTool(GardenTool):
    name = "complete_task"
    title = "Complete a garden task"
    description = (
        "Mark an open task as done. Give its title (or part of it) and, if several "
        "plants have such a task, the plant."
    )
    parameters = _schema.Schema(
        {
            _schema.Required("title", description="Title of the task, or part of it"): str,
            _schema.Optional("plant", description="Name of the plant"): str,
        }
    )

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        entry = _entry(hass)
        care = entry.runtime_data.care
        plants = _plants(entry)
        names = {p.id: p.name for p in plants}
        plant = find_plant(plants, args["plant"]) if args.get("plant") else None
        wanted = args["title"].strip().casefold()
        tasks = [
            t
            for t in await care.async_tasks(plant.id if plant else None)
            if t.status is TaskStatus.OPEN and wanted in t.title.casefold()
        ]
        exact = [t for t in tasks if t.title.casefold() == wanted]
        if len(exact) == 1:
            tasks = exact
        if not tasks:
            raise ToolError(f'No open task matches "{args["title"]}".')
        if len(tasks) > 1:
            listed = "; ".join(
                f"{t.title} ({names.get(t.plant_id or '', 'garden')})" for t in tasks[:10]
            )
            raise ToolError(f"Several open tasks match: {listed}. Ask which one is meant.")
        task = tasks[0]
        following = await care.async_complete_task(task.id)
        return {
            "completed": task.title,
            "plant": names.get(task.plant_id or ""),
            "next_due": following.due.isoformat() if following and following.due else None,
        }


class ReportProblemTool(GardenTool):
    name = "report_problem"
    title = "Report a plant problem"
    description = "Open a problem for a plant the user says looks ill, damaged or infested."
    parameters = _schema.Schema(
        {
            _schema.Required("plant", description="Name of the plant"): str,
            _schema.Required("title", description="What is wrong, in a few words"): _schema.All(
                str, _schema.Length(min=1, max=120)
            ),
        }
    )

    async def _async_run(self, hass: HomeAssistant, args: dict[str, Any]) -> dict[str, Any]:
        entry = _entry(hass)
        plant = find_plant(_plants(entry), args["plant"])
        problem = await entry.runtime_data.care.async_create_problem(plant.id, args["title"])
        return {"reported": problem.title, "plant": plant.name}


class PlantGardenAPI(llm.API):
    """The garden's tools, with the plant names in the prompt."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass=hass, id=API_ID, name=API_NAME)
        # nothing about the tools depends on the request: build them once
        self._tools: list[llm.Tool] = [
            OverviewTool(),
            PlantInfoTool(),
            LogWateringTool(),
            CreateTaskTool(),
            CompleteTaskTool(),
            ReportProblemTool(),
        ]

    async def async_get_api_instance(self, llm_context: llm.LLMContext) -> llm.APIInstance:
        entry = get_loaded_entry(self.hass)
        names = sorted(p.name for p in _plants(entry))[:MAX_NAMES] if entry else []
        prompt = API_PROMPT + ("\nThe plants: " + ", ".join(names) if names else "")
        return llm.APIInstance(
            api=self, api_prompt=prompt, llm_context=llm_context, tools=self._tools
        )


@callback
def async_register_llm_api(hass: HomeAssistant) -> CALLBACK_TYPE:
    """Offer the garden to conversation agents; returns the callback to withdraw it."""
    return llm.async_register_api(hass, PlantGardenAPI(hass))
