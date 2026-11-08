"""Tests for the garden layout and plant positions."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import MockHAClientWebSocket, WebSocketGenerator

from custom_components.plant_garden.garden import GardenChange, GardenManager, NotFoundError
from custom_components.plant_garden.models import Point, ShapeKind

RECT = {"type": "rect", "cx": 5, "cy": 3, "w": 10, "h": 6, "rotation": 15}
CIRCLE = {"type": "circle", "cx": -2, "cy": 4, "r": 1.5}
POLYGON = {"type": "polygon", "points": [[0, 0], [4, 0], [4, 3], [0, 3]]}
SHAPE_ID = "01JSHAPE0000000000000000AA"


# ---------------------------------------------------------------- manager
async def test_shapes_lifecycle(manager: GardenManager) -> None:
    changes: list[GardenChange] = []
    manager.async_subscribe(changes.append)

    bed = await manager.async_save_shape(
        {"kind": "bed", "geometry": RECT, "label": " Beet Süd ", "soil_type": "loam"}
    )
    assert bed.kind is ShapeKind.BED
    assert bed.label == "Beet Süd"
    assert len(bed.id) == 26

    house = await manager.async_save_shape(
        {"id": SHAPE_ID, "kind": "house", "geometry": POLYGON, "z": -1, "locked": True}
    )
    assert house.id == SHAPE_ID
    assert [shape.id for shape in manager.shapes()] == [SHAPE_ID, bed.id]  # z order

    moved = await manager.async_save_shape({**bed.as_dict(), "geometry": CIRCLE, "label": ""})
    assert moved.id == bed.id
    assert moved.geometry == CIRCLE
    assert moved.label is None
    assert len(manager.layout.shapes) == 2

    await manager.async_delete_shape(bed.id)
    assert list(manager.layout.shapes) == [SHAPE_ID]
    with pytest.raises(NotFoundError):
        await manager.async_delete_shape(bed.id)

    assert {(c.kind, c.shape_id) for c in changes} == {("layout", bed.id), ("layout", SHAPE_ID)}


async def test_shape_plant_link(manager: GardenManager) -> None:
    with pytest.raises(NotFoundError):
        await manager.async_save_shape(
            {"kind": "lawn", "geometry": RECT, "plant_id": "01JNOPENOPENOPENOPENOPENOP"}
        )
    lawn = await manager.async_create_plant({"name": "Rasen", "category": "lawn"})
    shape = await manager.async_save_shape({"kind": "lawn", "geometry": RECT, "plant_id": lawn.id})
    assert shape.plant_id == lawn.id

    await manager.async_delete_plant(lawn.id)
    assert manager.layout.shapes[shape.id].plant_id is None


async def test_positions(manager: GardenManager) -> None:
    rose = await manager.async_create_plant({"name": "Rose", "position": {"x": 1.5, "y": -2}})
    assert rose.position == Point(1.5, -2)
    assert rose.sources["position"].source == "user"

    await manager.async_update_plant(rose.id, {"crown_diameter_m": 0.8, "position": None})
    assert rose.position is None
    assert rose.crown_diameter_m == 0.8

    olive = await manager.async_create_plant({"name": "Olive"})
    await manager.async_move_plants([(rose.id, Point(1, 1)), (olive.id, Point(3, 4))])
    assert (rose.position, olive.position) == (Point(1, 1), Point(3, 4))

    # an unknown plant in the batch changes nothing
    with pytest.raises(NotFoundError):
        await manager.async_move_plants(
            [(rose.id, Point(9, 9)), ("01JNOPENOPENOPENOPENOPENOP", None)]
        )
    assert rose.position == Point(1, 1)


async def test_layout_survives_restart(hass: HomeAssistant, tmp_path: Path) -> None:
    first = GardenManager(hass, tmp_path / "garden")
    await first.async_setup()
    plant = await first.async_create_plant({"name": "Olive", "position": {"x": 2, "y": 3}})
    shape = await first.async_save_shape({"kind": "terrace", "geometry": POLYGON})
    origin = first.layout.origin
    await first.async_shutdown()

    hass.config.latitude = 0  # moving "home" later must not move the garden
    second = GardenManager(hass, tmp_path / "garden")
    await second.async_setup()
    assert second.get_plant(plant.id).position == Point(2, 3)
    assert second.layout.shapes[shape.id].geometry == POLYGON
    assert second.layout.origin == origin
    await second.async_shutdown()


# ---------------------------------------------------------------- WebSocket
async def _call(client: MockHAClientWebSocket, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_ws_layout(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)

    msg = await _call(client, type="plant_garden/layout/get")
    assert msg["success"]
    assert msg["result"]["shapes"] == []
    assert msg["result"]["origin"] == {
        "latitude": hass.config.latitude,
        "longitude": hass.config.longitude,
    }

    for geometry in (RECT, CIRCLE, POLYGON):
        msg = await _call(
            client,
            type="plant_garden/layout/shapes/save",
            shape={"kind": "bed", "geometry": geometry},
        )
        assert msg["success"], msg
    rect_without_rotation = {k: v for k, v in RECT.items() if k != "rotation"}
    msg = await _call(
        client,
        type="plant_garden/layout/shapes/save",
        shape={"id": SHAPE_ID, "kind": "path", "geometry": rect_without_rotation},
    )
    assert msg["result"]["id"] == SHAPE_ID
    assert msg["result"]["geometry"]["rotation"] == 0

    msg = await _call(client, type="plant_garden/layout/get")
    assert len(msg["result"]["shapes"]) == 4

    msg = await _call(client, type="plant_garden/layout/shapes/delete", shape_id=SHAPE_ID)
    assert msg["success"]
    msg = await _call(client, type="plant_garden/layout/shapes/delete", shape_id=SHAPE_ID)
    assert msg["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    "shape",
    [
        {"kind": "spaceship", "geometry": RECT},
        {"kind": "bed", "geometry": {"type": "rect", "cx": 0, "cy": 0, "w": 0, "h": 1}},
        {"kind": "bed", "geometry": {"type": "circle", "cx": 0, "cy": 0, "r": -1}},
        {"kind": "bed", "geometry": {"type": "polygon", "points": [[0, 0], [1, 1]]}},
        {"kind": "bed", "geometry": {"type": "polygon", "points": [[0, 0], [1], [1, 2]]}},
        {"kind": "bed", "geometry": {"type": "circle", "cx": 99999, "cy": 0, "r": 1}},
        {"kind": "bed", "geometry": {"type": "triangle"}},
        {"id": "../etc", "kind": "bed", "geometry": RECT},
    ],
)
async def test_ws_shape_validation(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    loaded_entry: MockConfigEntry,
    shape: dict[str, Any],
) -> None:
    client = await hass_ws_client(hass)
    msg = await _call(client, type="plant_garden/layout/shapes/save", shape=shape)
    assert msg["error"]["code"] == "invalid_format", shape


async def test_ws_positions(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    a = (await _call(client, type="plant_garden/plants/create", name="A"))["result"]
    b = (await _call(client, type="plant_garden/plants/create", name="B"))["result"]
    assert a["position"] is None

    msg = await _call(
        client,
        type="plant_garden/plants/move",
        moves=[
            {"plant_id": a["id"], "position": {"x": 1.25, "y": 2}},
            {"plant_id": b["id"], "position": None},
        ],
    )
    assert msg["success"], msg
    assert msg["result"]["positions"] == {a["id"]: {"x": 1.25, "y": 2.0}, b["id"]: None}

    msg = await _call(
        client, type="plant_garden/plants/update", plant_id=b["id"], crown_diameter_m=2.5
    )
    assert msg["result"]["crown_diameter_m"] == 2.5

    msg = await _call(client, type="plant_garden/plants/list")
    positions = {p["name"]: p["position"] for p in msg["result"]["plants"]}
    assert positions == {"A": {"x": 1.25, "y": 2.0}, "B": None}

    msg = await _call(client, type="plant_garden/plants/move", moves=[])
    assert msg["error"]["code"] == "invalid_format"
    msg = await _call(
        client,
        type="plant_garden/plants/move",
        moves=[{"plant_id": a["id"], "position": {"x": "links", "y": 0}}],
    )
    assert msg["error"]["code"] == "invalid_format"


async def test_ws_layout_events(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    other = await hass_ws_client(hass)
    subscription = (await _call(client, type="plant_garden/subscribe"))["id"]

    await _call(
        other,
        type="plant_garden/layout/shapes/save",
        shape={"id": SHAPE_ID, "kind": "pond", "geometry": CIRCLE},
    )
    event = await client.receive_json()
    assert event == {
        "id": subscription,
        "type": "event",
        "event": {"kind": "layout", "plant_id": None, "shape_id": SHAPE_ID},
    }
