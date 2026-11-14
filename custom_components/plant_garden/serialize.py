"""JSON shapes sent to the panel (WebSocket and HTTP)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import BACKGROUND_FILE_URL, PHOTO_FILE_URL
from .models import IrrigationEvent, Layout, Measurement, Photo, Plant
from .photos import SOURCE, PhotoVariant

# Long enough for a panel that stays open all day; the panel reloads data when
# it becomes visible again, which issues fresh URLs.
SIGNED_URL_LIFETIME = timedelta(hours=24)


def local_today() -> date:
    return dt_util.now().date()


def photo_urls(
    hass: HomeAssistant,
    photo_id: str,
    refresh_token_id: str | None,
    version: str | None = None,
) -> dict[str, str]:
    """Signed URLs that work in <img src> without an Authorization header.

    The files are cached as immutable, so the variants of an edited photo carry
    its version stamp: a new crop gets new URLs. `source` is the upload itself.
    """
    query = f"?v={version}" if version else ""

    def sign(name: str, suffix: str) -> str:
        path = PHOTO_FILE_URL.format(photo_id=photo_id, variant=name) + suffix
        return async_sign_path(hass, path, SIGNED_URL_LIFETIME, refresh_token_id=refresh_token_id)

    urls = {variant.value: sign(variant.value, query) for variant in PhotoVariant}
    urls[SOURCE] = sign(SOURCE, "")
    return urls


def background_url(hass: HomeAssistant, image_id: str, refresh_token_id: str | None) -> str:
    return async_sign_path(
        hass,
        BACKGROUND_FILE_URL.format(image_id=image_id),
        SIGNED_URL_LIFETIME,
        refresh_token_id=refresh_token_id,
    )


def layout_dict(
    hass: HomeAssistant, layout: Layout, shapes: list[Any], refresh_token_id: str | None
) -> dict[str, Any]:
    """The plan for the panel; an image background gets a signed URL."""
    background = dict(layout.background) if layout.background else None
    if background and background.get("type") == "image":
        background["url"] = background_url(hass, background["image_id"], refresh_token_id)
    return {
        "origin": layout.origin.as_dict() if layout.origin else None,
        "shapes": [shape.as_dict() for shape in shapes],
        "background": background,
        "markers": [marker.as_dict() for marker in layout.markers.values()],
    }


def plant_dict(
    hass: HomeAssistant,
    plant: Plant,
    extra: dict[str, Any],
    refresh_token_id: str | None,
) -> dict[str, Any]:
    data = plant.as_dict()
    data["age_months_now"] = plant.age_months(local_today())
    data["photo_count"] = extra.get("photo_count", 0)
    cover_id = extra.get("cover_photo_id")
    data["cover"] = (
        {
            "id": cover_id,
            "urls": photo_urls(hass, cover_id, refresh_token_id, extra.get("cover_version")),
        }
        if cover_id
        else None
    )
    for key in ("height_cm", "height_cm_on", "width_cm", "width_cm_on"):
        data[key] = extra.get(key)
    return data


def photo_dict(hass: HomeAssistant, photo: Photo, refresh_token_id: str | None) -> dict[str, Any]:
    return {
        "id": photo.id,
        "plant_id": photo.plant_id,
        "taken_at": photo.taken_at.isoformat(),
        "uploaded_at": photo.uploaded_at.isoformat(),
        "width": photo.width,
        "height": photo.height,
        "size_bytes": photo.size_bytes,
        "tags": photo.tags,
        "note": photo.note,
        "edit": photo.edit.as_dict() if photo.edit else None,
        "urls": photo_urls(
            hass, photo.id, refresh_token_id, photo.edit.version if photo.edit else None
        ),
    }


def measurement_dict(measurement: Measurement) -> dict[str, Any]:
    return {
        "id": measurement.id,
        "plant_id": measurement.plant_id,
        "measured_on": measurement.measured_on.isoformat(),
        "height_cm": measurement.height_cm,
        "width_cm": measurement.width_cm,
        "source": measurement.source.value,
        "confidence": measurement.confidence,
        "photo_id": measurement.photo_id,
        "note": measurement.note,
    }


def event_dict(event: IrrigationEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "zone_id": event.zone_id,
        "started_at": event.started_at.isoformat(),
        "ended_at": event.ended_at.isoformat(),
        "duration_s": round(event.duration_s),
        "day": event.day.isoformat(),
        "source": event.source.value,
        "liters": event.liters,
        "depth_mm": event.depth_mm,
        "uncertain": event.uncertain,
        "reconstructed": event.reconstructed,
        "note": event.note,
        "plants": [
            {"plant_id": share.plant_id, "liters": share.liters, "mm": share.mm}
            for share in event.plants
        ],
    }
