"""Tests for photo upload and download over HTTP."""

from __future__ import annotations

from http import HTTPStatus
import io
from unittest.mock import patch

import aiohttp
from homeassistant.core import HomeAssistant
from PIL import Image
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.plant_garden.runtime import get_manager

from .images import make_image

UPLOAD = "/api/plant_garden/photos"


def _form(plant_id: str | None, image: bytes | None, **fields: str) -> aiohttp.FormData:
    form = aiohttp.FormData()
    if plant_id is not None:
        form.add_field("plant_id", plant_id)
    for key, value in fields.items():
        form.add_field(key, value)
    if image is not None:
        form.add_field("file", image, filename="foto.jpg", content_type="image/jpeg")
    return form


async def _plant_id(hass: HomeAssistant) -> str:
    manager = get_manager(hass)
    assert manager is not None
    return (await manager.async_create_plant({"name": "Tomate"})).id


async def test_upload_and_download(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_client_no_auth: ClientSessionGenerator,
    loaded_entry: MockConfigEntry,
) -> None:
    plant_id = await _plant_id(hass)
    client = await hass_client()

    resp = await client.post(
        UPLOAD,
        data=_form(
            plant_id,
            make_image(1200, 800),
            taken_at="2026-06-01T09:00:00+02:00",
            tags="entwicklung,blüte",
            note="Erste Blüte",
        ),
    )
    assert resp.status == HTTPStatus.OK, await resp.text()
    photo = await resp.json()
    assert photo["plant_id"] == plant_id
    assert photo["taken_at"] == "2026-06-01T07:00:00+00:00"
    assert photo["tags"] == ["entwicklung", "blüte"]
    assert (photo["width"], photo["height"]) == (1200, 800)

    # The signed URL works without any Authorization header ...
    anonymous = await hass_client_no_auth()
    resp = await anonymous.get(photo["urls"]["thumb"])
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Content-Type"] == "image/webp"
    assert "immutable" in resp.headers["Cache-Control"]
    thumb = Image.open(io.BytesIO(await resp.read()))
    assert max(thumb.size) == 360

    # ... the plain URL does not.
    plain = photo["urls"]["original"].split("?")[0]
    resp = await anonymous.get(plain)
    assert resp.status == HTTPStatus.UNAUTHORIZED

    resp = await client.get(plain)
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Content-Type"] == "image/jpeg"


async def test_upload_requires_auth(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator, loaded_entry: MockConfigEntry
) -> None:
    plant_id = await _plant_id(hass)
    anonymous = await hass_client_no_auth()
    resp = await anonymous.post(UPLOAD, data=_form(plant_id, make_image()))
    assert resp.status == HTTPStatus.UNAUTHORIZED


async def test_upload_errors(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, loaded_entry: MockConfigEntry
) -> None:
    plant_id = await _plant_id(hass)
    client = await hass_client()

    resp = await client.post(UPLOAD, data=_form(plant_id, None))
    assert resp.status == HTTPStatus.BAD_REQUEST

    resp = await client.post(UPLOAD, data=_form(None, make_image()))
    assert resp.status == HTTPStatus.BAD_REQUEST

    resp = await client.post(UPLOAD, data=_form("01JNOPENOPENOPENOPENOPENOP", make_image()))
    assert resp.status == HTTPStatus.NOT_FOUND

    resp = await client.post(UPLOAD, data=_form(plant_id, b"definitely not a photo"))
    assert resp.status == HTTPStatus.BAD_REQUEST
    assert (await resp.json())["code"] == "invalid_image"

    resp = await client.post(UPLOAD, data=b"plain body", headers={"Content-Type": "text/plain"})
    assert resp.status == HTTPStatus.BAD_REQUEST

    with patch("custom_components.plant_garden.http.MAX_UPLOAD_BYTES", 1000):
        resp = await client.post(UPLOAD, data=_form(plant_id, make_image(800, 800)))
    assert resp.status == HTTPStatus.REQUEST_ENTITY_TOO_LARGE


async def test_download_errors(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_client()
    for path in (
        "/api/plant_garden/photos/01JNOPENOPENOPENOPENOPENOP/thumb",
        "/api/plant_garden/photos/not-an-id/thumb",
        "/api/plant_garden/photos/01JNOPENOPENOPENOPENOPENOP/huge",
    ):
        resp = await client.get(path)
        assert resp.status == HTTPStatus.NOT_FOUND, path


async def test_views_when_not_loaded(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_client()
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    resp = await client.post(UPLOAD, data=_form("x", make_image()))
    assert resp.status == HTTPStatus.SERVICE_UNAVAILABLE
    resp = await client.get("/api/plant_garden/photos/01JNOPENOPENOPENOPENOPENOP/thumb")
    assert resp.status == HTTPStatus.SERVICE_UNAVAILABLE
