"""Move a garden to another Home Assistant: export as JSON, import into an empty garden.

The file holds the plan (origin, areas, zones, markers, background - an uploaded
picture as base64), the plants with their provenance, measurements and open
tasks. Not included: photos (they are in Home Assistant's backups), irrigation
and weather history, AI usage and keys, problems and the chat. Imported data is
checked with the same rules as edits in the panel; the origin is taken over, so
the garden lies at the same place on the map.
"""

from __future__ import annotations

import base64
import binascii
from datetime import date
from typing import Any

from homeassistant.util import dt as dt_util
import probatio

from .care import TaskStatus
from .garden import OutOfRangeError
from .models import GeoPoint, Layout, Marker, Measurement, Plant, Shape, Source
from .photos import InvalidImageError
from .runtime import PlantGardenConfigEntry
from .websocket_api import BACKGROUND, ID, MARKER, SHAPE

FORMAT = "plant_garden.garden"
VERSION = 1
MAX_ITEMS = 10000  # per list; a garden is not that big


class TransferError(ValueError):
    """The file is not a Plant Garden export or does not fit this garden."""


def _measurement_dict(m: Measurement) -> dict[str, Any]:
    return {
        "id": m.id,
        "plant_id": m.plant_id,
        "measured_on": m.measured_on.isoformat(),
        "height_cm": m.height_cm,
        "width_cm": m.width_cm,
        "source": m.source.value,
        "confidence": m.confidence,
        "note": m.note,
    }


async def async_export(entry: PlantGardenConfigEntry) -> dict[str, Any]:
    """The whole garden configuration as one JSON-ready dict."""
    data = entry.runtime_data
    manager = data.manager
    image = await manager.async_background_bytes()
    plants = []
    for plant in manager.plants:
        item = plant.as_dict()
        item["cover_photo_id"] = None  # photos are not part of the file
        plants.append(item)
    tasks = [t.as_dict() for t in await data.care.async_tasks() if t.status is TaskStatus.OPEN]
    return {
        "format": FORMAT,
        "version": VERSION,
        "exported_at": dt_util.utcnow().isoformat(),
        "integration_version": data.version,
        "garden": {"name": entry.title},
        "layout": manager.layout.as_dict(),
        "background_image": base64.b64encode(image).decode() if image else None,
        "plants": plants,
        "measurements": [_measurement_dict(m) for m in await manager.async_all_measurements()],
        "tasks": tasks,
    }


def _items(data: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = data.get(key) or []
    if not isinstance(value, list) or len(value) > MAX_ITEMS:
        raise TransferError(f"{key}: expected a list of at most {MAX_ITEMS} entries")
    if not all(isinstance(item, dict) for item in value):
        raise TransferError(f"{key}: every entry must be an object")
    return value


def _check(schema: Any, item: dict[str, Any], what: str) -> dict[str, Any]:
    try:
        checked: dict[str, Any] = probatio.Schema(schema)(item)
    except probatio.Invalid as err:
        raise TransferError(f"{what}: {err}") from err
    return checked


def _plants(data: dict[str, Any]) -> list[Plant]:
    plants: list[Plant] = []
    for index, item in enumerate(_items(data, "plants")):
        what = f"plant {index + 1} ({item.get('name', '?')})"
        try:
            ID(item.get("id"))
            plant = Plant.from_dict(item)
        except (probatio.Invalid, KeyError, TypeError, ValueError) as err:
            raise TransferError(f"{what}: {err}") from err
        if not plant.name.strip() or len(plant.name) > 100:
            raise TransferError(f"{what}: invalid name")
        plant.cover_photo_id = None
        plants.append(plant)
    if len({p.id for p in plants}) != len(plants):
        raise TransferError("plants: duplicate ids")
    return plants


def _layout(data: dict[str, Any], plant_ids: set[str]) -> Layout:
    raw = data.get("layout")
    if not isinstance(raw, dict):
        raise TransferError("layout is missing")
    origin = raw.get("origin")
    try:
        geo = GeoPoint.from_dict(origin) if isinstance(origin, dict) else None
    except (KeyError, TypeError, ValueError) as err:
        raise TransferError(f"origin: {err}") from err
    if geo is None or not (-85 <= geo.latitude <= 85 and -180 <= geo.longitude <= 180):
        raise TransferError("origin: the garden's location is missing or invalid")
    shapes = []
    for index, item in enumerate(_items(raw, "shapes")):
        checked = _check(SHAPE, item, f"area {index + 1}")
        if checked.get("plant_id") not in plant_ids:
            checked["plant_id"] = None
        irrigation = checked.get("irrigation")
        if irrigation:
            for key in ("include", "exclude"):
                irrigation[key] = [pid for pid in irrigation.get(key, []) if pid in plant_ids]
        try:
            shapes.append(Shape.from_dict({"id": item.get("id"), **checked}))
        except (KeyError, TypeError, ValueError) as err:
            raise TransferError(f"area {index + 1}: {err}") from err
    markers = []
    for index, item in enumerate(_items(raw, "markers")):
        checked = _check(MARKER, item, f"marker {index + 1}")
        try:
            markers.append(Marker.from_dict({"id": str(ID(item.get("id"))), **checked}))
        except (probatio.Invalid, KeyError, TypeError, ValueError) as err:
            raise TransferError(f"marker {index + 1}: {err}") from err
    background = raw.get("background")
    if background is not None:
        background = _check(BACKGROUND, background, "background")
    return Layout(
        origin=geo,
        shapes={shape.id: shape for shape in shapes},
        background=background,
        markers={marker.id: marker for marker in markers},
    )


def _measurements(data: dict[str, Any], plant_ids: set[str]) -> list[Measurement]:
    result = []
    for index, item in enumerate(_items(data, "measurements")):
        if item.get("plant_id") not in plant_ids:
            continue
        try:
            height, width = item.get("height_cm"), item.get("width_cm")
            result.append(
                Measurement(
                    id=str(ID(item.get("id"))),
                    plant_id=item["plant_id"],
                    measured_on=date.fromisoformat(str(item["measured_on"])),
                    height_cm=float(height) if height is not None else None,
                    width_cm=float(width) if width is not None else None,
                    source=Source(item.get("source") or "user"),
                    confidence=item.get("confidence"),
                    note=str(item.get("note") or "")[:500],
                )
            )
        except (probatio.Invalid, KeyError, TypeError, ValueError) as err:
            raise TransferError(f"measurement {index + 1}: {err}") from err
    return result


def _image(data: dict[str, Any]) -> bytes | None:
    raw = data.get("background_image")
    if not raw:
        return None
    try:
        return base64.b64decode(str(raw), validate=True)
    except (binascii.Error, ValueError) as err:
        raise TransferError("background_image is not valid base64") from err


async def async_import(entry: PlantGardenConfigEntry, data: Any) -> dict[str, Any]:
    """Import an export into this (empty) garden; returns what was imported."""
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        raise TransferError("this is not a Plant Garden export")
    if data.get("version") != VERSION:
        raise TransferError(f"unsupported export version {data.get('version')}")
    runtime = entry.runtime_data
    manager = runtime.manager
    if not manager.is_empty:
        raise TransferError("the garden is not empty")
    plants = _plants(data)
    plant_ids = {plant.id for plant in plants}
    layout = _layout(data, plant_ids)
    measurements = _measurements(data, plant_ids)
    tasks = _items(data, "tasks")
    try:
        await manager.async_import_garden(
            plants=plants,
            layout=layout,
            measurements=measurements,
            background_image=_image(data),
        )
    except InvalidImageError as err:
        raise TransferError(f"background image: {err.reason}") from err
    except OutOfRangeError as err:
        raise TransferError(str(err)) from err
    imported_tasks = await runtime.care.async_import_tasks(tasks)
    return {
        "garden": (data.get("garden") or {}).get("name"),
        "plants": len(plants),
        "areas": sum(1 for s in layout.shapes.values() if s.kind.value != "zone"),
        "zones": sum(1 for s in layout.shapes.values() if s.kind.value == "zone"),
        "markers": len(layout.markers),
        "measurements": len(measurements),
        "tasks": imported_tasks,
        "background": (layout.background or {}).get("type"),
    }
