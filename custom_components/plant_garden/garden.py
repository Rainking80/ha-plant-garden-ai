"""The garden manager: single entry point for reading and changing garden data."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import partial
import logging
from pathlib import Path
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now

from .const import PLAN_EXTENT_M
from .database import GardenDatabase
from .geo import reproject
from .irrigation import water_summary
from .models import (
    ENUM_FIELDS,
    NUMBER_FIELDS,
    TEXT_FIELDS,
    AgeReference,
    FieldSource,
    GeoPoint,
    Irrigation,
    IrrigationEvent,
    Layout,
    Marker,
    Measurement,
    Photo,
    Plant,
    PlantStatus,
    Point,
    Shape,
    ShapeKind,
    SoilType,
    Source,
)
from .photos import BackgroundFiles, PhotoFiles, PhotoVariant, process_background, process_image
from .storage import GardenData, GardenStore, empty_garden_data
from .weather.base import DailyWeather

_LOGGER = logging.getLogger(__name__)

SAVE_DELAY = 2  # seconds; batches quick successive edits into one write


class NotFoundError(Exception):
    """A plant, photo or measurement does not exist."""


class OutOfRangeError(ValueError):
    """Something would end up further than PLAN_EXTENT_M from the plan origin."""


@dataclass(slots=True, frozen=True)
class GardenChange:
    """Sent to subscribers whenever garden data changes.

    kind: "plant" (created/updated, incl. photos, measurements, position),
    "plant_removed", "layout" (a shape was saved or deleted) or "irrigation"
    (a zone started or stopped, water was logged or deleted) or "water" (weather
    or water balance recalculated).
    """

    kind: str
    plant_id: str | None = None
    shape_id: str | None = None


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _shift_geometry(
    geometry: dict[str, Any], shift: Callable[[float, float], tuple[float, float]]
) -> dict[str, Any]:
    """Move a shape's reference points; sizes in metres stay the same."""
    if geometry["type"] == "polygon":
        return {**geometry, "points": [list(shift(x, y)) for x, y in geometry["points"]]}
    cx, cy = shift(geometry["cx"], geometry["cy"])
    return {**geometry, "cx": cx, "cy": cy}


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
        self._backgrounds = BackgroundFiles(data_dir / "backgrounds")
        self._plants: dict[str, Plant] = {}
        self._layout = Layout()
        self._listeners: list[Callable[[GardenChange], None]] = []
        # awaited after a photo was added or changed (the assistant opens problems)
        self.photo_hooks: list[Callable[[Photo], Awaitable[None]]] = []

    @property
    def db(self) -> GardenDatabase:
        """The SQLite database, for modules that own tables of their own (care.py)."""
        return self._db

    # ------------------------------------------------------------ lifecycle
    async def async_setup(self) -> None:
        stored = await self._store.async_load() or empty_garden_data()
        self._plants = {item["id"]: Plant.from_dict(item) for item in stored["plants"]}
        self._layout = Layout.from_dict(stored.get("layout") or {})
        if self._layout.origin is None:
            # Fixed once: moving "home" in HA later must not shift the garden.
            self._layout.origin = GeoPoint(
                latitude=self.hass.config.latitude, longitude=self.hass.config.longitude
            )
            self._schedule_save()
        await self.hass.async_add_executor_job(self._db.open)
        await self.hass.async_add_executor_job(
            self._backgrounds.delete_unused, self._background_image_ids()
        )
        _LOGGER.debug("Loaded %s plants from %s", len(self._plants), self.data_dir)

    def _background_image_ids(self) -> set[str]:
        background = self._layout.background
        if background and background.get("type") == "image":
            return {background["image_id"]}
        return set()

    async def async_shutdown(self) -> None:
        await self._store.async_save(self._data_to_save())
        await self.hass.async_add_executor_job(self._db.close)

    async def async_checkpoint(self) -> None:
        """Flush everything to disk (used before backups)."""
        await self._store.async_save(self._data_to_save())
        await self.hass.async_add_executor_job(self._db.checkpoint)

    def _data_to_save(self) -> GardenData:
        return {
            "plants": [plant.as_dict() for plant in self._plants.values()],
            "layout": self._layout.as_dict(),
        }

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
    def _notify(self, kind: str, plant_id: str | None = None, shape_id: str | None = None) -> None:
        change = GardenChange(kind=kind, plant_id=plant_id, shape_id=shape_id)
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
        for shape in self._layout.shapes.values():
            changed = False
            if shape.plant_id == plant_id:
                shape.plant_id = None
                changed = True
            zone = shape.irrigation
            if zone and plant_id in (*zone.include, *zone.exclude):
                zone.include = [listed for listed in zone.include if listed != plant_id]
                zone.exclude = [listed for listed in zone.exclude if listed != plant_id]
                changed = True
            if changed:
                self._notify("layout", shape_id=shape.id)
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
            elif key == "position":
                plant.position = Point(x=float(value["x"]), y=float(value["y"])) if value else None
            else:
                raise ValueError(f"unknown field {key}")
            plant.sources[key] = FieldSource(source=source, updated_at=now)

    async def async_apply_ai_fields(
        self, plant_id: str, fields: dict[str, Any], *, confidence: float | None, model: str
    ) -> list[str]:
        """Take over accepted AI suggestions. Fields the user set are never replaced."""
        plant = self.get_plant(plant_id)
        now = dt_util.utcnow()
        applied = []
        for key, value in fields.items():
            current = plant.sources.get(key)
            if current is not None and current.source is Source.USER:
                continue
            self._apply_fields(plant, {key: value}, Source.AI, now)
            plant.sources[key] = FieldSource(
                source=Source.AI, updated_at=now, confidence=confidence, model=model
            )
            applied.append(key)
        if applied:
            plant.updated_at = now
            self._schedule_save()
            self._notify("plant", plant.id)
        return applied

    async def async_move_plants(self, moves: Sequence[tuple[str, Point | None]]) -> list[Plant]:
        """Set several positions at once (one save, used for drag and drop and undo)."""
        plants = [self.get_plant(plant_id) for plant_id, _ in moves]  # validate all first
        now = dt_util.utcnow()
        for plant, (_, position) in zip(plants, moves, strict=True):
            plant.position = position
            plant.sources["position"] = FieldSource(source=Source.USER, updated_at=now)
            plant.updated_at = now
        self._schedule_save()
        for plant in plants:
            self._notify("plant", plant.id)
        return plants

    # ------------------------------------------------------------ layout
    @property
    def layout(self) -> Layout:
        return self._layout

    def shapes(self) -> list[Shape]:
        """Drawing order: z ascending, then creation order."""
        return sorted(self._layout.shapes.values(), key=lambda shape: shape.z)

    async def async_save_shape(self, data: dict[str, Any]) -> Shape:
        """Create or replace a shape. Clients may choose the id (needed to undo a delete)."""
        if (plant_id := data.get("plant_id")) is not None:
            self.get_plant(plant_id)
        kind = ShapeKind(data["kind"])
        irrigation = None
        if kind is ShapeKind.ZONE:
            irrigation = Irrigation.from_dict(data.get("irrigation") or {})
            for listed in (irrigation.include, irrigation.exclude):
                for listed_id in listed:
                    self.get_plant(listed_id)
        shape = Shape(
            id=data.get("id") or ulid_now(),
            kind=kind,
            geometry=data["geometry"],
            label=_clean_text(data.get("label")),
            plant_id=plant_id,
            soil_type=SoilType(data["soil_type"]) if data.get("soil_type") else None,
            locked=bool(data.get("locked", False)),
            z=int(data.get("z", 0)),
            irrigation=irrigation,
        )
        self._layout.shapes[shape.id] = shape
        self._schedule_save()
        self._notify("layout", shape_id=shape.id)
        return shape

    async def async_delete_shape(self, shape_id: str) -> None:
        if self._layout.shapes.pop(shape_id, None) is None:
            raise NotFoundError(shape_id)
        self._schedule_save()
        self._notify("layout", shape_id=shape_id)

    # ------------------------------------------------------------ zones and water
    def zones(self) -> list[Shape]:
        return [shape for shape in self.shapes() if shape.kind is ShapeKind.ZONE]

    def get_zone(self, zone_id: str) -> Shape:
        shape = self._layout.shapes.get(zone_id)
        if shape is None or shape.kind is not ShapeKind.ZONE:
            raise NotFoundError(zone_id)
        return shape

    def watered_plants(self) -> list[Plant]:
        """Plants that can receive water (removed ones are no longer in the garden)."""
        return [plant for plant in self._plants.values() if plant.status is not PlantStatus.REMOVED]

    async def async_latest_widths(self) -> dict[str, float]:
        sizes = await self.hass.async_add_executor_job(self._db.latest_sizes)
        return {plant_id: s["width_cm"] for plant_id, s in sizes.items() if s.get("width_cm")}

    async def async_insert_event(self, event: IrrigationEvent) -> bool:
        """Store an irrigation event; False if this zone run is already recorded."""
        return await self.hass.async_add_executor_job(self._db.insert_event, event)

    async def async_delete_event(self, event_id: str) -> None:
        if await self.hass.async_add_executor_job(self._db.get_event, event_id) is None:
            raise NotFoundError(event_id)
        await self.hass.async_add_executor_job(self._db.delete_event, event_id)

    async def async_recent_events(
        self, *, zone_id: str | None = None, plant_id: str | None = None, limit: int = 50
    ) -> list[IrrigationEvent]:
        return await self.hass.async_add_executor_job(
            partial(self._db.recent_events, zone_id=zone_id, plant_id=plant_id, limit=limit)
        )

    async def async_water_summary(self, today: date, days: int) -> dict[str, Any]:
        def query() -> dict[str, Any]:
            return water_summary(
                by_day=self._db.plant_water_by_day(today - timedelta(days=days - 1)),
                totals=self._db.plant_totals(),
                zone_today=self._db.zone_day_totals(today),
                zone_last=self._db.zone_last_runs(),
                today=today,
                days=days,
            )

        return await self.hass.async_add_executor_job(query)

    async def async_plant_water_by_day(
        self, since: date
    ) -> dict[str, dict[str, tuple[float, float]]]:
        """plant_id -> ISO day -> (litres, mm) of irrigation from `since` on."""
        return await self.hass.async_add_executor_job(self._db.plant_water_by_day, since)

    async def async_store_weather(self, days: list[DailyWeather], fetched_at: datetime) -> None:
        await self.hass.async_add_executor_job(
            self._db.upsert_weather, [day.as_dict() for day in days], fetched_at.isoformat()
        )

    async def async_stored_weather(self, since: date) -> list[DailyWeather]:
        rows = await self.hass.async_add_executor_job(self._db.weather_since, since)
        return [DailyWeather.from_dict(row) for row in rows]

    @callback
    def notify_irrigation(self) -> None:
        """Irrigation data changed (a run started or ended, an event was logged)."""
        self._notify("irrigation")

    @callback
    def notify_water(self) -> None:
        """The weather or a water balance was recalculated."""
        self._notify("water")

    @callback
    def notify_ai(self, plant_id: str | None = None) -> None:
        """An AI call was logged or an identification of a plant changed."""
        self._notify("ai", plant_id)

    @callback
    def notify_care(self, plant_id: str | None = None) -> None:
        """Tasks, problems, questions or the chat changed."""
        self._notify("care", plant_id)

    # ------------------------------------------------------------ AI usage log
    async def async_insert_usage(self, row: dict[str, Any]) -> None:
        await self.hass.async_add_executor_job(self._db.insert_usage, row)

    async def async_usage_totals(self, since: date | None) -> dict[str, Any]:
        return await self.hass.async_add_executor_job(self._db.usage_totals, since)

    async def async_usage_breakdown(self, since: date, column: str) -> list[dict[str, Any]]:
        return await self.hass.async_add_executor_job(self._db.usage_breakdown, since, column)

    async def async_usage_daily_cost(self, since: date) -> list[dict[str, Any]]:
        return await self.hass.async_add_executor_job(self._db.usage_daily_cost, since)

    async def async_usage_log(self, **filters: Any) -> list[dict[str, Any]]:
        return await self.hass.async_add_executor_job(partial(self._db.usage_log, **filters))

    async def async_purge_usage(self, before: date) -> int:
        return await self.hass.async_add_executor_job(self._db.purge_usage, before)

    async def async_storage_stats(self) -> dict[str, int]:
        """Bytes used by the database and by the photo and background files."""

        def measure() -> dict[str, int]:
            stats = self._db.storage_stats()
            for name, root in (
                ("photos", self._files.root),
                ("backgrounds", self._backgrounds.root),
            ):
                stats[name] = sum(p.stat().st_size for p in root.rglob("*") if p.is_file())
            return stats

        return await self.hass.async_add_executor_job(measure)

    # ------------------------------------------------------------ origin
    async def async_set_origin(
        self, latitude: float, longitude: float, *, move_content: bool = False
    ) -> None:
        """Move the plan origin, e.g. for an allotment away from HA's home location.

        By default everything keeps its place on the map (coordinates are
        recalculated for the new origin). With `move_content` the plan
        coordinates stay as they are, so the drawing moves along with the origin.
        """
        new = GeoPoint(latitude=latitude, longitude=longitude)
        old = self._layout.origin
        moved_plants: list[str] = []
        if old is not None and not move_content and old != new:

            def shift(x: float, y: float) -> tuple[float, float]:
                return reproject(old, new, x, y)

            # Check everything before changing anything.
            for x, y in self._content_points():
                if max(abs(c) for c in shift(x, y)) > PLAN_EXTENT_M:
                    raise OutOfRangeError(
                        f"content would be more than {PLAN_EXTENT_M} m from the new location"
                    )
            for plant in self._plants.values():
                if plant.position is not None:
                    plant.position = Point(*shift(plant.position.x, plant.position.y))
                    moved_plants.append(plant.id)
            for shape in self._layout.shapes.values():
                shape.geometry = _shift_geometry(shape.geometry, shift)
            for marker in self._layout.markers.values():
                marker.x, marker.y = shift(marker.x, marker.y)
            background = self._layout.background
            if background and background.get("type") == "image":
                x, y = shift(background["x"], background["y"])
                self._layout.background = {**background, "x": x, "y": y}
        self._layout.origin = new
        self._schedule_save()
        self._notify("layout")
        for plant_id in moved_plants:
            self._notify("plant", plant_id)

    def _content_points(self) -> list[tuple[float, float]]:
        """Every stored plan coordinate (reference points only, not sizes)."""
        points = [(p.position.x, p.position.y) for p in self._plants.values() if p.position]
        for shape in self._layout.shapes.values():
            geometry = shape.geometry
            if geometry["type"] == "polygon":
                points.extend((x, y) for x, y in geometry["points"])
            else:
                points.append((geometry["cx"], geometry["cy"]))
        points.extend((m.x, m.y) for m in self._layout.markers.values())
        background = self._layout.background
        if background and background.get("type") == "image":
            points.append((background["x"], background["y"]))
        return points

    # ------------------------------------------------------------ background
    async def async_upload_background(self, data: bytes) -> dict[str, Any]:
        """Store an image for use as background; it becomes active via async_set_background."""
        content, width, height = await self.hass.async_add_executor_job(process_background, data)
        image_id = ulid_now()
        await self.hass.async_add_executor_job(self._backgrounds.write, image_id, content)
        return {"image_id": image_id, "width_px": width, "height_px": height}

    async def async_background_path(self, image_id: str) -> Path:
        """Path of an uploaded background image (active or just uploaded)."""
        path = self._backgrounds.path(image_id)
        if not await self.hass.async_add_executor_job(path.exists):
            raise NotFoundError(image_id)
        return path

    async def async_set_background(self, background: dict[str, Any] | None) -> None:
        """Replace the background.

        A previous image file is kept until the next start (see async_setup), so
        that undo in the panel can switch back to it.
        """
        if background is not None:
            kind = background.get("type")
            if kind == "none":
                background = None
            elif kind == "wms" and not (
                background.get("preset") or (background.get("url") and background.get("layers"))
            ):
                raise ValueError("a WMS background needs a preset or url and layers")
            elif kind == "image":
                await self.async_background_path(background["image_id"])
        self._layout.background = background
        self._schedule_save()
        self._notify("layout")

    # ------------------------------------------------------------ markers
    async def async_save_marker(self, data: dict[str, Any]) -> Marker:
        marker = Marker(
            id=data.get("id") or ulid_now(),
            entity_id=data["entity_id"],
            x=float(data["x"]),
            y=float(data["y"]),
            label=_clean_text(data.get("label")),
        )
        self._layout.markers[marker.id] = marker
        self._schedule_save()
        self._notify("layout")
        return marker

    async def async_delete_marker(self, marker_id: str) -> None:
        if self._layout.markers.pop(marker_id, None) is None:
            raise NotFoundError(marker_id)
        self._schedule_save()
        self._notify("layout")

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
        await self._run_photo_hooks(photo)
        return photo

    async def _run_photo_hooks(self, photo: Photo) -> None:
        for hook in list(self.photo_hooks):
            try:
                await hook(photo)
            except Exception:
                _LOGGER.exception("Photo hook failed for %s", photo.id)

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
        await self._run_photo_hooks(photo)
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
