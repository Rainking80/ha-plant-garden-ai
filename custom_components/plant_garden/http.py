"""HTTP views for photo upload and download.

Uploads are multipart POSTs from the panel (authenticated with the user's token).
Downloads are requested by <img> tags with signed URLs (see serialize.photo_urls).
"""

from __future__ import annotations

from http import HTTPStatus
import logging

from aiohttp import BodyPartReader, web
from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.components.http.const import KEY_HASS_REFRESH_TOKEN_ID
from homeassistant.util import dt as dt_util

from .const import PHOTO_FILE_URL, PHOTO_UPLOAD_URL
from .garden import NotFoundError
from .photos import MAX_UPLOAD_BYTES, InvalidImageError, PhotoVariant, valid_id
from .runtime import get_manager
from .serialize import photo_dict

_LOGGER = logging.getLogger(__name__)

_TEXT_FIELD_LIMIT = 4096
_CACHE_FOREVER = "private, max-age=31536000, immutable"
_VARIANTS = frozenset(variant.value for variant in PhotoVariant)


class UploadTooLargeError(Exception):
    """The request body exceeds MAX_UPLOAD_BYTES."""


async def _read_part(part: BodyPartReader, limit: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while chunk := await part.read_chunk(64 * 1024):
        size += len(chunk)
        if size > limit:
            raise UploadTooLargeError
        chunks.append(chunk)
    return b"".join(chunks)


class PhotoUploadView(HomeAssistantView):
    """POST multipart: plant_id, file, optional taken_at (ISO), tags (comma separated), note."""

    url = PHOTO_UPLOAD_URL
    name = "api:plant_garden:photos:upload"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:  # noqa: PLR0911
        hass = request.app[KEY_HASS]
        manager = get_manager(hass)
        if manager is None:
            return self.json_message("Plant Garden is not set up", HTTPStatus.SERVICE_UNAVAILABLE)

        fields: dict[str, str] = {}
        image: bytes | None = None
        try:
            reader = await request.multipart()
            while (part := await reader.next()) is not None:
                if not isinstance(part, BodyPartReader):
                    continue
                if part.name == "file":
                    image = await _read_part(part, MAX_UPLOAD_BYTES)
                elif part.name in ("plant_id", "taken_at", "tags", "note"):
                    fields[part.name] = (await _read_part(part, _TEXT_FIELD_LIMIT)).decode()
        except UploadTooLargeError:
            return self.json_message("File too large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        except ValueError, UnicodeDecodeError, AssertionError:
            return self.json_message("Malformed upload", HTTPStatus.BAD_REQUEST)

        if image is None or "plant_id" not in fields:
            return self.json_message("plant_id and file are required", HTTPStatus.BAD_REQUEST)

        taken_at = dt_util.parse_datetime(fields["taken_at"]) if fields.get("taken_at") else None
        tags = fields.get("tags", "").split(",") if fields.get("tags") else []
        try:
            photo = await manager.async_add_photo(
                fields["plant_id"],
                image,
                taken_at=taken_at,
                tags=tags,
                note=fields.get("note", ""),
            )
        except NotFoundError:
            return self.json_message("Unknown plant", HTTPStatus.NOT_FOUND)
        except InvalidImageError as err:
            return self.json_message(err.reason, HTTPStatus.BAD_REQUEST, message_code=err.reason)

        return self.json(photo_dict(hass, photo, request.get(KEY_HASS_REFRESH_TOKEN_ID)))


class PhotoFileView(HomeAssistantView):
    """GET one size variant of a photo."""

    url = PHOTO_FILE_URL
    name = "api:plant_garden:photos:file"
    requires_auth = True

    async def get(self, request: web.Request, photo_id: str, variant: str) -> web.StreamResponse:
        hass = request.app[KEY_HASS]
        manager = get_manager(hass)
        if manager is None:
            return self.json_message("Plant Garden is not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        if not valid_id(photo_id) or variant not in _VARIANTS:
            raise web.HTTPNotFound
        try:
            photo = await manager.async_get_photo(photo_id)
        except NotFoundError:
            raise web.HTTPNotFound from None
        path = manager.photo_path(photo, PhotoVariant(variant))
        return web.FileResponse(path, headers={"Cache-Control": _CACHE_FOREVER})
