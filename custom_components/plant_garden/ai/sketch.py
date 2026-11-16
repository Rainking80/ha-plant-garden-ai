"""A plan drawn from a picture: the AI outlines the areas it sees in the background.

The picture is the uploaded plan background (a sketch, a site plan, a screenshot
of an aerial image). Its place and scale on the plan are known from the
calibration, so outlines in picture coordinates become areas in plan metres.
"""

from __future__ import annotations

import io
import math
from typing import Any

from PIL import Image

from ..geometry import area

MAX_EDGE = 1568  # pixels sent to the AI; more adds cost, not accuracy
GRID = 1000  # the AI gives positions as 0..GRID across the width and the height
MIN_AREA_M2 = 0.2  # smaller outlines are noise
MAX_POINTS = 60
MAX_SHAPES = 60


def prepare(data: bytes) -> bytes:
    """The background as a JPEG of at most MAX_EDGE pixels (blocking)."""
    with Image.open(io.BytesIO(data)) as image:
        rgb = image.convert("RGB")
        rgb.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        rgb.save(buffer, format="JPEG", quality=85)
        return buffer.getvalue()


def to_plan(point: tuple[float, float], background: dict[str, Any]) -> tuple[float, float]:
    """A position in the picture (0..GRID each way) as plan metres.

    The background's top-left corner is at (x, y) before its rotation, which
    turns it clockwise around its centre.
    """
    width = float(background["width_m"])
    height = width * background["height_px"] / background["width_px"]
    px = background["x"] + point[0] / GRID * width
    py = background["y"] + point[1] / GRID * height
    cx, cy = background["x"] + width / 2, background["y"] + height / 2
    angle = math.radians(float(background.get("rotation", 0)))
    dx, dy = px - cx, py - cy
    return (
        round(cx + dx * math.cos(angle) - dy * math.sin(angle), 2),
        round(cy + dx * math.sin(angle) + dy * math.cos(angle), 2),
    )


def shapes_from(found: list[dict[str, Any]], background: dict[str, Any]) -> list[dict[str, Any]]:
    """Areas for the plan from the cleaned answer; tiny and broken outlines are dropped."""
    result = []
    for item in found:
        points: list[list[float]] = []
        for point in item["points"][:MAX_POINTS]:
            x, y = to_plan(point, background)
            if not points or [x, y] != points[-1]:
                points.append([x, y])
        if len(points) > 1 and points[0] == points[-1]:
            points.pop()
        geometry = {"type": "polygon", "points": points}
        if len(points) < 3 or area(geometry) < MIN_AREA_M2:
            continue
        result.append(
            {
                "kind": item["kind"],
                "label": item["label"],
                "geometry": geometry,
                "area_m2": round(area(geometry), 1),
            }
        )
    return result[:MAX_SHAPES]
