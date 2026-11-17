"""WebSocket API of the garden agent, the chat in the panel's header (D-051)."""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
import probatio

from .ai.agent import GardenAgent
from .ai.base import AIError, BudgetExceededError
from .const import DOMAIN
from .garden import NotFoundError
from .runtime import get_loaded_entry
from .websocket_ai import ERR_AI, ERR_BUDGET

ERR_NOT_LOADED = "not_loaded"


def _agent(hass: HomeAssistant) -> GardenAgent | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.agent if entry else None


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/agent/state"})
@callback
def ws_agent_state(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Can the agent run (provider, web search), and the conversation so far."""
    agent = _agent(hass)
    if agent is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Autogarden is not set up")
        return
    connection.send_result(msg["id"], {**agent.status(), "messages": agent.history()})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/agent/ask",
        probatio.Required("text"): probatio.All(str, probatio.Length(min=1, max=4000)),
        probatio.Optional("view"): probatio.All(str, probatio.Length(max=40)),
        probatio.Optional("plant_id"): probatio.Any(None, str),
    }
)
@websocket_api.async_response
async def ws_agent_ask(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Ask the agent; a subscription that reports what it does.

    Events: `{"step": tool}` when a tool runs, `{"action": {...}}` when something
    in the garden was changed, then `{"done": true, "message": {...}}` or
    `{"error": text, "code": ...}`.
    """
    agent = _agent(hass)
    if agent is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Autogarden is not set up")
        return
    msg_id = msg["id"]
    connection.send_result(msg_id)

    def send(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg_id, payload))

    try:
        answer = await agent.async_ask(
            msg["text"],
            page={"view": msg.get("view"), "plant_id": msg.get("plant_id")},
            on_event=send,
        )
    except BudgetExceededError as err:
        send({"error": str(err), "code": ERR_BUDGET})
    except AIError as err:
        send({"error": str(err), "code": ERR_AI})
    except ValueError as err:
        send({"error": str(err), "code": websocket_api.ERR_INVALID_FORMAT})
    else:
        send({"done": True, "message": answer})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/agent/undo", probatio.Required("action_id"): str}
)
@websocket_api.async_response
async def ws_agent_undo(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Take an action of the agent back; answers with its message."""
    agent = _agent(hass)
    if agent is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Autogarden is not set up")
        return
    try:
        connection.send_result(msg["id"], await agent.async_undo(msg["action_id"]))
    except NotFoundError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Not found: {err}")
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/agent/clear"})
@websocket_api.async_response
async def ws_agent_clear(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Forget the conversation (what the agent did in the garden stays)."""
    agent = _agent(hass)
    if agent is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Autogarden is not set up")
        return
    await agent.async_clear()
    connection.send_result(msg["id"])


@callback
def async_register_agent_commands(hass: HomeAssistant) -> None:
    for command in (ws_agent_state, ws_agent_ask, ws_agent_undo, ws_agent_clear):
        websocket_api.async_register_command(hass, command)
