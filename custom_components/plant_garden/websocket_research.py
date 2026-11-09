"""WebSocket API of the plant knowledge the assistant collects (D-038).

Reading and researching a plant by hand are open to every user (like the other
assistant features); the schedule changes an option and is admin only.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
import probatio

from .ai.base import AIError, BudgetExceededError
from .ai.research import Researcher
from .const import DOMAIN, RESEARCH_SCHEDULES
from .garden import GardenManager, NotFoundError
from .runtime import get_researcher
from .websocket_ai import ERR_AI, ERR_BUDGET
from .websocket_api import garden_command


def _researcher(hass: HomeAssistant) -> Researcher:
    researcher = get_researcher(hass)
    if researcher is None:  # pragma: no cover - the decorator checks the entry first
        raise NotFoundError("research")
    return researcher


@callback
def async_register_research_commands(hass: HomeAssistant) -> None:
    for command in (
        ws_research_summary,
        ws_research_calendar_task,
        ws_research_run,
        ws_research_delete,
        ws_research_schedule,
    ):
        websocket_api.async_register_command(hass, command)


@garden_command({probatio.Required("type"): f"{DOMAIN}/research/summary"})
async def ws_research_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Schedule, cost per plant, what is queued and the knowledge of every plant."""
    researcher = _researcher(hass)
    await researcher.async_forget_deleted_tasks()
    return researcher.summary()


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/research/calendar_task",
        probatio.Required("plant_id"): str,
        probatio.Required("index"): probatio.All(int, probatio.Range(min=0, max=100)),
    }
)
async def ws_research_calendar_task(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Take a job of a plant's care calendar over as a yearly task."""
    return await _researcher(hass).async_calendar_task(msg["plant_id"], msg["index"])


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/research/run", probatio.Required("plant_id"): str}
)
@websocket_api.async_response
async def ws_research_run(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Research one plant now (a user action, whatever the schedule says)."""
    researcher = get_researcher(hass)
    if researcher is None:
        connection.send_error(msg["id"], "not_loaded", "Plant Garden is not set up")
        return
    try:
        info = await researcher.async_research(msg["plant_id"])
    except NotFoundError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Not found: {err}")
    except BudgetExceededError as err:
        connection.send_error(msg["id"], ERR_BUDGET, str(err))
    except AIError as err:
        connection.send_error(msg["id"], ERR_AI, str(err))
    else:
        connection.send_result(msg["id"], info)


@garden_command(
    {probatio.Required("type"): f"{DOMAIN}/research/delete", probatio.Required("plant_id"): str}
)
async def ws_research_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> None:
    """Delete a plant's knowledge; the schedule will research it again."""
    await _researcher(hass).async_delete(msg["plant_id"])


@websocket_api.require_admin
@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/research/schedule",
        probatio.Required("schedule"): probatio.In(list(RESEARCH_SCHEDULES)),
    }
)
async def ws_research_schedule(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """How often plants are researched without being asked (off by default)."""
    researcher = _researcher(hass)
    await researcher.async_set_schedule(msg["schedule"])
    return researcher.summary()
