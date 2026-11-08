"""Tests for plan backgrounds (WMS, uploaded image) and sensor markers."""

from __future__ import annotations

from http import HTTPStatus
import io
from pathlib import Path
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from PIL import Image
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import (
    ClientSessionGenerator,
    MockHAClientWebSocket,
    WebSocketGenerator,
)

from custom_components.plant_garden.garden import GardenManager, NotFoundError
from custom_components.plant_garden.photos import process_background
from custom_components.plant_garden.runtime import get_manager

from .images import make_image

WMS = {"type": "wms", "preset": "bb", "opacity": 0.9}


async def _call(client: MockHAClientWebSocket, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


def _form(image: bytes) -> aiohttp.FormData:
    form = aiohttp.FormData()
    form.add_field("file", image, filename="lageplan.png", content_type="image/png")
    return form


def _image_background(image_id: str, **extra: Any) -> dict[str, Any]:
    return {
        "type": "image",
        "image_id": image_id,
        "width_px": 400,
        "height_px": 200,
        "x": -10,
        "y": -5,
        "width_m": 20,
        **extra,
    }


# ---------------------------------------------------------------- processing
def test_process_background_keeps_detail_up_to_4096() -> None:
    content, width, height = process_background(make_image(6000, 3000, orientation=6, gps=True))
    img = Image.open(io.BytesIO(content))
    assert (img.format, width, height) == ("JPEG", 2048, 4096)  # rotated by EXIF
    assert len(img.getexif()) == 0


# ---------------------------------------------------------------- manager
async def test_background_lifecycle(hass: HomeAssistant, manager: GardenManager) -> None:
    await manager.async_set_background(WMS)
    assert manager.layout.background == WMS

    with pytest.raises(ValueError, match="preset or url"):
        await manager.async_set_background({"type": "wms", "url": "https://x"})

    first = await manager.async_upload_background(make_image(400, 200))
    assert (first["width_px"], first["height_px"]) == (400, 200)
    first_path = await manager.async_background_path(first["image_id"])
    await manager.async_set_background(_image_background(first["image_id"]))

    second = await manager.async_upload_background(make_image(300, 300))
    await manager.async_set_background(_image_background(second["image_id"]))
    # the replaced image stays until the next start, so undo can switch back to it
    assert first_path.exists()
    await manager.async_set_background(_image_background(first["image_id"]))
    assert manager.layout.background["image_id"] == first["image_id"]

    await manager.async_set_background({"type": "none"})
    assert manager.layout.background is None

    with pytest.raises(NotFoundError):
        await manager.async_set_background(_image_background("01JNOPENOPENOPENOPENOPENOP"))


async def test_unused_uploads_are_cleaned_on_start(hass: HomeAssistant, tmp_path: Path) -> None:
    first = GardenManager(hass, tmp_path / "garden")
    await first.async_setup()
    used = await first.async_upload_background(make_image())
    unused = await first.async_upload_background(make_image())
    await first.async_set_background(_image_background(used["image_id"]))
    await first.async_shutdown()

    second = GardenManager(hass, tmp_path / "garden")
    await second.async_setup()
    assert (await second.async_background_path(used["image_id"])).exists()
    with pytest.raises(NotFoundError):
        await second.async_background_path(unused["image_id"])
    await second.async_shutdown()


async def test_markers(manager: GardenManager) -> None:
    marker = await manager.async_save_marker(
        {"entity_id": "sensor.zisterne", "x": 3, "y": -2, "label": " Zisterne "}
    )
    assert marker.label == "Zisterne"
    moved = await manager.async_save_marker({**marker.as_dict(), "x": 5})
    assert moved.id == marker.id
    assert list(manager.layout.markers.values()) == [moved]
    await manager.async_delete_marker(marker.id)
    with pytest.raises(NotFoundError):
        await manager.async_delete_marker(marker.id)


# ---------------------------------------------------------------- API
async def test_upload_and_use_image_background(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_client_no_auth: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
    loaded_entry: MockConfigEntry,
) -> None:
    client = await hass_client()
    resp = await client.post(
        "/api/plant_garden/backgrounds", data=_form(make_image(400, 200, fmt="PNG"))
    )
    assert resp.status == HTTPStatus.OK, await resp.text()
    upload = await resp.json()
    assert (upload["width_px"], upload["height_px"]) == (400, 200)

    # the fresh upload can be shown for calibration before it is the background
    anonymous = await hass_client_no_auth()
    resp = await anonymous.get(upload["url"])
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Content-Type"] == "image/jpeg"
    resp = await anonymous.get(upload["url"].split("?")[0])
    assert resp.status == HTTPStatus.FORBIDDEN

    ws = await hass_ws_client(hass)
    msg = await _call(
        ws,
        type="plant_garden/layout/set_background",
        background=_image_background(upload["image_id"], rotation=12),
    )
    assert msg["success"], msg
    background = msg["result"]["background"]
    assert background["rotation"] == 12
    assert background["opacity"] == 0.8  # default
    assert "authSig=" in background["url"]

    layout = (await _call(ws, type="plant_garden/layout/get"))["result"]
    assert layout["background"]["image_id"] == upload["image_id"]


async def test_background_upload_errors(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_client()
    resp = await client.post("/api/plant_garden/backgrounds", data=_form(b"no image"))
    assert resp.status == HTTPStatus.BAD_REQUEST
    resp = await client.post("/api/plant_garden/backgrounds", data=aiohttp.FormData({"x": "1"}))
    assert resp.status == HTTPStatus.BAD_REQUEST
    resp = await client.get("/api/plant_garden/backgrounds/01JNOPENOPENOPENOPENOPENOP")
    assert resp.status == HTTPStatus.NOT_FOUND
    resp = await client.get("/api/plant_garden/backgrounds/nope")
    assert resp.status == HTTPStatus.NOT_FOUND


@pytest.mark.parametrize(
    "background",
    [
        {"type": "wms", "url": "http://insecure.example/wms", "layers": "x"},
        {"type": "wms", "preset": "bb", "opacity": 0},
        {
            "type": "image",
            "image_id": "nope",
            "width_px": 1,
            "height_px": 1,
            "x": 0,
            "y": 0,
            "width_m": 1,
        },
        {"type": "satellite"},
    ],
)
async def test_background_validation(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    loaded_entry: MockConfigEntry,
    background: dict[str, Any],
) -> None:
    ws = await hass_ws_client(hass)
    msg = await _call(ws, type="plant_garden/layout/set_background", background=background)
    assert msg["error"]["code"] == "invalid_format", background


async def test_ws_wms_and_markers(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    ws = await hass_ws_client(hass)
    msg = await _call(
        ws,
        type="plant_garden/layout/set_background",
        background={
            "type": "wms",
            "url": "https://example.org/wms",
            "layers": "dop",
            "attribution": "© Beispiel",
        },
    )
    assert msg["success"], msg
    assert msg["result"]["background"]["opacity"] == 1

    msg = await _call(
        ws,
        type="plant_garden/layout/markers/save",
        marker={"entity_id": "sensor.bodenfeuchte", "x": 1.5, "y": 2},
    )
    assert msg["success"], msg
    marker = msg["result"]
    msg = await _call(
        ws,
        type="plant_garden/layout/markers/save",
        marker={"entity_id": "not an entity", "x": 1, "y": 2},
    )
    assert msg["error"]["code"] == "invalid_format"

    layout = (await _call(ws, type="plant_garden/layout/get"))["result"]
    assert layout["markers"] == [marker]
    assert layout["background"]["layers"] == "dop"

    msg = await _call(ws, type="plant_garden/layout/markers/delete", marker_id=marker["id"])
    assert msg["success"]
    msg = await _call(ws, type="plant_garden/layout/set_background", background={"type": "none"})
    assert msg["result"]["background"] is None
    assert get_manager(hass) is not None
