"""WebSocket API of the AI layer and the tech page (spec 5.4, 4.8).

Identification is open to every user; providers, prices, the usage log and the
tech page are admin only.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
import probatio

from .ai.base import AIError, BudgetExceededError, Feature
from .ai.providers.plantnet import ORGANS
from .ai.service import MAX_PHOTOS, AIService
from .const import DOMAIN, PRICE_FIELDS
from .garden import GardenManager, NotFoundError
from .runtime import get_ai, get_loaded_entry
from .websocket_api import garden_command

ERR_AI = "ai_error"
ERR_BUDGET = "budget_exceeded"


def _service(hass: HomeAssistant) -> AIService:
    service = get_ai(hass)
    if service is None:  # pragma: no cover - the decorator checks the entry first
        raise NotFoundError("ai")
    return service


async def _ai_call(connection: websocket_api.ActiveConnection, msg_id: int, call: Any) -> Any:
    """Run an AI call; AI failures become readable WebSocket errors."""
    try:
        return await call
    except BudgetExceededError as err:
        connection.send_error(msg_id, ERR_BUDGET, str(err))
    except AIError as err:
        connection.send_error(msg_id, ERR_AI, str(err))
    return None


@callback
def async_register_ai_commands(hass: HomeAssistant) -> None:
    for command in (
        ws_ai_status,
        ws_ai_identify,
        ws_ai_identification,
        ws_ai_decide,
        ws_ai_estimate,
        ws_ai_test,
        ws_ai_usage_summary,
        ws_ai_usage_log,
        ws_ai_pricing_get,
        ws_ai_pricing_set,
        ws_tech_info,
    ):
        websocket_api.async_register_command(hass, command)


@garden_command({probatio.Required("type"): f"{DOMAIN}/ai/status"})
async def ws_ai_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """What the panel needs to offer AI: is a provider set up, is Pl@ntNet there."""
    service = _service(hass)
    identify = service.subentry_for(Feature.IDENTIFY)
    net = service.plantnet()
    return {
        "available": identify is not None or net is not None,
        "identify": identify.title if identify else None,
        "plantnet": net is not None,
        "currency": service.currency(),
    }


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/ai/identify",
        probatio.Required("plant_id"): str,
        probatio.Required("photos"): probatio.All(
            [
                {
                    probatio.Required("photo_id"): str,
                    probatio.Optional("organ", default="auto"): probatio.In(list(ORGANS)),
                }
            ],
            probatio.Length(min=1, max=MAX_PHOTOS),
        ),
    }
)
@websocket_api.async_response
async def ws_ai_identify(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Identify a plant from 1 to 3 photos; answers with the suggestions."""
    service = get_ai(hass)
    if service is None:
        connection.send_error(msg["id"], "not_loaded", "Plant Garden is not set up")
        return
    photos = [(p["photo_id"], p["organ"]) for p in msg["photos"]]
    try:
        result = await _ai_call(
            connection,
            msg["id"],
            service.async_identify(msg["plant_id"], photos, hass.config.language),
        )
    except NotFoundError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Not found: {err}")
        return
    if result is not None:
        connection.send_result(msg["id"], result)


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/ai/identification", probatio.Required("plant_id"): str}
)
async def ws_ai_identification(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any] | None:
    """The last identification of a plant with its open suggestions (or null)."""
    manager.get_plant(msg["plant_id"])
    return _service(hass).identification(msg["plant_id"])


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/ai/decide",
        probatio.Required("plant_id"): str,
        probatio.Required("key"): str,
        probatio.Required("accept"): bool,
    }
)
@websocket_api.async_response
async def ws_ai_decide(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Take over or dismiss one suggestion (the user's own values are never replaced)."""
    service = get_ai(hass)
    if service is None:
        connection.send_error(msg["id"], "not_loaded", "Plant Garden is not set up")
        return
    result = await _ai_call(
        connection,
        msg["id"],
        service.async_decide(msg["plant_id"], msg["key"], accept=msg["accept"]),
    )
    if result is not None:
        connection.send_result(msg["id"], result)


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/ai/estimate",
        probatio.Optional("photos", default=1): probatio.All(int, probatio.Range(min=0, max=10)),
    }
)
async def ws_ai_estimate(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Rough cost of an identification before starting it (spec 4.8)."""
    service = _service(hass)
    cost = service.estimate_identify(msg["photos"])
    return {"cost": cost, "currency": service.currency()}


@websocket_api.require_admin
@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/ai/test", probatio.Required("provider_id"): str}
)
async def ws_ai_test(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """'Test connection' for one provider."""
    try:
        return await _service(hass).async_test(msg["provider_id"])
    except AIError as err:
        raise NotFoundError(msg["provider_id"]) from err


@websocket_api.require_admin
@garden_command({probatio.Required("type"): f"{DOMAIN}/ai/usage/summary"})
async def ws_ai_usage_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Requests, tokens and costs today, this month and in total, with breakdowns."""
    return await _service(hass).async_summary()


@websocket_api.require_admin
@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/ai/usage/log",
        probatio.Optional("limit", default=100): probatio.All(int, probatio.Range(min=1, max=5000)),
        probatio.Optional("offset", default=0): probatio.All(int, probatio.Range(min=0)),
        probatio.Optional("feature"): probatio.In([f.value for f in Feature]),
        probatio.Optional("status"): probatio.In(["ok", "error", "invalid_json"]),
    }
)
async def ws_ai_usage_log(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Single calls, newest first (prompts only when the debug log is on)."""
    rows = await manager.async_usage_log(
        limit=msg["limit"],
        offset=msg["offset"],
        feature=msg.get("feature"),
        status=msg.get("status"),
    )
    return {"rows": rows}


@websocket_api.require_admin
@garden_command({probatio.Required("type"): f"{DOMAIN}/ai/pricing/get"})
async def ws_ai_pricing_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    return _service(hass).pricing_info()


PRICE = {
    probatio.Optional(field): probatio.All(
        probatio.Any(int, float), probatio.Range(min=0, max=10000)
    )
    for field in PRICE_FIELDS
}


@websocket_api.require_admin
@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/ai/pricing/set",
        probatio.Required("kind"): probatio.All(str, probatio.Length(min=1, max=40)),
        probatio.Required("model"): probatio.All(str, probatio.Length(min=1, max=200)),
        probatio.Required("prices"): probatio.Any(None, PRICE),
    }
)
async def ws_ai_pricing_set(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Set (or with null: remove) the user's own price for a model."""
    service = _service(hass)
    await service.async_set_price(msg["kind"], msg["model"], msg["prices"])
    return service.pricing_info()


@websocket_api.require_admin
@garden_command({probatio.Required("type"): f"{DOMAIN}/tech/info"})
async def ws_tech_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Version, storage, entities, weather and providers for the tech page."""
    entry = get_loaded_entry(hass)
    if entry is None:  # pragma: no cover - checked by the decorator
        raise NotFoundError("entry")
    water = entry.runtime_data.water
    entities = er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)
    return {
        "version": entry.runtime_data.version,
        "storage": await manager.async_storage_stats(),
        "entities": len(entities),
        "plants": len(manager.plants),
        "weather": {
            "updated": water.data.updated.isoformat()
            if water.data and water.data.updated
            else None,
            "sources": [
                {"title": s.title, "ok": s.ok, "error": s.error, "days": s.days}
                for s in (water.data.sources if water.data else [])
            ],
            "last_error": str(water.last_exception) if water.last_exception else None,
        },
        "providers": _service(hass).providers_info(),
    }
