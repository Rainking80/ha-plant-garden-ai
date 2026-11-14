"""Tests for the WebSocket API."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import MockHAClientWebSocket, WebSocketGenerator

from custom_components.plant_garden.runtime import get_manager

from .images import make_image


async def _call(client: MockHAClientWebSocket, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_plant_crud(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)

    msg = await _call(client, type="plant_garden/plants/list")
    assert msg["success"]
    assert msg["result"] == {"plants": []}

    msg = await _call(
        client,
        type="plant_garden/plants/create",
        name="Hortensie",
        category="shrub",
        planted_on="2024-04-20",
        age={"age_months": 12, "on": "2024-04-20"},
        min_temperature_c=-15,
        tags=["Beet Süd"],
    )
    assert msg["success"], msg
    plant = msg["result"]
    assert plant["name"] == "Hortensie"
    assert plant["planted_on"] == "2024-04-20"
    assert plant["age_months_now"] >= 30
    assert plant["photo_count"] == 0
    assert plant["cover"] is None
    assert plant["sources"]["name"]["source"] == "user"

    msg = await _call(
        client, type="plant_garden/plants/update", plant_id=plant["id"], status="watch", age=None
    )
    assert msg["success"], msg
    assert msg["result"]["status"] == "watch"
    assert msg["result"]["age"] is None

    msg = await _call(client, type="plant_garden/plants/list")
    assert [p["name"] for p in msg["result"]["plants"]] == ["Hortensie"]

    msg = await _call(client, type="plant_garden/plants/delete", plant_id=plant["id"])
    assert msg["success"]
    msg = await _call(client, type="plant_garden/plants/get", plant_id=plant["id"])
    assert msg["error"]["code"] == "not_found"


async def test_validation_errors(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    for bad in (
        {"name": ""},
        {"name": "x", "category": "spaceship"},
        {"name": "x", "min_temperature_c": "kalt"},
        {"name": "x", "age": {"age_months": -1, "on": "2026-01-01"}},
        {"name": "x", "planted_on": "gestern"},
    ):
        msg = await _call(client, type="plant_garden/plants/create", **bad)
        assert msg["error"]["code"] == "invalid_format", bad

    msg = await _call(client, type="plant_garden/plants/create", name="  ")
    assert msg["error"]["code"] == "invalid_format"


async def test_detail_with_photos_and_measurements(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    manager = get_manager(hass)
    assert manager is not None
    client = await hass_ws_client(hass)
    plant = (await _call(client, type="plant_garden/plants/create", name="Tomate"))["result"]
    photo = await manager.async_add_photo(plant["id"], make_image())

    msg = await _call(
        client,
        type="plant_garden/measurements/add",
        plant_id=plant["id"],
        measured_on="2026-06-01",
        height_cm=42.5,
        photo_id=photo.id,
    )
    assert msg["success"], msg
    measurement = msg["result"]
    assert measurement["height_cm"] == 42.5
    assert measurement["width_cm"] is None

    msg = await _call(
        client,
        type="plant_garden/measurements/add",
        plant_id=plant["id"],
        measured_on="2026-06-01",
    )
    assert msg["error"]["code"] == "invalid_format"

    msg = await _call(client, type="plant_garden/plants/get", plant_id=plant["id"])
    detail = msg["result"]
    assert detail["plant"]["photo_count"] == 1
    assert detail["plant"]["height_cm"] == 42.5
    assert detail["plant"]["cover"]["id"] == photo.id
    assert set(detail["plant"]["cover"]["urls"]) == {"original", "medium", "thumb", "source"}
    assert "authSig=" in detail["plant"]["cover"]["urls"]["thumb"]
    assert [p["id"] for p in detail["photos"]] == [photo.id]
    assert [m["id"] for m in detail["measurements"]] == [measurement["id"]]

    msg = await _call(
        client,
        type="plant_garden/measurements/update",
        measurement_id=measurement["id"],
        width_cm=20,
    )
    assert msg["result"]["width_cm"] == 20

    msg = await _call(
        client,
        type="plant_garden/photos/update",
        photo_id=photo.id,
        tags=["problem"],
        note="gelbe Blätter",
        taken_at="2026-05-30T10:00:00+02:00",
    )
    assert msg["success"], msg
    assert msg["result"]["tags"] == ["problem"]
    assert msg["result"]["taken_at"] == "2026-05-30T08:00:00+00:00"

    msg = await _call(
        client, type="plant_garden/plants/set_cover", plant_id=plant["id"], photo_id=photo.id
    )
    assert msg["result"]["cover_photo_id"] == photo.id

    msg = await _call(
        client, type="plant_garden/measurements/delete", measurement_id=measurement["id"]
    )
    assert msg["success"]
    msg = await _call(client, type="plant_garden/photos/delete", photo_id=photo.id)
    assert msg["success"]
    msg = await _call(client, type="plant_garden/photos/delete", photo_id=photo.id)
    assert msg["error"]["code"] == "not_found"


async def test_subscribe_receives_changes(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    other = await hass_ws_client(hass)

    msg = await _call(client, type="plant_garden/subscribe")
    assert msg["success"]
    subscription = msg["id"]

    created = (await _call(other, type="plant_garden/plants/create", name="Minze"))["result"]
    event = await client.receive_json()
    assert event == {
        "id": subscription,
        "type": "event",
        "event": {"kind": "plant", "plant_id": created["id"], "shape_id": None},
    }

    await _call(other, type="plant_garden/plants/delete", plant_id=created["id"])
    event = await client.receive_json()
    assert event["event"] == {"kind": "plant_removed", "plant_id": created["id"], "shape_id": None}


async def test_commands_when_not_loaded(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    for msg_type in ("plant_garden/plants/list", "plant_garden/subscribe", "plant_garden/info"):
        msg = await _call(client, type=msg_type)
        assert msg["error"]["code"] == "not_loaded", msg_type
