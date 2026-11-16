"""The camera watch: daily pictures of plants with a camera, thinning, the weekly look."""

from __future__ import annotations

from datetime import datetime, timedelta
import json
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.camera import Image
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.camera import photos_to_thin
from custom_components.plant_garden.models import Photo, PhotoEdit

from .images import make_image
from .test_assistant import MESSAGES, _call, claude, garden  # noqa: F401

CAMERA = "camera.beet"
GET_IMAGE = "homeassistant.components.camera.async_get_image"
COMPARISON = {
    "summary": "Die Blätter sind gelb geworden.",
    "growth": "same",
    "changes": ["Vergilbung der unteren Blätter"],
    "concerns": [{"text": "Nährstoffmangel möglich", "severity": "medium"}],
    "problem_title": "Gelbe Blätter",
}


def _photo(photo_id: str, day: datetime, **fields: Any) -> Photo:
    return Photo(
        id=photo_id,
        plant_id="P",
        taken_at=day,
        uploaded_at=day,
        width=10,
        height=10,
        size_bytes=1,
        tags=fields.pop("tags", ["camera"]),
        note=fields.pop("note", ""),
        **fields,
    )


def test_thinning_keeps_recent_touched_and_one_per_week() -> None:
    today = dt_util.now().date()
    noon = dt_util.start_of_local_day(today) + timedelta(hours=12)
    recent = [_photo(f"R{i}", noon - timedelta(days=i)) for i in range(60)]
    # 14 old days: two full ISO weeks starting on a Monday
    monday = noon - timedelta(days=119 + noon.weekday())
    old = [_photo(f"O{i}", monday + timedelta(days=i)) for i in range(14)]
    touched = [
        _photo("T1", monday + timedelta(days=1, hours=1), tags=["camera", "blüte"]),
        _photo("T2", monday + timedelta(days=2, hours=1), note="schön"),
        _photo("T3", monday + timedelta(days=3, hours=1), edit=PhotoEdit(0, 0, 0.5, 0.5, 0)),
        _photo("T4", monday + timedelta(days=4, hours=1)),  # the cover
        _photo("T5", monday + timedelta(days=5, hours=1), tags=[]),  # an upload, not a camera
    ]
    remove = photos_to_thin([*recent, *old, *touched], today, "T4")
    # of each old week only its first camera picture stays
    assert sorted(p.id for p in remove) == sorted(f"O{i}" for i in range(14) if i not in (0, 7))


async def test_daily_pictures_and_snapshot_now(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
    garden: tuple[MockConfigEntry, Any],  # noqa: F811
) -> None:
    entry, rose = garden
    manager = entry.runtime_data.manager
    client = await hass_ws_client(hass)

    # no camera linked yet
    msg = await _call(client, type="plant_garden/photos/snapshot", plant_id=rose.id)
    assert msg["error"]["code"] == "invalid_format"
    # only cameras can be linked
    msg = await _call(
        client, type="plant_garden/plants/update", plant_id=rose.id, camera_entity_id="sensor.x"
    )
    assert msg["success"] is False
    msg = await _call(
        client, type="plant_garden/plants/update", plant_id=rose.id, camera_entity_id=CAMERA
    )
    assert msg["result"]["camera_entity_id"] == CAMERA

    picture = Image(content_type="image/jpeg", content=make_image(640, 480))
    with patch(GET_IMAGE, return_value=picture) as get_image:
        msg = await _call(client, type="plant_garden/photos/snapshot", plant_id=rose.id)
        assert msg["success"], msg
        assert msg["result"]["tags"] == ["camera"]
        get_image.assert_awaited_once_with(hass, CAMERA)

        # noon of the next day: the daily picture, no AI involved
        noon = dt_util.start_of_local_day(dt_util.now() + timedelta(days=1)) + timedelta(hours=12)
        freezer.move_to(noon)
        async_fire_time_changed(hass, noon)
        await hass.async_block_till_done()
        photos = await manager.async_list_photos(rose.id)
        assert [p.tags for p in photos] == [["camera"], ["camera"]]

    # a camera that is down is skipped, the watch goes on
    with patch(GET_IMAGE, side_effect=HomeAssistantError("offline")):
        msg = await _call(client, type="plant_garden/photos/snapshot", plant_id=rose.id)
        assert msg["error"]["code"] == "invalid_format"
        later = noon + timedelta(days=1)
        freezer.move_to(later)
        async_fire_time_changed(hass, later)
        await hass.async_block_till_done()
    assert len(await manager.async_list_photos(rose.id)) == 2


async def test_weekly_look_of_the_ai(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    freezer: FrozenDateTimeFactory,
    garden: tuple[MockConfigEntry, Any],  # noqa: F811
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    # the fixture's weekly garden check would also call the AI on Mondays
    hass.config_entries.async_update_entry(entry, options={})
    await hass.async_block_till_done()
    await data.manager.async_update_plant(rose.id, {"camera_entity_id": CAMERA})
    earlier = await data.manager.async_add_photo(rose.id, make_image(), tags=["camera"])
    await data.manager.async_update_photo(
        earlier.id, {"taken_at": dt_util.utcnow() - timedelta(days=20)}
    )
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(COMPARISON)))
    picture = Image(content_type="image/jpeg", content=make_image(640, 480))

    def next_noon(weekday: int) -> datetime:
        day = dt_util.start_of_local_day(dt_util.now()) + timedelta(days=1)
        while day.weekday() != weekday:
            day += timedelta(days=1)
        return day + timedelta(hours=12)

    with patch(GET_IMAGE, return_value=picture):
        # the option is off: pictures, but no AI call - not even on a Monday
        monday = next_noon(0)
        freezer.move_to(monday)
        async_fire_time_changed(hass, monday)
        await hass.async_block_till_done()
        assert len(await data.manager.async_list_photos(rose.id)) == 2
        assert aioclient_mock.call_count == 0

        hass.config_entries.async_update_entry(
            entry, options={**entry.options, "camera_check": True}
        )
        await hass.async_block_till_done()
        # a Tuesday: still no AI call
        tuesday = next_noon(1)
        freezer.move_to(tuesday)
        async_fire_time_changed(hass, tuesday)
        await hass.async_block_till_done()
        assert aioclient_mock.call_count == 0

        # the next Monday the AI compares and opens a problem
        monday = next_noon(0)
        freezer.move_to(monday)
        async_fire_time_changed(hass, monday)
        await hass.async_block_till_done()
    assert aioclient_mock.call_count == 1
    [problem] = await data.care.async_problems(rose.id)
    assert problem.title == "Gelbe Blätter"
    [row] = await data.manager.async_usage_log(limit=5)
    assert row["feature"] == "compare"
