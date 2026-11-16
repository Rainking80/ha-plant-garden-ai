"""What a place on the plan offers a new plant: sun, soil, room and neighbours.

The facts go to the AI, which proposes plants for the place ("What fits here?").
No coordinates, names of people or entity ids are part of them.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
import math
from typing import Any

from .. import sun
from ..geometry import contains, crown_diameter
from ..models import Plant, PlantStatus, Shape, ShapeKind
from ..water_balance import SHELTER_KINDS

NEIGHBOUR_RADIUS_M = 4.0
MAX_NEIGHBOURS = 8
MAX_ROOM_M = 10.0
MAX_GARDEN_PLANTS = 40


def _area_at(shapes: Sequence[Shape], x: float, y: float) -> Shape | None:
    """The topmost area (not a zone, not the property boundary) under a place."""
    found = None
    for shape in sorted(shapes, key=lambda s: s.z):
        if shape.kind in (ShapeKind.ZONE, ShapeKind.BOUNDARY):
            continue
        if contains(shape.geometry, x, y):
            found = shape
    return found


def site_facts(
    x: float,
    y: float,
    *,
    plants: Sequence[Plant],
    shapes: Sequence[Shape],
    blockers: Sequence[sun.Obstacle],
    widths_cm: Mapping[str, float],
    heights_cm: Mapping[str, float],
    latitude: float,
    winter_low: float | None,
    today: date,
) -> dict[str, Any]:
    """Everything known about the place at (x, y)."""
    light = sun.place_sun(x, y, blockers, latitude)
    area = _area_at(shapes, x, y)
    soil = next(
        (
            shape.soil_type.value
            for shape in sorted(shapes, key=lambda s: -s.z)
            if shape.soil_type
            and shape.kind is not ShapeKind.ZONE
            and contains(shape.geometry, x, y)
        ),
        None,
    )
    neighbours: list[dict[str, Any]] = []
    room = MAX_ROOM_M
    for plant in plants:
        if plant.status is PlantStatus.REMOVED or plant.position is None:
            continue
        crown = crown_diameter(plant, widths_cm.get(plant.id))
        distance = math.hypot(plant.position.x - x, plant.position.y - y)
        room = min(room, max(distance - crown / 2, 0.0))
        if distance <= NEIGHBOUR_RADIUS_M:
            neighbours.append(
                {
                    "name": plant.name,
                    "scientific_name": plant.scientific_name,
                    "category": plant.category.value,
                    "distance_m": round(distance, 1),
                    "crown_m": round(crown, 1),
                    "height_m": round(sun.plant_height(plant, heights_cm.get(plant.id)), 1) or None,
                }
            )
    neighbours.sort(key=lambda n: n["distance_m"])
    present = sorted(
        {p.scientific_name or p.name for p in plants if p.status is not PlantStatus.REMOVED}
    )
    return {
        "sun_hours_season": light["season_hours"],
        "sun_hours_by_month": light["months"],
        "light": light["light"],
        "soil": soil,
        "area": {"kind": area.kind.value, "label": area.label} if area else None,
        "under_a_roof": any(
            shape.kind in SHELTER_KINDS and contains(shape.geometry, x, y) for shape in shapes
        ),
        "irrigated": any(
            shape.kind is ShapeKind.ZONE and contains(shape.geometry, x, y) for shape in shapes
        ),
        "free_radius_m": round(room, 1),
        "neighbours": [
            {k: v for k, v in n.items() if v is not None} for n in neighbours[:MAX_NEIGHBOURS]
        ],
        "garden_plants": present[:MAX_GARDEN_PLANTS],
        "coldest_night_last_year_c": winter_low,
        "hemisphere": "north" if latitude >= 0 else "south",
        "month": today.month,
    }


def planting_day(months: Sequence[int], today: date) -> date:
    """The next day to plant: today in a planting month, else the first of the next one."""
    if not months or today.month in months:
        return today
    for ahead in range(1, 13):
        month = (today.month - 1 + ahead) % 12 + 1
        if month in months:
            year = today.year + (today.month - 1 + ahead) // 12
            return date(year, month, 1)
    return today
