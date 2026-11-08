"""JSON shapes sent to the panel (WebSocket and HTTP)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import BACKGROUND_FILE_URL, PHOTO_FILE_URL
from .models import Layout, Measurement, Photo, Plant
from .photos import PhotoVariant

# Long enough for a panel that stays open all day; the panel reloads data when
# it becomes visible again, which issues fresh URLs.
SIGNED_URL_LIFETIME = timedelta(hours=24)


def local_today() -> date:
    return dt_util.now().date()


def photo_urls(hass: HomeAssistant, photo_id: str, refresh_token_id: str | None) -> dict[str, str]:
    """Signed URLs that work in <img src> without an Authorization header."""
    return {
        variant.value: async_sign_path(
            hass,
            PHOTO_FILE_URL.format(photo_id=photo_id, variant=variant.value),
            SIGNED_URL_LIFETIME,
            refresh_token_id=refresh_token_id,
        )
        for variant in PhotoVariant
    }


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
        {"id": cover_id, "urls": photo_urls(hass, cover_id, refresh_token_id)} if cover_id else None
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
        "urls": photo_urls(hass, photo.id, refresh_token_id),
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
