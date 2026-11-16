"""The camera watch: a daily picture of every plant with a camera, for a time-lapse.

Linking a camera to a plant is the switch: from then on one snapshot a day is
added to the plant's photos (tag "camera"). That costs nothing and calls no AI.
With the option `camera_check` the AI compares the newest camera picture with
an earlier one once a week and opens a problem when something looks wrong.

Old camera pictures are thinned out, so a season stays a few hundred pictures:
all of the last 60 days, then one per week. Pictures the user touched (other
tags, a note, a crop, the cover) are never removed.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .ai.base import AIError, Feature
from .const import CAMERA_TAG, CONF_CAMERA_CHECK
from .garden import GardenManager
from .models import Photo, PlantStatus

_LOGGER = logging.getLogger(__name__)

SNAPSHOT_HOUR = 12  # local time: similar light every day
KEEP_ALL_DAYS = 60
CHECK_WEEKDAY = 0  # Monday


def photos_to_thin(photos: Iterable[Photo], today: date, cover_id: str | None) -> list[Photo]:
    """Untouched camera pictures older than KEEP_ALL_DAYS, except the first of each week."""
    limit = today - timedelta(days=KEEP_ALL_DAYS)
    kept_weeks: set[tuple[int, int]] = set()
    remove = []
    for photo in sorted(photos, key=lambda p: p.taken_at):
        day = dt_util.as_local(photo.taken_at).date()
        untouched = (
            photo.tags == [CAMERA_TAG]
            and not photo.note
            and photo.edit is None
            and photo.id != cover_id
        )
        if not untouched or day > limit:
            continue
        week = day.isocalendar()[:2]
        if week in kept_weeks:
            remove.append(photo)
        else:
            kept_weeks.add(week)
    return remove


async def async_camera_picture(hass: HomeAssistant, entity_id: str) -> bytes:
    """The current picture of a camera entity."""
    # imported here: the camera integration needs extra packages (PyTurboJPEG)
    from homeassistant.components.camera import async_get_image  # noqa: PLC0415

    return (await async_get_image(hass, entity_id)).content


class CameraWatcher:
    """Takes the daily pictures and runs the weekly look of the AI."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        *,
        manager: GardenManager,
        assistant: Any,  # Assistant (import cycle)
        ai: Any,  # AIService
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._manager = manager
        self._assistant = assistant
        self._ai = ai
        self._unsub: CALLBACK_TYPE | None = None

    @callback
    def async_start(self) -> None:
        self._unsub = async_track_time_change(
            self.hass, self._async_tick, hour=SNAPSHOT_HOUR, minute=0, second=0
        )

    @callback
    def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    async def async_snapshot(self, plant_id: str) -> Photo:
        """A picture of the plant from its camera, now."""
        plant = self._manager.get_plant(plant_id)
        if not plant.camera_entity_id:
            raise ValueError("no camera is linked to this plant")
        try:
            picture = await async_camera_picture(self.hass, plant.camera_entity_id)
        except HomeAssistantError as err:
            raise ValueError(f"the camera delivered no picture: {err}") from err
        photo = await self._manager.async_add_photo(plant_id, picture, tags=[CAMERA_TAG])
        await self._async_thin(plant_id)
        return photo

    async def _async_thin(self, plant_id: str) -> None:
        plant = self._manager.get_plant(plant_id)
        photos = await self._manager.async_list_photos(plant_id)
        for photo in photos_to_thin(photos, dt_util.now().date(), plant.cover_photo_id):
            await self._manager.async_delete_photo(photo.id)

    async def _async_tick(self, now: datetime) -> None:
        """Noon: one picture per plant with a camera; on Mondays the AI looks at them."""
        check = (
            bool(self._entry.options.get(CONF_CAMERA_CHECK))
            and dt_util.as_local(now).weekday() == CHECK_WEEKDAY
            and self._ai.subentry_for(Feature.COMPARE) is not None
        )
        for plant in self._manager.plants:
            if not plant.camera_entity_id or plant.status is PlantStatus.REMOVED:
                continue
            try:
                photo = await self.async_snapshot(plant.id)
            except ValueError as err:
                _LOGGER.warning("Camera picture of %s failed: %s", plant.name, err)
                continue
            if not check:
                continue
            try:
                await self._assistant.async_compare(photo.id)
            except AIError as err:
                # no earlier picture yet, the budget is used up, the provider is down
                _LOGGER.info("Weekly look at %s skipped: %s", plant.name, err)
