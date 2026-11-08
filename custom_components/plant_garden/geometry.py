"""Plan geometry: point-in-shape, areas and how much of a plant an irrigation zone reaches.

Geometries are the dicts stored on shapes (see models.Shape). The panel has the
same logic in frontend/src/util/geometry.ts and util/coverage.ts; both sample
the same grid, so they agree on which plants a zone covers.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
import math
from typing import Any

from .models import Plant, PlantCategory, Shape, ShapeKind

Geometry = dict[str, Any]

# Typical crown diameter in metres when nothing better is known
# (same table as DEFAULT_CROWN in the panel).
DEFAULT_CROWN: dict[PlantCategory, float] = {
    PlantCategory.TREE: 4,
    PlantCategory.SHRUB: 1.2,
    PlantCategory.HEDGE: 1,
    PlantCategory.FRUIT: 1.5,
    PlantCategory.CLIMBER: 0.6,
    PlantCategory.PERENNIAL: 0.5,
    PlantCategory.GRASS: 0.6,
    PlantCategory.LAWN: 1,
    PlantCategory.POTTED: 0.6,
    PlantCategory.VEGETABLE: 0.4,
    PlantCategory.HERB: 0.3,
    PlantCategory.ANNUAL: 0.3,
    PlantCategory.SUCCULENT: 0.3,
    PlantCategory.BULB: 0.2,
    PlantCategory.OTHER: 0.5,
}

SAMPLES = 16  # grid of SAMPLES x SAMPLES points over a footprint's bounding box
MIN_SHARE = 0.01  # smaller overlaps are rounding noise at the edge of a zone


def crown_diameter(plant: Plant, width_cm: float | None = None) -> float:
    """Diameter drawn on the plan: explicit plan size, else measured width, else typical."""
    if plant.crown_diameter_m:
        return plant.crown_diameter_m
    if width_cm:
        return width_cm / 100
    return DEFAULT_CROWN.get(plant.category, 0.5)


def _to_rect_local(g: Geometry, x: float, y: float) -> tuple[float, float]:
    angle = math.radians(-float(g.get("rotation", 0)))
    dx, dy = x - g["cx"], y - g["cy"]
    return (
        dx * math.cos(angle) - dy * math.sin(angle),
        dx * math.sin(angle) + dy * math.cos(angle),
    )


def _point_in_polygon(points: list[list[float]], x: float, y: float) -> bool:
    inside = False
    j = len(points) - 1
    for i, (ax, ay) in enumerate(points):
        bx, by = points[j]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
        j = i
    return inside


def contains(g: Geometry, x: float, y: float) -> bool:
    if g["type"] == "circle":
        return bool(math.hypot(x - g["cx"], y - g["cy"]) <= g["r"])
    if g["type"] == "rect":
        lx, ly = _to_rect_local(g, x, y)
        return bool(abs(lx) <= g["w"] / 2 and abs(ly) <= g["h"] / 2)
    return _point_in_polygon(g["points"], x, y)


def area(g: Geometry) -> float:
    """Area in m²."""
    if g["type"] == "circle":
        return float(math.pi * g["r"] ** 2)
    if g["type"] == "rect":
        return float(g["w"] * g["h"])
    points = g["points"]
    total = 0.0
    for i, (x1, y1) in enumerate(points):
        x2, y2 = points[(i + 1) % len(points)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def bounds(g: Geometry) -> tuple[float, float, float, float]:
    """min x, min y, max x, max y."""
    if g["type"] == "circle":
        return g["cx"] - g["r"], g["cy"] - g["r"], g["cx"] + g["r"], g["cy"] + g["r"]
    if g["type"] == "rect":
        corners = []
        angle = math.radians(float(g.get("rotation", 0)))
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, ly = sx * g["w"] / 2, sy * g["h"] / 2
            corners.append(
                (
                    g["cx"] + lx * math.cos(angle) - ly * math.sin(angle),
                    g["cy"] + lx * math.sin(angle) + ly * math.cos(angle),
                )
            )
        xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    else:
        xs, ys = [p[0] for p in g["points"]], [p[1] for p in g["points"]]
    return min(xs), min(ys), max(xs), max(ys)


def sample_points(g: Geometry) -> list[tuple[float, float]]:
    """Evenly spread points inside a geometry (centres of a SAMPLES² grid)."""
    min_x, min_y, max_x, max_y = bounds(g)
    step_x = (max_x - min_x) / SAMPLES
    step_y = (max_y - min_y) / SAMPLES
    points = []
    for i in range(SAMPLES):
        for j in range(SAMPLES):
            x = min_x + (i + 0.5) * step_x
            y = min_y + (j + 0.5) * step_y
            if contains(g, x, y):
                points.append((x, y))
    return points


@dataclass(slots=True, frozen=True)
class Footprint:
    """The ground a plant occupies: its linked area (lawn, hedge …) or its crown."""

    plant_id: str
    geometries: tuple[Geometry, ...]

    @property
    def area(self) -> float:
        return sum(area(g) for g in self.geometries)


def footprints(
    plants: Iterable[Plant], shapes: Iterable[Shape], widths: dict[str, float] | None = None
) -> dict[str, Footprint]:
    """Footprints of all plants on the plan.

    A plant linked to areas (e.g. the lawn) occupies those areas; otherwise its
    crown circle at its position. Plants without either are not on the plan.
    """
    widths = widths or {}
    linked: dict[str, list[Geometry]] = {}
    for shape in shapes:
        if shape.plant_id and shape.kind is not ShapeKind.ZONE:
            linked.setdefault(shape.plant_id, []).append(shape.geometry)
    result: dict[str, Footprint] = {}
    for plant in plants:
        if plant.id in linked:
            result[plant.id] = Footprint(plant.id, tuple(linked[plant.id]))
        elif plant.position is not None:
            r = crown_diameter(plant, widths.get(plant.id)) / 2
            circle = {"type": "circle", "cx": plant.position.x, "cy": plant.position.y, "r": r}
            result[plant.id] = Footprint(plant.id, (circle,))
    return result


def share_inside(zone: Geometry, footprint: Footprint) -> float:
    """Fraction (0 to 1) of a footprint's area that lies inside the zone, area-weighted."""
    total = footprint.area
    if total <= 0:
        return 0.0
    covered = 0.0
    for g in footprint.geometries:
        points = sample_points(g)
        if points:
            inside = sum(1 for x, y in points if contains(zone, x, y))
            covered += area(g) * inside / len(points)
    share = covered / total
    return round(share, 4) if share >= MIN_SHARE else 0.0


def zone_coverage(zone: Shape, prints: dict[str, Footprint]) -> dict[str, float]:
    """Plant id → share of the plant a zone reaches (manual include/exclude applied)."""
    settings = zone.irrigation
    include = set(settings.include) if settings else set()
    exclude = set(settings.exclude) if settings else set()
    result: dict[str, float] = {}
    for plant_id, footprint in prints.items():
        if plant_id in exclude:
            continue
        share = 1.0 if plant_id in include else share_inside(zone.geometry, footprint)
        if share > 0:
            result[plant_id] = share
    return result
