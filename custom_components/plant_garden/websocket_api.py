"""WebSocket API used by the Plant Garden panel."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from enum import StrEnum
import functools
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
import probatio

from .const import DOMAIN
from .garden import GardenChange, GardenManager, NotFoundError
from .models import Light, LocationType, PlantCategory, PlantStatus, SoilType, WaterNeed
from .runtime import get_loaded_entry, get_manager
from .serialize import measurement_dict, photo_dict, plant_dict

type GardenHandler = Callable[
    [HomeAssistant, websocket_api.ActiveConnection, dict[str, Any], GardenManager],
    Awaitable[Any],
]

ERR_NOT_LOADED = "not_loaded"


def _text(max_length: int) -> Any:
    return probatio.Any(None, probatio.All(str, probatio.Length(max=max_length)))


def _choice(enum: type[StrEnum]) -> Any:
    return probatio.Any(None, probatio.In([member.value for member in enum]))


def _number(minimum: float, maximum: float) -> Any:
    return probatio.All(probatio.Any(int, float), probatio.Range(min=minimum, max=maximum))


TAGS = [probatio.All(str, probatio.Length(max=40))]

PLANT_FIELDS: dict[Any, Any] = {
    probatio.Optional("scientific_name"): _text(200),
    probatio.Optional("variety"): _text(200),
    probatio.Optional("family"): _text(100),
    probatio.Optional("notes"): _text(5000),
    probatio.Optional("category"): _choice(PlantCategory),
    probatio.Optional("location_type"): _choice(LocationType),
    probatio.Optional("light"): _choice(Light),
    probatio.Optional("water_need"): _choice(WaterNeed),
    probatio.Optional("soil_type"): _choice(SoilType),
    probatio.Optional("status"): _choice(PlantStatus),
    probatio.Optional("min_temperature_c"): probatio.Any(None, _number(-60, 40)),
    probatio.Optional("root_depth_cm"): probatio.Any(None, _number(1, 1000)),
    probatio.Optional("planted_on"): probatio.Any(None, cv.date),
    probatio.Optional("age"): probatio.Any(
        None,
        {
            probatio.Required("age_months"): probatio.All(int, probatio.Range(min=0, max=12000)),
            probatio.Required("on"): cv.date,
        },
    ),
    probatio.Optional("tags"): TAGS,
}
NAME = probatio.All(str, probatio.Length(min=1, max=100))
SIZE_CM = probatio.Any(None, _number(0, 10000))


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register all WebSocket commands of the integration."""
    for command in (
        ws_info,
        ws_subscribe,
        ws_plants_list,
        ws_plants_get,
        ws_plants_create,
        ws_plants_update,
        ws_plants_delete,
        ws_plants_set_cover,
        ws_photos_update,
        ws_photos_delete,
        ws_measurements_add,
        ws_measurements_update,
        ws_measurements_delete,
    ):
        websocket_api.async_register_command(hass, command)


def garden_command(
    schema: dict[Any, Any],
) -> Callable[[GardenHandler], websocket_api.const.WebSocketCommandHandler]:
    """Decorate a handler that needs the garden manager.

    Takes care of "not loaded", maps NotFoundError/ValueError to WebSocket errors
    and sends the handler's return value as the result.
    """

    def decorator(func: GardenHandler) -> websocket_api.const.WebSocketCommandHandler:
        @websocket_api.websocket_command(schema)
        @websocket_api.async_response
        @functools.wraps(func)
        async def handler(
            hass: HomeAssistant,
            connection: websocket_api.ActiveConnection,
            msg: dict[str, Any],
        ) -> None:
            manager = get_manager(hass)
            if manager is None:
                connection.send_error(msg["id"], ERR_NOT_LOADED, "Plant Garden is not set up")
                return
            try:
                result = await func(hass, connection, msg, manager)
            except NotFoundError as err:
                connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Not found: {err}")
            except ValueError as err:
                connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
            else:
                connection.send_result(msg["id"], result)

        return handler

    return decorator


def _fields(msg: dict[str, Any], *exclude: str) -> dict[str, Any]:
    return {k: v for k, v in msg.items() if k not in ("id", "type", *exclude)}


async def _plant_result(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    manager: GardenManager,
    plant_id: str,
) -> dict[str, Any]:
    for plant, extra in await manager.async_plant_summaries():
        if plant.id == plant_id:
            return plant_dict(hass, plant, extra, connection.refresh_token_id)
    raise NotFoundError(plant_id)


# ---------------------------------------------------------------- general
@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/info"})
@callback
def ws_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return basic information about the loaded garden."""
    entry = get_loaded_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Plant Garden is not set up")
        return
    connection.send_result(
        msg["id"],
        {
            "entry_id": entry.entry_id,
            "garden_name": entry.title,
            "version": entry.runtime_data.version,
            "is_admin": connection.user.is_admin,
        },
    )


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Push a small event whenever garden data changes; clients then refetch."""
    manager = get_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Plant Garden is not set up")
        return

    @callback
    def forward(change: GardenChange) -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"], {"kind": change.kind, "plant_id": change.plant_id}
            )
        )

    connection.subscriptions[msg["id"]] = manager.async_subscribe(forward)
    connection.send_result(msg["id"])


# ---------------------------------------------------------------- plants
@garden_command({probatio.Required("type"): f"{DOMAIN}/plants/list"})
async def ws_plants_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """All plants with cover photo, photo count and latest size."""
    return {
        "plants": [
            plant_dict(hass, plant, extra, connection.refresh_token_id)
            for plant, extra in await manager.async_plant_summaries()
        ]
    }


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/plants/get", probatio.Required("plant_id"): str}
)
async def ws_plants_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """One plant with all photos (newest first) and measurements (oldest first)."""
    plant_id = msg["plant_id"]
    token = connection.refresh_token_id
    plant = await _plant_result(hass, connection, manager, plant_id)
    photos = await manager.async_list_photos(plant_id)
    measurements = await manager.async_list_measurements(plant_id)
    return {
        "plant": plant,
        "photos": [photo_dict(hass, photo, token) for photo in photos],
        "measurements": [measurement_dict(m) for m in measurements],
    }


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/plants/create",
        probatio.Required("name"): NAME,
        **PLANT_FIELDS,
    }
)
async def ws_plants_create(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    plant = await manager.async_create_plant(_fields(msg))
    return await _plant_result(hass, connection, manager, plant.id)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/plants/update",
        probatio.Required("plant_id"): str,
        probatio.Optional("name"): NAME,
        **PLANT_FIELDS,
    }
)
async def ws_plants_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    plant = await manager.async_update_plant(msg["plant_id"], _fields(msg, "plant_id"))
    return await _plant_result(hass, connection, manager, plant.id)


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/plants/delete", probatio.Required("plant_id"): str}
)
async def ws_plants_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    await manager.async_delete_plant(msg["plant_id"])


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/plants/set_cover",
        probatio.Required("plant_id"): str,
        probatio.Required("photo_id"): probatio.Any(None, str),
    }
)
async def ws_plants_set_cover(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    await manager.async_set_cover(msg["plant_id"], msg["photo_id"])
    return await _plant_result(hass, connection, manager, msg["plant_id"])


# ---------------------------------------------------------------- photos
@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/photos/update",
        probatio.Required("photo_id"): str,
        probatio.Optional("taken_at"): cv.datetime,
        probatio.Optional("tags"): TAGS,
        probatio.Optional("note"): probatio.All(str, probatio.Length(max=2000)),
    }
)
async def ws_photos_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    photo = await manager.async_update_photo(msg["photo_id"], _fields(msg, "photo_id"))
    return photo_dict(hass, photo, connection.refresh_token_id)


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/photos/delete", probatio.Required("photo_id"): str}
)
async def ws_photos_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    await manager.async_delete_photo(msg["photo_id"])


# ---------------------------------------------------------------- measurements
MEASUREMENT_FIELDS: dict[Any, Any] = {
    probatio.Optional("height_cm"): SIZE_CM,
    probatio.Optional("width_cm"): SIZE_CM,
    probatio.Optional("note"): probatio.All(str, probatio.Length(max=2000)),
    probatio.Optional("photo_id"): probatio.Any(None, str),
}


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/measurements/add",
        probatio.Required("plant_id"): str,
        probatio.Required("measured_on"): cv.date,
        **MEASUREMENT_FIELDS,
    }
)
async def ws_measurements_add(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    measurement = await manager.async_add_measurement(
        msg["plant_id"],
        measured_on=msg["measured_on"],
        height_cm=msg.get("height_cm"),
        width_cm=msg.get("width_cm"),
        note=msg.get("note", ""),
        photo_id=msg.get("photo_id"),
    )
    return measurement_dict(measurement)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/measurements/update",
        probatio.Required("measurement_id"): str,
        probatio.Optional("measured_on"): cv.date,
        **MEASUREMENT_FIELDS,
    }
)
async def ws_measurements_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    measurement = await manager.async_update_measurement(
        msg["measurement_id"], _fields(msg, "measurement_id")
    )
    return measurement_dict(measurement)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/measurements/delete",
        probatio.Required("measurement_id"): str,
    }
)
async def ws_measurements_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    await manager.async_delete_measurement(msg["measurement_id"])
