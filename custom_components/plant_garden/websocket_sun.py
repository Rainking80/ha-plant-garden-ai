"""WebSocket API of the sun and shade on the plan (D-043)."""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
import probatio

from . import sun
from .const import DOMAIN
from .garden import GardenManager
from .websocket_api import garden_command


@callback
def async_register_sun_commands(hass: HomeAssistant) -> None:
    for command in (ws_sun_summary, ws_sun_map):
        websocket_api.async_register_command(hass, command)


async def async_blockers(manager: GardenManager) -> list[sun.Obstacle]:
    """Everything on the plan that casts a shadow."""
    return sun.obstacles(
        manager.shapes(),
        manager.plants,
        await manager.async_latest_heights(),
        await manager.async_latest_widths(),
    )


def garden_latitude(hass: HomeAssistant, manager: GardenManager) -> float:
    origin = manager.layout.origin
    return origin.latitude if origin else hass.config.latitude


@garden_command({probatio.Required("type"): f"{DOMAIN}/sun/summary"})
async def ws_sun_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any]:
    """Hours of direct sun per plant: every month, the season's mean and its light class."""
    blockers = await async_blockers(manager)
    latitude = garden_latitude(hass, manager)
    plants = await hass.async_add_executor_job(
        sun.plants_sun, manager.plants, manager.shapes(), blockers, latitude
    )
    return {
        "plants": plants,
        "season": list(sun.season_months(latitude)),
        "obstacles": len(blockers),
    }


@garden_command(
    {
        probatio.Required("type"): f"{DOMAIN}/sun/map",
        probatio.Required("month"): probatio.All(int, probatio.Range(min=1, max=12)),
    }
)
async def ws_sun_map(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: GardenManager,
) -> dict[str, Any] | None:
    """Hours of direct sun over the plan in one month, as a grid; None for an empty plan."""
    box = sun.plan_bounds(manager.shapes(), manager.plants)
    if box is None:
        return None
    blockers = await async_blockers(manager)
    grid: dict[str, Any] = await hass.async_add_executor_job(
        sun.sun_map, box, blockers, garden_latitude(hass, manager), msg["month"]
    )
    return grid
