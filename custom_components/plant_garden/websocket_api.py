"""WebSocket API used by the Plant Garden panel."""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
import probatio

from .const import DOMAIN
from .runtime import PlantGardenConfigEntry


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register all WebSocket commands of the integration."""
    websocket_api.async_register_command(hass, ws_info)


def _get_entry(hass: HomeAssistant) -> PlantGardenConfigEntry | None:
    entries: list[PlantGardenConfigEntry] = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0] if entries else None


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/info"})
@callback
def ws_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return basic information about the loaded garden."""
    entry = _get_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Plant Garden is not set up")
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
