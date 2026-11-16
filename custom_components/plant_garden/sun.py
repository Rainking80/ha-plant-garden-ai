"""Sun and shade on the plan: hours of direct sun for plants and places.

Buildings, greenhouses, roofs, hedges and tall plants are prisms with a height.
For a place and a moment the sun shines when no prism stands between it and the
sun: the stretch from the place towards the sun, as long as the prism's shadow
(height / tan(elevation)), must not touch the prism's outline. Counted over a
clear day in steps of solar time, that gives the hours of direct sun. Clouds,
the terrain and anything outside the plan are not part of it.

Everything here is pure and blocking: call it in the executor.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
import math
from typing import Any

from .geometry import bounds, crown_diameter
from .models import Light, Plant, PlantCategory, PlantStatus, Shape, ShapeKind

Point = tuple[float, float]

# Heights in metres when the user gave none
DEFAULT_SHAPE_HEIGHT: dict[ShapeKind, float] = {
    ShapeKind.HOUSE: 6.0,
    ShapeKind.GREENHOUSE: 2.5,
    ShapeKind.ROOF: 2.5,
    ShapeKind.HEDGE: 1.8,
}
DEFAULT_PLANT_HEIGHT: dict[PlantCategory, float] = {
    PlantCategory.TREE: 6.0,
    PlantCategory.FRUIT: 3.0,
    PlantCategory.HEDGE: 1.8,
    PlantCategory.SHRUB: 1.5,
}
MIN_HEIGHT = 1.0  # lower things shade nothing worth counting
STEP_MIN = 20  # minutes of solar time between two looks at the sun
MIN_ELEVATION = 5.0  # degrees; a lower sun is weak and its shadows endless
MID_MONTH_DAY = (15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349)  # day of the year
CIRCLE_CORNERS = 16
FULL_SUN_HOURS = 6.0  # horticultural convention: full sun from 6 h, shade below 3 h
SHADE_HOURS = 3.0
MAP_CELLS = 40  # cells along the longer side of the sun map
MAP_MARGIN = 2.0  # metres around everything drawn


def sun_position(latitude: float, day_of_year: int, solar_hour: float) -> tuple[float, float]:
    """Elevation and compass azimuth (clockwise from north) of the sun, in degrees.

    `solar_hour` is local solar time (12 = the sun at its highest), so no time
    zone or longitude is needed to count the hours of a day.
    """
    declination = math.radians(23.44) * math.sin(math.radians(360 / 365 * (day_of_year - 81)))
    phi = math.radians(latitude)
    hour_angle = math.radians(15 * (solar_hour - 12))
    sin_elevation = math.sin(phi) * math.sin(declination) + math.cos(phi) * math.cos(
        declination
    ) * math.cos(hour_angle)
    elevation = math.asin(max(-1.0, min(1.0, sin_elevation)))
    azimuth = math.atan2(
        math.sin(hour_angle),
        math.cos(hour_angle) * math.sin(phi) - math.tan(declination) * math.cos(phi),
    )
    return math.degrees(elevation), (math.degrees(azimuth) + 180) % 360


@dataclass(slots=True, frozen=True)
class Obstacle:
    """Something that casts a shadow: its outline, its height and whose it is."""

    outline: tuple[Point, ...]
    height: float
    plant_id: str | None = None
    cx: float = 0.0
    cy: float = 0.0
    radius: float = 0.0  # all of the outline lies within this distance of (cx, cy)


def _outline(geometry: Mapping[str, Any]) -> tuple[Point, ...] | None:
    kind = geometry["type"]
    if kind == "circle":
        return tuple(
            (
                geometry["cx"] + geometry["r"] * math.cos(2 * math.pi * i / CIRCLE_CORNERS),
                geometry["cy"] + geometry["r"] * math.sin(2 * math.pi * i / CIRCLE_CORNERS),
            )
            for i in range(CIRCLE_CORNERS)
        )
    if kind == "rect":
        angle = math.radians(float(geometry.get("rotation", 0)))
        corners = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, ly = sx * geometry["w"] / 2, sy * geometry["h"] / 2
            corners.append(
                (
                    geometry["cx"] + lx * math.cos(angle) - ly * math.sin(angle),
                    geometry["cy"] + lx * math.sin(angle) + ly * math.cos(angle),
                )
            )
        return tuple(corners)
    if kind == "polygon":
        return tuple((float(x), float(y)) for x, y in geometry["points"])
    return None  # sprinklers and drip lines cast no shadow


def _obstacle(outline: tuple[Point, ...], height: float, plant_id: str | None) -> Obstacle:
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    radius = max(math.hypot(x - cx, y - cy) for x, y in outline)
    return Obstacle(outline=outline, height=height, plant_id=plant_id, cx=cx, cy=cy, radius=radius)


def plant_height(plant: Plant, measured_cm: float | None) -> float:
    """Height of a plant in metres: measured, else typical for trees, shrubs and hedges."""
    if measured_cm:
        return measured_cm / 100
    return DEFAULT_PLANT_HEIGHT.get(plant.category, 0.0)


def obstacles(
    shapes: Iterable[Shape],
    plants: Iterable[Plant],
    heights_cm: Mapping[str, float],
    widths_cm: Mapping[str, float],
) -> list[Obstacle]:
    """Everything on the plan that is tall enough to cast a shadow.

    Areas with a height (their own, else the default of their kind); an area that
    is a plant (a hedge) takes the plant's measured height when it has none.
    Plants at a position cast the shadow of their crown circle.
    """
    plants = [plant for plant in plants if plant.status is not PlantStatus.REMOVED]
    by_id = {plant.id: plant for plant in plants}
    result: list[Obstacle] = []
    drawn: set[str] = set()
    for shape in shapes:
        if shape.kind is ShapeKind.ZONE:
            continue
        owner = by_id.get(shape.plant_id) if shape.plant_id else None
        if owner is not None:
            drawn.add(owner.id)
        height = shape.height_m
        if height is None and owner is not None:
            height = plant_height(owner, heights_cm.get(owner.id))
        if not height:
            height = DEFAULT_SHAPE_HEIGHT.get(shape.kind, 0.0)
        outline = _outline(shape.geometry)
        if outline and height >= MIN_HEIGHT:
            result.append(_obstacle(outline, height, owner.id if owner else None))
    for plant in plants:
        if plant.id in drawn or plant.position is None:
            continue
        height = plant_height(plant, heights_cm.get(plant.id))
        if height < MIN_HEIGHT:
            continue
        circle = {
            "type": "circle",
            "cx": plant.position.x,
            "cy": plant.position.y,
            "r": crown_diameter(plant, widths_cm.get(plant.id)) / 2,
        }
        outline = _outline(circle)
        if outline:
            result.append(_obstacle(outline, height, plant.id))
    return result


def _inside(outline: Sequence[Point], x: float, y: float) -> bool:
    inside = False
    j = len(outline) - 1
    for i, (ax, ay) in enumerate(outline):
        bx, by = outline[j]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
        j = i
    return inside


def _crosses(a: Point, b: Point, c: Point, d: Point) -> bool:
    """Do the segments a-b and c-d cross?"""

    def side(p: Point, q: Point, r: Point) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    return (side(a, b, c) > 0) != (side(a, b, d) > 0) and (side(c, d, a) > 0) != (side(c, d, b) > 0)


def _shades(obstacle: Obstacle, at: Point, look: tuple[float, float, float]) -> bool:
    """Is the place in the shadow of the obstacle for this look at the sun?

    A look is the direction towards the sun (dx, dy) and the length of a shadow
    per metre of height.
    """
    x, y = at
    dx, dy, reach = look
    length = obstacle.height * reach
    # quick: the obstacle is nowhere near the stretch towards the sun
    t = max(0.0, min(length, (obstacle.cx - x) * dx + (obstacle.cy - y) * dy))
    if math.hypot(obstacle.cx - (x + t * dx), obstacle.cy - (y + t * dy)) > obstacle.radius:
        return False
    outline = obstacle.outline
    if _inside(outline, x, y):
        return True
    end = (x + dx * length, y + dy * length)
    return any(
        _crosses(at, end, outline[i], outline[(i + 1) % len(outline)]) for i in range(len(outline))
    )


def _sky(latitude: float, day_of_year: int) -> list[tuple[float, float, float]]:
    """The looks at the sun over a day: direction (dx, dy) and shadow length per metre."""
    looks = []
    for step in range(24 * 60 // STEP_MIN):
        elevation, azimuth = sun_position(latitude, day_of_year, (step + 0.5) * STEP_MIN / 60)
        if elevation < MIN_ELEVATION:
            continue
        rad = math.radians(azimuth)
        # plan: x east, y south; north is up
        looks.append((math.sin(rad), -math.cos(rad), 1 / math.tan(math.radians(elevation))))
    return looks


def _hours(
    x: float,
    y: float,
    blockers: Sequence[Obstacle],
    sky: Sequence[tuple[float, float, float]],
) -> float:
    at = (x, y)
    sunny = sum(1 for look in sky if not any(_shades(obstacle, at, look) for obstacle in blockers))
    return round(sunny * STEP_MIN / 60, 1)


def sun_hours(
    x: float,
    y: float,
    blockers: Sequence[Obstacle],
    latitude: float,
    month: int,
    *,
    own: str | None = None,
) -> float:
    """Hours of direct sun at (x, y) on a clear day in the middle of the month (1-12).

    `own`: the plant standing there; its own crown does not shade it.
    """
    others = [o for o in blockers if own is None or o.plant_id != own]
    return _hours(x, y, others, _sky(latitude, MID_MONTH_DAY[month - 1]))


def season_months(latitude: float) -> tuple[int, ...]:
    """The growing season: April to September north of the equator, else October to March."""
    return (4, 5, 6, 7, 8, 9) if latitude >= 0 else (10, 11, 12, 1, 2, 3)


def light_class(hours: float) -> Light:
    if hours >= FULL_SUN_HOURS:
        return Light.FULL_SUN
    if hours >= SHADE_HOURS:
        return Light.PARTIAL_SHADE
    return Light.SHADE


def place_sun(
    x: float,
    y: float,
    blockers: Sequence[Obstacle],
    latitude: float,
    *,
    own: str | None = None,
) -> dict[str, Any]:
    """Sun of one place: hours per month, the season's mean and what that is called."""
    others = [o for o in blockers if own is None or o.plant_id != own]
    months = [_hours(x, y, others, _sky(latitude, MID_MONTH_DAY[month])) for month in range(12)]
    season = season_months(latitude)
    mean = round(sum(months[m - 1] for m in season) / len(season), 1)
    return {"months": months, "season_hours": mean, "light": light_class(mean).value}


def plant_anchor(plant: Plant, shapes: Iterable[Shape]) -> Point | None:
    """Where a plant is: its position, else the middle of its (first) area."""
    if plant.position is not None:
        return plant.position.x, plant.position.y
    for shape in shapes:
        if shape.plant_id == plant.id and shape.kind is not ShapeKind.ZONE:
            min_x, min_y, max_x, max_y = bounds(shape.geometry)
            return (min_x + max_x) / 2, (min_y + max_y) / 2
    return None


def plants_sun(
    plants: Iterable[Plant],
    shapes: Sequence[Shape],
    blockers: Sequence[Obstacle],
    latitude: float,
) -> dict[str, dict[str, Any]]:
    """Sun of every plant on the plan."""
    result = {}
    for plant in plants:
        if plant.status is PlantStatus.REMOVED:
            continue
        at = plant_anchor(plant, shapes)
        if at is not None:
            result[plant.id] = place_sun(*at, blockers, latitude, own=plant.id)
    return result


def plan_bounds(
    shapes: Iterable[Shape], plants: Iterable[Plant]
) -> tuple[float, float, float, float] | None:
    """Everything drawn, with a margin; None for an empty plan."""
    boxes = [bounds(shape.geometry) for shape in shapes]
    boxes += [
        (p.position.x, p.position.y, p.position.x, p.position.y)
        for p in plants
        if p.position is not None
    ]
    if not boxes:
        return None
    return (
        min(b[0] for b in boxes) - MAP_MARGIN,
        min(b[1] for b in boxes) - MAP_MARGIN,
        max(b[2] for b in boxes) + MAP_MARGIN,
        max(b[3] for b in boxes) + MAP_MARGIN,
    )


def sun_map(
    box: tuple[float, float, float, float],
    blockers: Sequence[Obstacle],
    latitude: float,
    month: int,
) -> dict[str, Any]:
    """Hours of direct sun over the plan as a grid of square cells, row by row from the north."""
    min_x, min_y, max_x, max_y = box
    cell = max(max_x - min_x, max_y - min_y) / MAP_CELLS
    cols = max(1, math.ceil((max_x - min_x) / cell))
    rows = max(1, math.ceil((max_y - min_y) / cell))
    sky = _sky(latitude, MID_MONTH_DAY[month - 1])
    hours = [
        _hours(min_x + (col + 0.5) * cell, min_y + (row + 0.5) * cell, blockers, sky)
        for row in range(rows)
        for col in range(cols)
    ]
    return {
        "month": month,
        "x": round(min_x, 2),
        "y": round(min_y, 2),
        "cell": round(cell, 3),
        "cols": cols,
        "rows": rows,
        "hours": hours,
        "day_hours": round(len(sky) * STEP_MIN / 60, 1),
    }
