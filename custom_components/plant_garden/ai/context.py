"""Compact, deterministic context for the assistant (spec 4.7).

Season, hemisphere and a rough climate from the stored weather (never
coordinates), the plant profile with where each value came from, measurements,
the water balance of the last 14 days, irrigation, open problems and tasks. The
JSON is shortened step by step until it fits the token budget of the feature,
always in the same order, so the same garden gives the same context.
"""

from __future__ import annotations

from datetime import date, timedelta
import json
from typing import Any

from homeassistant.util import dt as dt_util

from ..care import CareManager, TaskStatus
from ..garden import GardenManager
from ..models import Plant
from ..water import WaterData
from .pricing import estimate_tokens

BALANCE_DAYS = 14
WEATHER_PAST = 7
WEATHER_AHEAD = 3


def _round(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def season_text(latitude: float, today: date) -> str:
    """Month and hemisphere, the only location hint the AI gets."""
    hemisphere = "north" if latitude >= 0 else "south"
    return f"{today.strftime('%B')}, {hemisphere}ern hemisphere"


def climate(data: WaterData | None, today: date) -> dict[str, Any] | None:
    """Rough climate of the last 30 days from the stored weather."""
    if data is None:
        return None
    days = [w for w in data.weather if today - timedelta(days=30) <= w.day < today]
    lows = [w.t_min for w in days if w.t_min is not None]
    highs = [w.t_max for w in days if w.t_max is not None]
    rain = [w.precip_mm for w in days if w.precip_mm is not None]
    if not lows and not rain:
        return None
    return {
        "days": len(days),
        "t_min_avg": _round(sum(lows) / len(lows)) if lows else None,
        "t_max_avg": _round(sum(highs) / len(highs)) if highs else None,
        "t_min_lowest": _round(min(lows)) if lows else None,
        "rain_mm": _round(sum(rain)) if rain else None,
    }


def weather(data: WaterData | None, today: date) -> list[list[Any]]:
    """[day, t_min, t_max, rain mm, ET₀ mm, forecast] for a week back and three ahead."""
    if data is None:
        return []
    return [
        [
            w.day.isoformat(),
            _round(w.t_min),
            _round(w.t_max),
            _round(w.precip_mm),
            _round(w.et0_mm),
            w.day > today,
        ]
        for w in data.weather
        if today - timedelta(days=WEATHER_PAST) <= w.day <= today + timedelta(days=WEATHER_AHEAD)
    ]


def plant_profile(plant: Plant, today: date) -> dict[str, Any]:
    """The plant's fields, each with its source when it is not the user's own value."""
    values: dict[str, Any] = {
        "name": plant.name,
        "scientific_name": plant.scientific_name,
        "variety": plant.variety,
        "category": plant.category.value,
        "location": plant.location_type.value,
        "light": plant.light.value if plant.light else None,
        "water_need": plant.water_need.value if plant.water_need else None,
        "soil": plant.soil_type.value if plant.soil_type else None,
        "status": plant.status.value,
        "age_months": plant.age_months(today),
        "planted_on": plant.planted_on.isoformat() if plant.planted_on else None,
        "min_temperature_c": plant.min_temperature_c,
        "root_depth_cm": plant.root_depth_cm,
        "crown_m": plant.crown_diameter_m,
    }
    sources = {
        key: f"{src.source.value} {src.confidence:.0%}" if src.confidence else src.source.value
        for key, src in plant.sources.items()
        if src.source.value != "user" and key in values
    }
    profile = {k: v for k, v in values.items() if v is not None}
    if sources:
        profile["sources"] = sources
    return profile


def _trim(context: dict[str, Any], budget: int, order: list[tuple[str, ...]]) -> dict[str, Any]:
    """Shorten lists (oldest entries first), then drop sections, until it fits."""

    def size() -> int:
        return estimate_tokens(json.dumps(context, ensure_ascii=False), 0)

    for path in order:
        parent: Any = context
        for key in path[:-1]:
            parent = parent.get(key) if isinstance(parent, dict) else None
        if not isinstance(parent, dict) or path[-1] not in parent:
            continue
        items = parent[path[-1]]
        while isinstance(items, list) and len(items) > 1 and size() > budget:
            items.pop(0)
        if size() > budget:
            del parent[path[-1]]
        if size() <= budget:
            break
    return context


async def async_build(
    manager: GardenManager,
    care: CareManager,
    water: WaterData | None,
    *,
    plant_id: str | None,
    budget: int,
    latitude: float,
) -> tuple[dict[str, Any], dict[str, str]]:
    """The context and the plant references used in it (ref -> plant id)."""
    today = dt_util.now().date()
    plants = sorted(manager.plants, key=lambda p: (p.name.casefold(), p.id))
    refs = {f"p{i + 1}": plant.id for i, plant in enumerate(plants)}
    ref_of = {pid: ref for ref, pid in refs.items()}
    tasks = [t for t in await care.async_tasks(plant_id) if t.status is TaskStatus.OPEN]
    problems = await care.async_problems(plant_id, active_only=True)
    context: dict[str, Any] = {
        "today": today.isoformat(),
        "season": season_text(latitude, today),
        "climate_30d": climate(water, today),
        "weather": weather(water, today),
    }
    if plant_id is not None:
        plant = manager.get_plant(plant_id)
        context["plant"] = {"ref": ref_of.get(plant.id), **plant_profile(plant, today)}
        measurements = await manager.async_list_measurements(plant_id)
        context["measurements"] = [
            [m.measured_on.isoformat(), m.height_cm, m.width_cm, m.source.value]
            for m in measurements[-8:]
        ]
        state = water.plants.get(plant_id) if water else None
        if state is not None:
            context["water"] = {
                "soil": state.soil.soil,
                "root_depth_m": state.soil.root_depth_m,
                "taw_mm": state.soil.taw,
                "raw_mm": state.soil.raw,
                "depletion_mm": state.depletion,
                "needs_water": state.needs_water,
                "sheltered": state.soil.sheltered,
                "frost_c": state.frost,
                # [day, rain, irrigation, ETc, depletion at the end of the day]
                "days": [
                    [d.day.isoformat(), d.rain, d.irrigation, d.etc, d.depletion]
                    for d in state.days[-BALANCE_DAYS:]
                ],
            }
        events = await manager.async_recent_events(plant_id=plant_id, limit=8)
        context["irrigation"] = [
            [
                dt_util.as_local(e.ended_at).date().isoformat(),
                e.source.value,
                round(sum(p.liters for p in e.plants if p.plant_id == plant_id), 1),
            ]
            for e in reversed(events)
        ]
    else:
        context["plants"] = [
            {
                "ref": ref_of[p.id],
                "name": p.name,
                "category": p.category.value,
                "status": p.status.value,
                **(
                    {
                        "depletion_mm": water.plants[p.id].depletion,
                        "raw_mm": water.plants[p.id].soil.raw,
                    }
                    if water and p.id in water.plants
                    else {}
                ),
                **({"scientific_name": p.scientific_name} if p.scientific_name else {}),
            }
            for p in plants
        ]
    context["problems"] = [
        {
            "plant": ref_of.get(p.plant_id),
            "title": p.title,
            "status": p.status.value,
            "since": p.observed_on.isoformat(),
            "diagnosis": (p.diagnosis or {}).get("summary"),
        }
        for p in problems[:10]
    ]
    context["open_tasks"] = [
        {
            "plant": ref_of.get(t.plant_id) if t.plant_id else None,
            "kind": t.kind.value,
            "title": t.title,
            "due": t.due.isoformat() if t.due else None,
        }
        for t in tasks[:30]
    ]
    context = {k: v for k, v in context.items() if v not in (None, [], {})}
    order = [
        ("weather",),
        ("irrigation",),
        ("measurements",),
        ("water", "days"),
        ("open_tasks",),
        ("plants",),
        ("problems",),
        ("climate_30d",),
    ]
    return _trim(context, budget, order), refs
