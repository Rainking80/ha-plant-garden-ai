"""Conversions between plan metres and geographic coordinates.

Plan coordinates are metres east (x) and south (y) of the plan origin. They map
to Web Mercator (EPSG:3857, the projection of the aerial imagery) with the scale
factor 1/cos(latitude of the origin), which is constant within a garden. The
panel uses the same formulas (frontend/src/util/wms.ts).
"""

from __future__ import annotations

import math

from .models import GeoPoint

R = 6378137.0


def to_mercator(latitude: float, longitude: float) -> tuple[float, float]:
    return (
        R * math.radians(longitude),
        R * math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2)),
    )


def from_mercator(mx: float, my: float) -> tuple[float, float]:
    latitude = math.degrees(2 * math.atan(math.exp(my / R)) - math.pi / 2)
    return latitude, math.degrees(mx / R)


def _scale(origin: GeoPoint) -> float:
    return 1 / math.cos(math.radians(origin.latitude))


def plan_to_mercator(origin: GeoPoint, x: float, y: float) -> tuple[float, float]:
    ox, oy = to_mercator(origin.latitude, origin.longitude)
    k = _scale(origin)
    return ox + x * k, oy - y * k


def mercator_to_plan(origin: GeoPoint, mx: float, my: float) -> tuple[float, float]:
    ox, oy = to_mercator(origin.latitude, origin.longitude)
    k = _scale(origin)
    return (mx - ox) / k, -(my - oy) / k


def reproject(old: GeoPoint, new: GeoPoint, x: float, y: float) -> tuple[float, float]:
    """Plan coordinates relative to `new` of a point given relative to `old`."""
    nx, ny = mercator_to_plan(new, *plan_to_mercator(old, x, y))
    return round(nx, 3), round(ny, 3)
