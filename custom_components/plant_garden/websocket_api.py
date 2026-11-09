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

from .const import DOMAIN, PLAN_EXTENT_M, ZONE_ENTITY_DOMAINS
from .garden import GardenChange, GardenManager, NotFoundError, OutOfRangeError
from .models import (
    Emitter,
    Light,
    LocationType,
    PlantCategory,
    PlantStatus,
    Point,
    ShapeKind,
    SoilType,
    WaterNeed,
)
from .runtime import get_irrigation, get_loaded_entry, get_manager, get_water
from .serialize import event_dict, layout_dict, measurement_dict, photo_dict, plant_dict
from .water import water_summary, weather_sources

type GardenHandler = Callable[
    [HomeAssistant, websocket_api.ActiveConnection, dict[str, Any], GardenManager],
    Awaitable[Any],
]

ERR_NOT_LOADED = "not_loaded"
ERR_OUT_OF_RANGE = "out_of_range"


def _text(max_length: int) -> Any:
    return probatio.Any(None, probatio.All(str, probatio.Length(max=max_length)))


def _choice(enum: type[StrEnum]) -> Any:
    return probatio.Any(None, probatio.In([member.value for member in enum]))


def _number(minimum: float, maximum: float) -> Any:
    return probatio.All(probatio.Any(int, float), probatio.Range(min=minimum, max=maximum))


TAGS = [probatio.All(str, probatio.Length(max=40))]

COORD = _number(-PLAN_EXTENT_M, PLAN_EXTENT_M)
POINT = {probatio.Required("x"): COORD, probatio.Required("y"): COORD}
ID = probatio.Match(r"^[0-9A-Z]{26}$")
LENGTH_M = _number(0.01, 5000)

GEOMETRY = probatio.Any(
    {
        probatio.Required("type"): "rect",
        probatio.Required("cx"): COORD,
        probatio.Required("cy"): COORD,
        probatio.Required("w"): LENGTH_M,
        probatio.Required("h"): LENGTH_M,
        probatio.Optional("rotation", default=0): _number(-360, 360),
    },
    {
        probatio.Required("type"): "circle",
        probatio.Required("cx"): COORD,
        probatio.Required("cy"): COORD,
        probatio.Required("r"): LENGTH_M,
    },
    {
        probatio.Required("type"): "polygon",
        probatio.Required("points"): probatio.All(
            [probatio.All([COORD], probatio.Length(min=2, max=2))],
            probatio.Length(min=3, max=500),
        ),
    },
    {
        # a sprinkler: compass bearing of the arc's first edge, angle clockwise from it
        probatio.Required("type"): "sector",
        probatio.Required("cx"): COORD,
        probatio.Required("cy"): COORD,
        probatio.Required("r"): LENGTH_M,
        probatio.Required("start"): _number(0, 360),
        probatio.Required("sweep"): _number(1, 360),
    },
    {
        # a drip line and the width of the strip it wets
        probatio.Required("type"): "line",
        probatio.Required("points"): probatio.All(
            [probatio.All([COORD], probatio.Length(min=2, max=2))],
            probatio.Length(min=2, max=500),
        ),
        probatio.Required("width"): _number(0.05, 10),
    },
)

PLANT_IDS = probatio.All([str], probatio.Length(max=1000))

IRRIGATION = {
    probatio.Optional("entity_id"): probatio.Any(None, cv.entity_domain(list(ZONE_ENTITY_DOMAINS))),
    probatio.Optional("timer_entity_id"): probatio.Any(None, cv.entity_domain("timer")),
    probatio.Optional("meter_entity_id"): probatio.Any(None, cv.entity_domain("sensor")),
    probatio.Optional("emitter"): probatio.In([emitter.value for emitter in Emitter]),
    probatio.Optional("rate_mm_h"): probatio.Any(None, _number(0.1, 500)),
    probatio.Optional("flow_l_min"): probatio.Any(None, _number(0.01, 1000)),
    probatio.Optional("drip_l_h"): probatio.Any(None, _number(0.1, 500)),
    probatio.Optional("flow_l_h_m"): probatio.Any(None, _number(0.1, 500)),
    probatio.Optional("efficiency"): probatio.Any(None, _number(0.1, 1)),
    probatio.Optional("include"): PLANT_IDS,
    probatio.Optional("exclude"): PLANT_IDS,
}

SHAPE = {
    probatio.Optional("id"): ID,
    probatio.Required("kind"): probatio.In([kind.value for kind in ShapeKind]),
    probatio.Required("geometry"): GEOMETRY,
    probatio.Optional("label"): _text(100),
    probatio.Optional("plant_id"): probatio.Any(None, str),
    probatio.Optional("soil_type"): _choice(SoilType),
    probatio.Optional("locked"): bool,
    probatio.Optional("z"): probatio.All(int, probatio.Range(min=-1000, max=1000)),
    probatio.Optional("irrigation"): probatio.Any(None, IRRIGATION),
}

OPACITY = _number(0.05, 1)

BACKGROUND = probatio.Any(
    {probatio.Required("type"): "none"},
    {
        probatio.Required("type"): "wms",
        probatio.Optional("preset"): probatio.Any(None, probatio.All(str, probatio.Length(max=20))),
        # https only: plain http images would be blocked as mixed content anyway
        probatio.Optional("url"): probatio.Any(
            None, probatio.All(str, probatio.Length(max=500), probatio.Match(r"^https://\S+$"))
        ),
        probatio.Optional("layers"): _text(200),
        probatio.Optional("attribution"): _text(300),
        probatio.Optional("opacity", default=1): OPACITY,
    },
    {
        probatio.Required("type"): "image",
        probatio.Required("image_id"): ID,
        probatio.Required("width_px"): probatio.All(int, probatio.Range(min=1, max=20000)),
        probatio.Required("height_px"): probatio.All(int, probatio.Range(min=1, max=20000)),
        probatio.Required("x"): COORD,
        probatio.Required("y"): COORD,
        probatio.Required("width_m"): _number(0.5, 5000),
        probatio.Optional("rotation", default=0): _number(-360, 360),
        probatio.Optional("opacity", default=0.8): OPACITY,
    },
)

MARKER = {
    probatio.Optional("id"): ID,
    probatio.Required("entity_id"): cv.entity_id,
    probatio.Required("x"): COORD,
    probatio.Required("y"): COORD,
    probatio.Optional("label"): _text(60),
}

PLANT_FIELDS: dict[Any, Any] = {
    probatio.Optional("scientific_name"): _text(200),
    probatio.Optional("variety"): _text(200),
    probatio.Optional("family"): _text(100),
    probatio.Optional("notes"): _text(5000),
    probatio.Optional("care_water"): _text(1000),
    probatio.Optional("care_fertilize"): _text(1000),
    probatio.Optional("care_prune"): _text(1000),
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
    probatio.Optional("position"): probatio.Any(None, POINT),
    probatio.Optional("crown_diameter_m"): probatio.Any(None, _number(0.05, 100)),
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
        ws_plants_move,
        ws_layout_get,
        ws_shapes_save,
        ws_shapes_delete,
        ws_set_background,
        ws_set_origin,
        ws_markers_save,
        ws_markers_delete,
        ws_photos_update,
        ws_photos_delete,
        ws_measurements_add,
        ws_measurements_update,
        ws_measurements_delete,
        ws_irrigation_summary,
        ws_irrigation_events,
        ws_irrigation_log,
        ws_irrigation_log_zone,
        ws_irrigation_delete,
        ws_water_summary,
        ws_water_refresh,
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
            except OutOfRangeError as err:
                connection.send_error(msg["id"], ERR_OUT_OF_RANGE, str(err))
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
                msg["id"],
                {"kind": change.kind, "plant_id": change.plant_id, "shape_id": change.shape_id},
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


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/plants/move",
        probatio.Required("moves"): probatio.All(
            [
                {
                    probatio.Required("plant_id"): str,
                    probatio.Required("position"): probatio.Any(None, POINT),
                }
            ],
            probatio.Length(min=1, max=1000),
        ),
    }
)
async def ws_plants_move(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Place, move or unplace plants (several at once, e.g. for undo)."""
    moves = [
        (move["plant_id"], Point(x=move["position"]["x"], y=move["position"]["y"]))
        if move["position"]
        else (move["plant_id"], None)
        for move in msg["moves"]
    ]
    plants = await manager.async_move_plants(moves)
    return {
        "positions": {
            plant.id: plant.position.as_dict() if plant.position else None for plant in plants
        }
    }


# ---------------------------------------------------------------- layout
@garden_command({probatio.Required("type"): f"{DOMAIN}/layout/get"})
async def ws_layout_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Origin, shapes in drawing order, background, markers. Plants carry their own position."""
    return layout_dict(hass, manager.layout, manager.shapes(), connection.refresh_token_id)


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/layout/shapes/save", probatio.Required("shape"): SHAPE}
)
async def ws_shapes_save(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Create (without id or with a new id) or replace a shape."""
    shape = await manager.async_save_shape(msg["shape"])
    return shape.as_dict()


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/layout/shapes/delete",
        probatio.Required("shape_id"): str,
    }
)
async def ws_shapes_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    await manager.async_delete_shape(msg["shape_id"])


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/layout/set_background",
        probatio.Required("background"): BACKGROUND,
    }
)
async def ws_set_background(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Aerial imagery (WMS), an uploaded image or none. Returns the layout."""
    await manager.async_set_background(msg["background"])
    return layout_dict(hass, manager.layout, manager.shapes(), connection.refresh_token_id)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/layout/set_origin",
        probatio.Required("latitude"): _number(-85, 85),
        probatio.Required("longitude"): _number(-180, 180),
        probatio.Optional("move_content", default=False): bool,
    }
)
async def ws_set_origin(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Move the plan origin (the garden's location). Returns the layout."""
    await manager.async_set_origin(
        msg["latitude"], msg["longitude"], move_content=msg["move_content"]
    )
    return layout_dict(hass, manager.layout, manager.shapes(), connection.refresh_token_id)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/layout/markers/save",
        probatio.Required("marker"): MARKER,
    }
)
async def ws_markers_save(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    marker = await manager.async_save_marker(msg["marker"])
    return marker.as_dict()


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/layout/markers/delete",
        probatio.Required("marker_id"): str,
    }
)
async def ws_markers_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    await manager.async_delete_marker(msg["marker_id"])


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


# ---------------------------------------------------------------- irrigation
def _tracker(hass: HomeAssistant) -> Any:
    tracker = get_irrigation(hass)
    if tracker is None:  # pragma: no cover - the manager check runs first
        raise NotFoundError("irrigation")
    return tracker


@garden_command({probatio.Required("type"): f"{DOMAIN}/irrigation/summary"})
async def ws_irrigation_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Water per plant (today, total, last 14 days) and run time per zone (incl. running)."""
    summary: dict[str, Any] = _tracker(hass).summary()
    return summary


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/irrigation/events",
        probatio.Optional("zone_id"): str,
        probatio.Optional("plant_id"): str,
        probatio.Optional("limit", default=50): probatio.All(int, probatio.Range(min=1, max=500)),
    }
)
async def ws_irrigation_events(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Newest irrigation events, optionally of one zone or reaching one plant."""
    events = await manager.async_recent_events(
        zone_id=msg.get("zone_id"), plant_id=msg.get("plant_id"), limit=msg["limit"]
    )
    return {"events": [event_dict(event) for event in events]}


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/irrigation/log",
        probatio.Required("plants"): probatio.All(
            [
                {
                    probatio.Required("plant_id"): str,
                    probatio.Required("liters"): _number(0.01, 10000),
                }
            ],
            probatio.Length(min=1, max=500),
        ),
        probatio.Optional("at"): cv.datetime,
        probatio.Optional("note", default=""): probatio.All(str, probatio.Length(max=500)),
    }
)
async def ws_irrigation_log(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Watering by hand (watering can): litres per plant."""
    liters = {item["plant_id"]: float(item["liters"]) for item in msg["plants"]}
    event = await _tracker(hass).async_log_watering(liters, at=msg.get("at"), note=msg["note"])
    return event_dict(event)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/irrigation/log_zone",
        probatio.Required("zone_id"): str,
        probatio.Required("minutes"): _number(0.1, 1440),
        probatio.Optional("end"): cv.datetime,
        probatio.Optional("note", default=""): probatio.All(str, probatio.Length(max=500)),
    }
)
async def ws_irrigation_log_zone(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """A zone run that was not seen live, e.g. watered with the hose over the zone."""
    event = await _tracker(hass).async_log_zone_run(
        msg["zone_id"], float(msg["minutes"]), end=msg.get("end"), note=msg["note"]
    )
    return event_dict(event)


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/irrigation/delete", probatio.Required("event_id"): str}
)
async def ws_irrigation_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    """Remove a wrong event (e.g. a test run); the plants lose its water."""
    await _tracker(hass).async_delete_event(msg["event_id"])


# ---------------------------------------------------------------- weather and water balance
@garden_command({probatio.Required("type"): f"{DOMAIN}/water/summary"})
async def ws_water_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Weather of the last 14 days and the forecast, soil water per plant, zone advice."""
    entry = get_loaded_entry(hass)
    coordinator = get_water(hass)
    if entry is None or coordinator is None:  # pragma: no cover - checked by the decorator
        raise NotFoundError("water")
    return water_summary(coordinator.data, bool(weather_sources(entry)))


@garden_command({probatio.Required("type"): f"{DOMAIN}/water/refresh"})
async def ws_water_refresh(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Fetch the weather now (otherwise hourly) and return the new summary."""
    entry = get_loaded_entry(hass)
    coordinator = get_water(hass)
    if entry is None or coordinator is None:  # pragma: no cover - checked by the decorator
        raise NotFoundError("water")
    await coordinator.async_refresh()
    return water_summary(coordinator.data, bool(weather_sources(entry)))
