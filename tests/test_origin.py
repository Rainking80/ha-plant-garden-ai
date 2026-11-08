"""Tests for moving the plan origin (the garden's location)."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import MockHAClientWebSocket, WebSocketGenerator

from custom_components.plant_garden import geo
from custom_components.plant_garden.garden import GardenChange, GardenManager, OutOfRangeError
from custom_components.plant_garden.models import GeoPoint, Point

from .images import make_image

ORIGIN = GeoPoint(latitude=50.0, longitude=10.0)
RECT = {"type": "rect", "cx": 110, "cy": -40, "w": 10, "h": 6, "rotation": 15}
CIRCLE = {"type": "circle", "cx": 90, "cy": -60, "r": 1.5}
POLYGON = {"type": "polygon", "points": [[95, -45], [105, -45], [100, -55]]}


def _geo_of(origin: GeoPoint, x: float, y: float) -> GeoPoint:
    latitude, longitude = geo.from_mercator(*geo.plan_to_mercator(origin, x, y))
    return GeoPoint(latitude=latitude, longitude=longitude)


def _close(actual: Any, expected: Any, tolerance: float = 0.01) -> bool:
    if isinstance(expected, dict):
        return all(_close(actual[key], value, tolerance) for key, value in expected.items())
    if isinstance(expected, list | tuple):
        return all(_close(a, e, tolerance) for a, e in zip(actual, expected, strict=True))
    if isinstance(expected, float | int) and not isinstance(expected, bool):
        return abs(actual - expected) <= tolerance
    return bool(actual == expected)


# ---------------------------------------------------------------- geo
def test_mercator_round_trip() -> None:
    mx, my = geo.to_mercator(50.0, 10.0)
    latitude, longitude = geo.from_mercator(mx, my)
    assert latitude == pytest.approx(50.0)
    assert longitude == pytest.approx(10.0)
    assert geo.mercator_to_plan(ORIGIN, *geo.plan_to_mercator(ORIGIN, 12.5, -7)) == (
        pytest.approx(12.5),
        pytest.approx(-7),
    )


def test_plan_metres_are_ground_metres() -> None:
    # 1/1000 degree of latitude is about 111.2 m on the ground.
    north = geo.reproject(GeoPoint(latitude=50.001, longitude=10.0), ORIGIN, 0, 0)
    assert north[0] == pytest.approx(0, abs=0.001)
    assert north[1] == pytest.approx(-111.2, abs=0.2)
    # 1/1000 degree of longitude at 50° N is about 71.7 m.
    east = geo.reproject(GeoPoint(latitude=50.0, longitude=10.001), ORIGIN, 0, 0)
    assert east == (pytest.approx(71.7, abs=0.2), pytest.approx(0, abs=0.001))


# ---------------------------------------------------------------- manager
async def _furnished(manager: GardenManager) -> dict[str, Any]:
    await manager.async_set_origin(ORIGIN.latitude, ORIGIN.longitude, move_content=True)
    plant = await manager.async_create_plant({"name": "Apfel", "position": {"x": 100, "y": -50}})
    unplaced = await manager.async_create_plant({"name": "Topf"})
    shapes = [
        await manager.async_save_shape({"kind": "bed", "geometry": geometry})
        for geometry in (RECT, CIRCLE, POLYGON)
    ]
    marker = await manager.async_save_marker({"entity_id": "sensor.soil", "x": 102, "y": -48})
    image = await manager.async_upload_background(make_image(400, 200))
    await manager.async_set_background(
        {"type": "image", **image, "x": 80, "y": -70, "width_m": 40, "rotation": 5, "opacity": 0.8}
    )
    return {"plant": plant, "unplaced": unplaced, "shapes": shapes, "marker": marker}


async def test_set_origin_keeps_everything_in_place(manager: GardenManager) -> None:
    items = await _furnished(manager)
    changes: list[GardenChange] = []
    manager.async_subscribe(changes.append)

    # New origin: the spot 100 m east and 50 m north of the old one.
    new = _geo_of(ORIGIN, 100, -50)
    await manager.async_set_origin(new.latitude, new.longitude)

    assert manager.layout.origin == new
    position = manager.get_plant(items["plant"].id).position
    assert position is not None
    assert _close((position.x, position.y), (0, 0))
    assert manager.get_plant(items["unplaced"].id).position is None
    rect, circle, polygon = (manager.layout.shapes[s.id].geometry for s in items["shapes"])
    assert _close(rect, {**RECT, "cx": 10, "cy": 10})  # size and rotation unchanged
    assert _close(circle, {**CIRCLE, "cx": -10, "cy": -10})
    assert _close(polygon, {"type": "polygon", "points": [[-5, 5], [5, 5], [0, -5]]})
    marker = manager.layout.markers[items["marker"].id]
    assert _close((marker.x, marker.y), (2, 2))
    assert _close(manager.layout.background, {"x": -20, "y": -20, "width_m": 40, "rotation": 5})

    assert GardenChange("layout") in changes
    assert GardenChange("plant", items["plant"].id) in changes
    assert GardenChange("plant", items["unplaced"].id) not in changes

    # Moving back restores the original coordinates (to the millimetre).
    await manager.async_set_origin(ORIGIN.latitude, ORIGIN.longitude)
    assert manager.get_plant(items["plant"].id).position == Point(100, -50)
    assert manager.layout.shapes[items["shapes"][0].id].geometry == RECT
    assert manager.layout.shapes[items["shapes"][2].id].geometry == POLYGON


async def test_set_origin_moving_the_drawing_along(manager: GardenManager) -> None:
    items = await _furnished(manager)
    await manager.async_set_origin(51.0, 11.0, move_content=True)
    assert manager.layout.origin == GeoPoint(latitude=51.0, longitude=11.0)
    assert manager.get_plant(items["plant"].id).position == Point(100, -50)
    assert manager.layout.shapes[items["shapes"][0].id].geometry == RECT


async def test_set_origin_too_far_away(manager: GardenManager) -> None:
    items = await _furnished(manager)
    far = _geo_of(ORIGIN, -9950, 0)  # the plant would end up 10,050 m east of it
    with pytest.raises(OutOfRangeError):
        await manager.async_set_origin(far.latitude, far.longitude)
    # Nothing changed.
    assert manager.layout.origin == ORIGIN
    assert manager.get_plant(items["plant"].id).position == Point(100, -50)

    await manager.async_set_origin(far.latitude, far.longitude, move_content=True)
    assert manager.layout.origin == far


async def test_set_origin_on_empty_garden(manager: GardenManager) -> None:
    await manager.async_set_origin(51.5, 7.5)
    assert manager.layout.origin == GeoPoint(latitude=51.5, longitude=7.5)


# ---------------------------------------------------------------- WebSocket
async def _call(client: MockHAClientWebSocket, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_ws_set_origin(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    plant = (
        await _call(client, type="plant_garden/plants/create", name="A", position={"x": 0, "y": 0})
    )["result"]
    old = (await _call(client, type="plant_garden/layout/get"))["result"]["origin"]
    new = _geo_of(GeoPoint(**old), 30, 40)

    msg = await _call(
        client,
        type="plant_garden/layout/set_origin",
        latitude=new.latitude,
        longitude=new.longitude,
    )
    assert msg["success"], msg
    assert msg["result"]["origin"] == {"latitude": new.latitude, "longitude": new.longitude}
    msg = await _call(client, type="plant_garden/plants/get", plant_id=plant["id"])
    assert _close(msg["result"]["plant"]["position"], {"x": -30, "y": -40})

    far = _geo_of(new, 20000, 0)
    msg = await _call(
        client,
        type="plant_garden/layout/set_origin",
        latitude=far.latitude,
        longitude=far.longitude,
    )
    assert msg["error"]["code"] == "out_of_range"
    msg = await _call(
        client,
        type="plant_garden/layout/set_origin",
        latitude=far.latitude,
        longitude=far.longitude,
        move_content=True,
    )
    assert msg["success"]


@pytest.mark.parametrize(
    "fields",
    [{"latitude": 90, "longitude": 0}, {"latitude": 0, "longitude": 181}, {"latitude": "x"}],
)
async def test_ws_set_origin_validation(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    loaded_entry: MockConfigEntry,
    fields: dict[str, Any],
) -> None:
    client = await hass_ws_client(hass)
    msg = await _call(client, type="plant_garden/layout/set_origin", **fields)
    assert msg["error"]["code"] == "invalid_format"
