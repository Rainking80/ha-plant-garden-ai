"""Export a garden as JSON and import it into an empty garden elsewhere."""

from __future__ import annotations

from datetime import date, timedelta
import json
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from .images import make_image

EXPORT = "/api/plant_garden/export"
IMPORT = "/api/plant_garden/import"
# a public place, not anyone's garden: Munich, Marienplatz
ORIGIN = {"latitude": 48.13743, "longitude": 11.57549}


async def _fill(entry: MockConfigEntry) -> dict[str, Any]:
    """A garden with all kinds of content; returns the ids to check against."""
    data = entry.runtime_data
    manager = data.manager
    await manager.async_set_origin(ORIGIN["latitude"], ORIGIN["longitude"], move_content=True)
    rose = await manager.async_create_plant(
        {"name": "Rose", "category": "shrub", "care_prune": "Im Frühjahr", "notes": "privat"}
    )
    await manager.async_move_plants([(rose.id, _point(2, 3))])
    await manager.async_apply_ai_fields(
        rose.id, {"water_need": "moderate"}, confidence=0.8, model="claude-opus-5-5"
    )
    hedge = await manager.async_create_plant({"name": "Rotbuchenhecke", "category": "hedge"})
    await manager.async_add_measurement(
        rose.id, measured_on=date(2026, 6, 1), height_cm=80, width_cm=None
    )
    bed = await manager.async_save_shape(
        {
            "kind": "bed",
            "label": "Beet",
            "soil_type": "sand",
            "geometry": {"type": "rect", "cx": 2, "cy": 3, "w": 4, "h": 2, "rotation": 0},
        }
    )
    strip = await manager.async_save_shape(
        {
            "kind": "hedge",
            "plant_id": hedge.id,
            "geometry": {"type": "polygon", "points": [[0, 0], [10, 0], [10, 1], [0, 1]]},
        }
    )
    zone = await manager.async_save_shape(
        {
            "kind": "zone",
            "label": "Rasen",
            "geometry": {"type": "circle", "cx": 2, "cy": 3, "r": 4},
            "irrigation": {"entity_id": "switch.regner", "rate_mm_h": 12, "include": [hedge.id]},
        }
    )
    marker = await manager.async_save_marker(
        {"entity_id": "sensor.bodenfeuchte", "x": 1, "y": 1, "label": "Boden"}
    )
    upload = await manager.async_upload_background(make_image(800, 600))
    await manager.async_set_background(
        {
            "type": "image",
            "image_id": upload["image_id"],
            "width_px": upload["width_px"],
            "height_px": upload["height_px"],
            "x": -5,
            "y": -5,
            "width_m": 20,
            "rotation": 0,
            "opacity": 0.8,
        }
    )
    care = data.care
    await care.async_create_task(
        {
            "title": "Schneiden",
            "kind": "prune",
            "plant_id": rose.id,
            "due": dt_util.now().date() + timedelta(days=30),
            "repeat": {"every": 1, "unit": "weeks"},
            "months": [3, 4],
        }
    )
    done = await care.async_create_task({"title": "Erledigt"})
    await care.async_complete_task(done.id)
    return {"rose": rose.id, "hedge": hedge.id, "bed": bed.id, "strip": strip.id,
            "zone": zone.id, "marker": marker.id}  # fmt: skip


def _point(x: float, y: float) -> Any:
    from custom_components.plant_garden.models import Point  # noqa: PLC0415

    return Point(x=x, y=y)


async def _empty(entry: MockConfigEntry) -> None:
    """What a fresh installation looks like: no plants, areas or markers, home elsewhere."""
    manager = entry.runtime_data.manager
    for plant in list(manager.plants):
        await manager.async_delete_plant(plant.id)
    for shape in manager.shapes():
        await manager.async_delete_shape(shape.id)
    for marker_id in list(manager.layout.markers):
        await manager.async_delete_marker(marker_id)
    await manager.async_set_background(None)
    await manager.async_set_origin(52.0, 4.3)
    for task in await entry.runtime_data.care.async_tasks():
        await entry.runtime_data.care.async_delete_task(task.id)


def _form(content: bytes) -> aiohttp.FormData:
    form = aiohttp.FormData()
    form.add_field("file", content, filename="garden.json", content_type="application/json")
    return form


async def test_export_and_import_at_the_same_place(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, loaded_entry: MockConfigEntry
) -> None:
    ids = await _fill(loaded_entry)
    client = await hass_client()
    response = await client.get(EXPORT)
    assert response.status == 200
    assert "attachment" in response.headers["Content-Disposition"]
    exported = await response.json()
    assert exported["format"] == "plant_garden.garden"
    assert exported["layout"]["origin"] == ORIGIN
    assert exported["background_image"]  # the uploaded picture travels along
    assert [t["title"] for t in exported["tasks"]] == ["Schneiden"]  # open tasks only
    text = json.dumps(exported)
    assert "api_key" not in text

    # a garden that is not empty refuses the import
    response = await client.post(IMPORT, data=_form(json.dumps(exported).encode()))
    assert response.status == 400
    assert "not empty" in (await response.json())["message"]

    await _empty(loaded_entry)
    manager = loaded_entry.runtime_data.manager
    assert manager.layout.origin is not None
    assert manager.layout.origin.latitude == 52.0
    response = await client.post(IMPORT, data=_form(json.dumps(exported).encode()))
    assert response.status == 200, await response.text()
    summary = await response.json()
    assert summary == {
        "garden": "Garten", "plants": 2, "areas": 2, "zones": 1, "markers": 1,
        "measurements": 1, "tasks": 1, "background": "image",
    }  # fmt: skip
    await hass.async_block_till_done()

    # back at the exported place, with the same ids and links
    assert manager.layout.origin.as_dict() == ORIGIN
    rose = manager.get_plant(ids["rose"])
    assert rose.position is not None
    assert (rose.position.x, rose.position.y) == (2, 3)
    assert rose.care_prune == "Im Frühjahr"
    assert rose.sources["water_need"].source.value == "ai"
    assert manager.get_zone(ids["zone"]).irrigation.include == [ids["hedge"]]  # type: ignore[union-attr]
    assert {s.id: s.plant_id for s in manager.shapes()}[ids["strip"]] == ids["hedge"]
    assert ids["marker"] in manager.layout.markers
    background = manager.layout.background
    assert background is not None
    assert background["type"] == "image"
    assert background["x"] == -5
    assert (await manager.async_background_path(background["image_id"])).exists()
    [measurement] = await manager.async_list_measurements(ids["rose"])
    assert measurement.height_cm == 80
    [task] = await loaded_entry.runtime_data.care.async_tasks()
    assert (task.title, task.plant_id, task.months) == ("Schneiden", ids["rose"], [3, 4])
    # the new plants get their entities
    assert hass.states.get("sensor.rose_open_tasks") is not None


async def test_import_rejects_wrong_files_and_users(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_read_only_access_token: str,
    loaded_entry: MockConfigEntry,
) -> None:
    client = await hass_client()
    for content, message in (
        (b"not json", "not JSON"),
        (b'{"format": "something else"}', "not a Plant Garden export"),
        (b'{"format": "plant_garden.garden", "version": 9}', "unsupported export version"),
        (
            b'{"format": "plant_garden.garden", "version": 1, "layout": {"origin": null}}',
            "location is missing",
        ),
        (
            json.dumps(
                {
                    "format": "plant_garden.garden",
                    "version": 1,
                    "layout": {
                        "origin": ORIGIN,
                        "shapes": [{"kind": "bed", "geometry": {"type": "circle"}}],
                    },
                }
            ).encode(),
            "area 1",
        ),
        (
            json.dumps(
                {
                    "format": "plant_garden.garden",
                    "version": 1,
                    "layout": {"origin": ORIGIN},
                    "plants": [{"id": "../../etc", "name": "x"}],
                }
            ).encode(),
            "plant 1",
        ),
    ):
        response = await client.post(IMPORT, data=_form(content))
        assert response.status == 400, content
        assert message in (await response.json())["message"]
    assert loaded_entry.runtime_data.manager.is_empty  # nothing half-imported

    reader = await hass_client(hass_read_only_access_token)
    assert (await reader.get(EXPORT)).status == 403
    assert (await reader.post(IMPORT, data=_form(b"{}"))).status == 403
