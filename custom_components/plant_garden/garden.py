"""The garden manager: single entry point for reading and changing garden data."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
import logging
from pathlib import Path
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now

from .database import GardenDatabase
from .models import (
    ENUM_FIELDS,
    NUMBER_FIELDS,
    TEXT_FIELDS,
    AgeReference,
    FieldSource,
    Measurement,
    Photo,
    Plant,
    Source,
)
from .photos import PhotoFiles, PhotoVariant, process_image
from .storage import GardenData, GardenStore, empty_garden_data

_LOGGER = logging.getLogger(__name__)

SAVE_DELAY = 2  # seconds; batches quick successive edits into one write


class NotFoundError(Exception):
    """A plant, photo or measurement does not exist."""


@dataclass(slots=True, frozen=True)
class GardenChange:
    """Sent to subscribers whenever garden data changes."""

    kind: str  # "plant" (created/updated, incl. photos and measurements) | "plant_removed"
    plant_id: str


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_tags(tags: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for tag in tags:
        if cleaned := tag.strip():
            seen.setdefault(cleaned, None)
    return list(seen)


class GardenManager:
    """Owns the Store, the SQLite database and the photo files."""

    def __init__(self, hass: HomeAssistant, data_dir: Path) -> None:
        self.hass = hass
        self.data_dir = data_dir
        self._store = GardenStore(hass)
        self._db = GardenDatabase(data_dir / "plant_garden.db")
        self._files = PhotoFiles(data_dir / "photos")
        self._plants: dict[str, Plant] = {}
        self._listeners: list[Callable[[GardenChange], None]] = []

    # ------------------------------------------------------------ lifecycle
    async def async_setup(self) -> None:
        stored = await self._store.async_load() or empty_garden_data()
        self._plants = {item["id"]: Plant.from_dict(item) for item in stored["plants"]}
        await self.hass.async_add_executor_job(self._db.open)
        _LOGGER.debug("Loaded %s plants from %s", len(self._plants), self.data_dir)

    async def async_shutdown(self) -> None:
        await self._store.async_save(self._data_to_save())
        await self.hass.async_add_executor_job(self._db.close)

    async def async_checkpoint(self) -> None:
        """Flush everything to disk (used before backups)."""
        await self._store.async_save(self._data_to_save())
        await self.hass.async_add_executor_job(self._db.checkpoint)

    def _data_to_save(self) -> GardenData:
        return {"plants": [plant.as_dict() for plant in self._plants.values()]}

    def _schedule_save(self) -> None:
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    # ------------------------------------------------------------ change events
    @callback
    def async_subscribe(self, listener: Callable[[GardenChange], None]) -> CALLBACK_TYPE:
        self._listeners.append(listener)

        @callback
        def unsubscribe() -> None:
            self._listeners.remove(listener)

        return unsubscribe

    @callback
    def _notify(self, kind: str, plant_id: str) -> None:
        change = GardenChange(kind=kind, plant_id=plant_id)
        for listener in list(self._listeners):
            listener(change)

    # ------------------------------------------------------------ plants
    @property
    def plants(self) -> list[Plant]:
        return sorted(self._plants.values(), key=lambda p: p.name.casefold())

    def get_plant(self, plant_id: str) -> Plant:
        try:
            return self._plants[plant_id]
        except KeyError:
            raise NotFoundError(plant_id) from None

    async def async_create_plant(self, fields: dict[str, Any]) -> Plant:
        now = dt_util.utcnow()
        plant = Plant(id=ulid_now(), name="", created_at=now, updated_at=now)
        self._apply_fields(plant, fields, Source.USER, now)
        self._plants[plant.id] = plant
        self._schedule_save()
        self._notify("plant", plant.id)
        return plant

    async def async_update_plant(self, plant_id: str, fields: dict[str, Any]) -> Plant:
        plant = self.get_plant(plant_id)
        now = dt_util.utcnow()
        self._apply_fields(plant, fields, Source.USER, now)
        plant.updated_at = now
        self._schedule_save()
        self._notify("plant", plant.id)
        return plant

    async def async_delete_plant(self, plant_id: str) -> None:
        self.get_plant(plant_id)
        await self.hass.async_add_executor_job(self._db.delete_plant_records, plant_id)
        await self.hass.async_add_executor_job(self._files.delete_plant, plant_id)
        del self._plants[plant_id]
        self._schedule_save()
        self._notify("plant_removed", plant_id)

    @staticmethod
    def _apply_fields(plant: Plant, fields: dict[str, Any], source: Source, now: datetime) -> None:
        """Set validated fields and record where they came from."""
        for key, value in fields.items():
            if key == "name":
                if not (name := _clean_text(value)):
                    raise ValueError("name must not be empty")
                plant.name = name
            elif key in TEXT_FIELDS:
                setattr(plant, key, _clean_text(value))
            elif key in ENUM_FIELDS:
                enum = ENUM_FIELDS[key]
                if value is None and key in ("category", "location_type", "status"):
                    continue  # these always have a value
                setattr(plant, key, enum(value) if value is not None else None)
            elif key in NUMBER_FIELDS:
                setattr(plant, key, float(value) if value is not None else None)
            elif key == "planted_on":
                plant.planted_on = value
            elif key == "age":
                plant.age = (
                    AgeReference(age_months=value["age_months"], on=value["on"]) if value else None
                )
            elif key == "tags":
                plant.tags = _clean_tags(value)
            else:
                raise ValueError(f"unknown field {key}")
            plant.sources[key] = FieldSource(source=source, updated_at=now)

    # ------------------------------------------------------------ summaries
    async def async_plant_summaries(self) -> list[tuple[Plant, dict[str, Any]]]:
        """Plants with photo count, cover photo and latest size, for list views."""
        stats = await self.hass.async_add_executor_job(self._db.photo_stats)
        sizes = await self.hass.async_add_executor_job(self._db.latest_sizes)
        result = []
        for plant in self.plants:
            count, newest = stats.get(plant.id, (0, None))
            extra = {
                "photo_count": count,
                "cover_photo_id": plant.cover_photo_id or newest,
                **sizes.get(plant.id, {}),
            }
            result.append((plant, extra))
        return result

    # ------------------------------------------------------------ photos
    async def async_add_photo(
        self,
        plant_id: str,
        data: bytes,
        *,
        taken_at: datetime | None = None,
        tags: list[str] | None = None,
        note: str = "",
    ) -> Photo:
        """Process and store an uploaded image.

        The capture time comes from EXIF if present, else from `taken_at` (the
        browser reads EXIF before it re-encodes), else it is the upload time.
        """
        self.get_plant(plant_id)
        image = await self.hass.async_add_executor_job(process_image, data)
        now = dt_util.utcnow()
        captured = image.taken_at or taken_at
        if captured is not None and captured.tzinfo is None:
            captured = captured.replace(tzinfo=dt_util.get_default_time_zone())
        photo = Photo(
            id=ulid_now(),
            plant_id=plant_id,
            taken_at=dt_util.as_utc(captured) if captured else now,
            uploaded_at=now,
            width=image.width,
            height=image.height,
            size_bytes=0,
            tags=_clean_tags(tags or []),
            note=note.strip(),
        )
        photo.size_bytes = await self.hass.async_add_executor_job(
            self._files.write, plant_id, photo.id, image
        )
        try:
            await self.hass.async_add_executor_job(self._db.insert_photo, photo)
        except Exception:
            await self.hass.async_add_executor_job(self._files.delete, plant_id, photo.id)
            raise
        self._notify("plant", plant_id)
        return photo

    async def async_get_photo(self, photo_id: str) -> Photo:
        photo = await self.hass.async_add_executor_job(self._db.get_photo, photo_id)
        if photo is None:
            raise NotFoundError(photo_id)
        return photo

    async def async_list_photos(self, plant_id: str) -> list[Photo]:
        self.get_plant(plant_id)
        return await self.hass.async_add_executor_job(self._db.photos_for_plant, plant_id)

    async def async_update_photo(self, photo_id: str, changes: dict[str, Any]) -> Photo:
        photo = await self.async_get_photo(photo_id)
        if "taken_at" in changes:
            photo.taken_at = dt_util.as_utc(changes["taken_at"])
        if "tags" in changes:
            photo.tags = _clean_tags(changes["tags"])
        if "note" in changes:
            photo.note = changes["note"].strip()
        await self.hass.async_add_executor_job(self._db.update_photo, photo)
        self._notify("plant", photo.plant_id)
        return photo

    async def async_delete_photo(self, photo_id: str) -> None:
        photo = await self.async_get_photo(photo_id)
        await self.hass.async_add_executor_job(self._db.delete_photo, photo_id)
        await self.hass.async_add_executor_job(self._files.delete, photo.plant_id, photo_id)
        plant = self._plants.get(photo.plant_id)
        if plant is not None and plant.cover_photo_id == photo_id:
            plant.cover_photo_id = None
            self._schedule_save()
        self._notify("plant", photo.plant_id)

    def photo_path(self, photo: Photo, variant: PhotoVariant) -> Path:
        return self._files.path(photo.plant_id, photo.id, variant)

    async def async_set_cover(self, plant_id: str, photo_id: str | None) -> Plant:
        plant = self.get_plant(plant_id)
        if photo_id is not None:
            photo = await self.async_get_photo(photo_id)
            if photo.plant_id != plant_id:
                raise NotFoundError(photo_id)
        plant.cover_photo_id = photo_id
        self._schedule_save()
        self._notify("plant", plant_id)
        return plant

    # ------------------------------------------------------------ measurements
    async def async_list_measurements(self, plant_id: str) -> list[Measurement]:
        self.get_plant(plant_id)
        return await self.hass.async_add_executor_job(self._db.measurements_for_plant, plant_id)

    async def async_add_measurement(
        self,
        plant_id: str,
        *,
        measured_on: date,
        height_cm: float | None,
        width_cm: float | None,
        note: str = "",
        photo_id: str | None = None,
        source: Source = Source.USER,
        confidence: float | None = None,
    ) -> Measurement:
        self.get_plant(plant_id)
        if height_cm is None and width_cm is None:
            raise ValueError("height or width required")
        measurement = Measurement(
            id=ulid_now(),
            plant_id=plant_id,
            measured_on=measured_on,
            height_cm=height_cm,
            width_cm=width_cm,
            source=source,
            confidence=confidence,
            photo_id=photo_id,
            note=note.strip(),
        )
        await self.hass.async_add_executor_job(self._db.insert_measurement, measurement)
        self._notify("plant", plant_id)
        return measurement

    async def async_update_measurement(
        self, measurement_id: str, changes: dict[str, Any]
    ) -> Measurement:
        measurement = await self.hass.async_add_executor_job(
            self._db.get_measurement, measurement_id
        )
        if measurement is None:
            raise NotFoundError(measurement_id)
        for key in ("measured_on", "height_cm", "width_cm", "photo_id"):
            if key in changes:
                setattr(measurement, key, changes[key])
        if "note" in changes:
            measurement.note = changes["note"].strip()
        if measurement.height_cm is None and measurement.width_cm is None:
            raise ValueError("height or width required")
        measurement.source = Source.USER
        measurement.confidence = None
        await self.hass.async_add_executor_job(self._db.update_measurement, measurement)
        self._notify("plant", measurement.plant_id)
        return measurement

    async def async_delete_measurement(self, measurement_id: str) -> None:
        measurement = await self.hass.async_add_executor_job(
            self._db.get_measurement, measurement_id
        )
        if measurement is None:
            raise NotFoundError(measurement_id)
        await self.hass.async_add_executor_job(self._db.delete_measurement, measurement_id)
        self._notify("plant", measurement.plant_id)
