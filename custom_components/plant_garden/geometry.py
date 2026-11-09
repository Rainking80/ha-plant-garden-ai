"""Plan geometry: point-in-shape, areas and how much of a plant an irrigation zone reaches.

Geometries are the dicts stored on shapes (see models.Shape). The panel has the
same logic in frontend/src/util/geometry.ts and util/coverage.ts; both sample
the same grid, so they agree on which plants a zone covers.

Plan coordinates are metres, x east and y south. Angles of a sprinkler's sector
are compass bearings: degrees clockwise from north (up on the plan).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
import math
from typing import Any

from .models import Emitter, Irrigation, Plant, PlantCategory, Shape, ShapeKind

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


def bearing(cx: float, cy: float, x: float, y: float) -> float:
    """Compass bearing (0 to 360, clockwise from north) from (cx, cy) towards (x, y)."""
    return math.degrees(math.atan2(x - cx, cy - y)) % 360


def _in_sweep(g: Geometry, angle: float) -> bool:
    return bool(g["sweep"] >= 360 or (angle - g["start"]) % 360 <= g["sweep"])


def _arc_point(g: Geometry, angle: float) -> tuple[float, float]:
    rad = math.radians(angle)
    return g["cx"] + g["r"] * math.sin(rad), g["cy"] - g["r"] * math.cos(rad)


def _segment_distance(x: float, y: float, a: list[float], b: list[float]) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    t = 0.0 if length == 0 else max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / length))
    return math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))


def line_length(g: Geometry) -> float:
    """Length of a drip line in metres."""
    points = g["points"]
    return float(sum(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1)))


def contains(g: Geometry, x: float, y: float) -> bool:
    kind = g["type"]
    if kind == "circle":
        return bool(math.hypot(x - g["cx"], y - g["cy"]) <= g["r"])
    if kind == "rect":
        lx, ly = _to_rect_local(g, x, y)
        return bool(abs(lx) <= g["w"] / 2 and abs(ly) <= g["h"] / 2)
    if kind == "sector":
        if math.hypot(x - g["cx"], y - g["cy"]) > g["r"]:
            return False
        return _in_sweep(g, bearing(g["cx"], g["cy"], x, y))
    if kind == "line":
        points = g["points"]
        half = g["width"] / 2
        return any(
            _segment_distance(x, y, points[i], points[i + 1]) <= half
            for i in range(len(points) - 1)
        )
    return _point_in_polygon(g["points"], x, y)


def area(g: Geometry) -> float:
    """Area in m² (for a drip line: the strip it wets)."""
    kind = g["type"]
    if kind == "circle":
        return float(math.pi * g["r"] ** 2)
    if kind == "rect":
        return float(g["w"] * g["h"])
    if kind == "sector":
        return float(math.pi * g["r"] ** 2 * min(g["sweep"], 360) / 360)
    if kind == "line":
        return line_length(g) * float(g["width"])
    points = g["points"]
    total = 0.0
    for i, (x1, y1) in enumerate(points):
        x2, y2 = points[(i + 1) % len(points)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def bounds(g: Geometry) -> tuple[float, float, float, float]:
    """min x, min y, max x, max y."""
    if g["type"] == "circle" or (g["type"] == "sector" and g["sweep"] >= 360):
        return g["cx"] - g["r"], g["cy"] - g["r"], g["cx"] + g["r"], g["cy"] + g["r"]
    if g["type"] == "sector":
        # the sprinkler, both ends of the arc and the compass points the arc passes
        angles = [g["start"], g["start"] + g["sweep"]]
        angles += [a for a in (0, 90, 180, 270) if _in_sweep(g, a)]
        ends = [(g["cx"], g["cy"]), *(_arc_point(g, a) for a in angles)]
        xs, ys = [p[0] for p in ends], [p[1] for p in ends]
        return min(xs), min(ys), max(xs), max(ys)
    if g["type"] == "line":
        half = g["width"] / 2
        xs, ys = [p[0] for p in g["points"]], [p[1] for p in g["points"]]
        return min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half
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


def precipitation_rate(settings: Irrigation, geometry: Geometry) -> float | None:
    """Water over the zone in mm/h before efficiency (the panel computes the same).

    The rate itself; for a drip line its flow per metre over the wetted strip
    (L/h per m ÷ width in m = mm/h); else the total flow spread over the area,
    PR = Q · 60 / A. None for drippers (they water plants, not an area) and
    when nothing is set.
    """
    if settings.emitter is Emitter.DRIP:
        return None
    if settings.rate_mm_h is not None:
        return settings.rate_mm_h
    if settings.flow_l_h_m is not None and geometry["type"] == "line":
        return float(settings.flow_l_h_m / geometry["width"])
    zone_area = area(geometry)
    if settings.flow_l_min is not None and zone_area > 0:
        return settings.flow_l_min * 60 / zone_area
    return None
