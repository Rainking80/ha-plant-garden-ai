"""HTTP and WebSocket API of the dream garden (D-049).

The photo is uploaded over HTTP; photo and pictures are served through signed
URLs like plant photos. Every AI step is its own command, started by the user.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
import functools
from http import HTTPStatus
from typing import Any

from aiohttp import BodyPartReader, web
from homeassistant.components import websocket_api
from homeassistant.components.http import KEY_HASS, KEY_HASS_REFRESH_TOKEN_ID, HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant, callback
import probatio

from .ai.base import AIError, BudgetExceededError
from .ai.dream import PHOTO, DreamGarden
from .ai.schemas import DREAM_STRENGTHS, DREAM_STYLES
from .const import DOMAIN
from .garden import NotFoundError
from .http import UploadTooLargeError, _read_part, _require_auth
from .photos import MAX_UPLOAD_BYTES, InvalidImageError, valid_id
from .runtime import get_loaded_entry
from .serialize import SIGNED_URL_LIFETIME
from .websocket_ai import ERR_AI, ERR_BUDGET
from .websocket_api import COORD

DREAM_UPLOAD_URL = "/api/plant_garden/dreams"
DREAM_FILE_URL = "/api/plant_garden/dreams/{design_id}/{name}"
_CACHE_FOREVER = "private, max-age=31536000, immutable"
TEXT = probatio.All(str, probatio.Length(max=600))

type DreamHandler = Callable[
    [HomeAssistant, websocket_api.ActiveConnection, dict[str, Any], DreamGarden], Awaitable[Any]
]


def _dream(hass: HomeAssistant) -> DreamGarden | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.dream if entry else None


def design_dict(
    hass: HomeAssistant, design: dict[str, Any], refresh_token_id: str | None
) -> dict[str, Any]:
    """A design for the panel, with signed URLs of its photo and pictures."""

    def url(name: str) -> str:
        path = DREAM_FILE_URL.format(design_id=design["id"], name=name)
        return async_sign_path(hass, path, SIGNED_URL_LIFETIME, refresh_token_id=refresh_token_id)

    return {
        **design,
        "photo_url": url(PHOTO),
        "pictures": [{**picture, "url": url(picture["id"])} for picture in design["pictures"]],
    }


def dream_command(
    schema: dict[Any, Any],
) -> Callable[[DreamHandler], websocket_api.const.WebSocketCommandHandler]:
    """A command of the dream garden; AI errors and bad input become readable errors."""

    def decorator(func: DreamHandler) -> websocket_api.const.WebSocketCommandHandler:
        @websocket_api.websocket_command(schema)
        @websocket_api.async_response
        @functools.wraps(func)
        async def handler(
            hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
        ) -> None:
            dream = _dream(hass)
            if dream is None:
                connection.send_error(msg["id"], "not_loaded", "Autogarden is not set up")
                return
            try:
                result = await func(hass, connection, msg, dream)
            except NotFoundError as err:
                connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Not found: {err}")
            except BudgetExceededError as err:
                connection.send_error(msg["id"], ERR_BUDGET, str(err))
            except AIError as err:
                connection.send_error(msg["id"], ERR_AI, str(err))
            except ValueError as err:
                connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
            else:
                connection.send_result(msg["id"], result)

        return handler

    return decorator


def _type(name: str) -> dict[Any, Any]:
    return {probatio.Required("type"): f"{DOMAIN}/dream/{name}"}


DESIGN = {probatio.Required("design_id"): str}


@dream_command(_type("list"))
async def ws_dream_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> dict[str, Any]:  # fmt: skip
    """All designs (newest first) and who would create a picture at what price."""
    entry = get_loaded_entry(hass)
    ai = entry.runtime_data.ai if entry else None
    return {
        "designs": [
            design_dict(hass, design, connection.refresh_token_id) for design in dream.designs()
        ],
        "image": ai.image_info() if ai else None,
        "styles": DREAM_STYLES,
    }


@dream_command({**_type("look"), **DESIGN})
async def ws_dream_look(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> dict[str, Any]:  # fmt: skip
    """Step 1: the AI describes the photo and asks back (an AI call)."""
    design = await dream.async_look(msg["design_id"])
    return design_dict(hass, design, connection.refresh_token_id)


@dream_command(
    {
        **_type("concept"),
        **DESIGN,
        probatio.Optional("wish", default=""): TEXT,
        probatio.Optional("style"): probatio.Any(None, probatio.In(DREAM_STYLES)),
        probatio.Optional("strength", default="medium"): probatio.In(DREAM_STRENGTHS),
        probatio.Optional("keep", default=list): probatio.All([str], probatio.Length(max=12)),
        probatio.Optional("answers", default=list): probatio.All(
            [{probatio.Required("question"): str, probatio.Required("answer"): str}],
            probatio.Length(max=6),
        ),
    }
)
async def ws_dream_concept(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> dict[str, Any]:  # fmt: skip
    """Step 2: the planting concept for the wishes and the site (an AI call)."""
    brief = {key: msg.get(key) for key in ("wish", "style", "strength", "keep", "answers")}
    design = await dream.async_concept(msg["design_id"], brief)
    return design_dict(hass, design, connection.refresh_token_id)


@dream_command(
    {
        **_type("picture"),
        **DESIGN,
        probatio.Optional("plants"): probatio.Any(None, [str]),
        probatio.Optional("instruction"): probatio.Any(None, TEXT),
        probatio.Optional("base"): probatio.Any(None, str),
    }
)
async def ws_dream_picture(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> dict[str, Any]:  # fmt: skip
    """Step 3: a picture of the concept (the dearest call; the panel asks before)."""
    design = await dream.async_picture(
        msg["design_id"],
        plant_ids=msg.get("plants"),
        instruction=msg.get("instruction"),
        base=msg.get("base"),
    )
    return design_dict(hass, design, connection.refresh_token_id)


@dream_command({**_type("picture/delete"), **DESIGN, probatio.Required("picture_id"): str})
async def ws_dream_picture_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> dict[str, Any]:  # fmt: skip
    design = await dream.async_delete_picture(msg["design_id"], msg["picture_id"])
    return design_dict(hass, design, connection.refresh_token_id)


@dream_command({**_type("plant"), **DESIGN, probatio.Required("plants"): [str]})
async def ws_dream_plant(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> dict[str, Any]:  # fmt: skip
    """Take plants of the concept over as planned plants with a task each."""
    result = await dream.async_plant(msg["design_id"], msg["plants"])
    return {
        "design": design_dict(hass, result["design"], connection.refresh_token_id),
        "plants": result["plants"],
    }


@dream_command({**_type("delete"), **DESIGN})
async def ws_dream_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
    dream: DreamGarden,
) -> None:  # fmt: skip
    await dream.async_delete(msg["design_id"])


@callback
def async_register_dream_commands(hass: HomeAssistant) -> None:
    for command in (
        ws_dream_list,
        ws_dream_look,
        ws_dream_concept,
        ws_dream_picture,
        ws_dream_picture_delete,
        ws_dream_plant,
        ws_dream_delete,
    ):
        websocket_api.async_register_command(hass, command)
    hass.http.register_view(DreamUploadView())
    hass.http.register_view(DreamFileView())


class DreamUploadView(HomeAssistantView):
    """POST multipart: file, optional x and y (the place on the plan the photo shows)."""

    url = DREAM_UPLOAD_URL
    name = "api:plant_garden:dreams:upload"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:  # noqa: PLR0911
        hass = request.app[KEY_HASS]
        dream = _dream(hass)
        if dream is None:
            return self.json_message("Autogarden is not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        image: bytes | None = None
        fields: dict[str, str] = {}
        try:
            reader = await request.multipart()
            while (part := await reader.next()) is not None:
                if not isinstance(part, BodyPartReader):
                    continue
                if part.name == "file":
                    image = await _read_part(part, MAX_UPLOAD_BYTES)
                elif part.name in ("x", "y"):
                    fields[part.name] = (await _read_part(part, 64)).decode()
        except UploadTooLargeError:
            return self.json_message("File too large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        except ValueError, UnicodeDecodeError, AssertionError:
            return self.json_message("Malformed upload", HTTPStatus.BAD_REQUEST)
        if image is None:
            return self.json_message("file is required", HTTPStatus.BAD_REQUEST)
        try:
            place = (
                {"x": COORD(float(fields["x"])), "y": COORD(float(fields["y"]))}
                if "x" in fields and "y" in fields
                else {}
            )
            design = await dream.async_create(image, **place)
        except InvalidImageError as err:
            return self.json_message(err.reason, HTTPStatus.BAD_REQUEST, message_code=err.reason)
        except (ValueError, probatio.Invalid) as err:
            return self.json_message(str(err), HTTPStatus.BAD_REQUEST)
        return self.json(design_dict(hass, design, request.get(KEY_HASS_REFRESH_TOKEN_ID)))


class DreamFileView(HomeAssistantView):
    """GET a design's photo or one of its pictures (auth as for plant photos, D-011)."""

    url = DREAM_FILE_URL
    name = "api:plant_garden:dreams:file"
    requires_auth = False

    async def get(self, request: web.Request, design_id: str, name: str) -> web.StreamResponse:
        _require_auth(request)
        dream = _dream(request.app[KEY_HASS])
        if dream is None:
            return self.json_message("Autogarden is not set up", HTTPStatus.SERVICE_UNAVAILABLE)
        if not valid_id(design_id):
            raise web.HTTPNotFound
        try:
            path = dream.file_path(design_id, name)
        except NotFoundError:
            raise web.HTTPNotFound from None
        return web.FileResponse(path, headers={"Cache-Control": _CACHE_FOREVER})
