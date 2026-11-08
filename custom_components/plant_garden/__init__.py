"""The Plant Garden integration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import DOMAIN
from .database import DatabaseError
from .garden import GardenManager
from .http import BackgroundFileView, BackgroundUploadView, PhotoFileView, PhotoUploadView
from .panel import async_register_panel, async_register_static_path, async_unregister_panel
from .runtime import PlantGardenConfigEntry, PlantGardenData
from .websocket_api import async_register_websocket_commands

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS: list[Platform] = []


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up things that exist once per Home Assistant run."""
    await async_register_static_path(hass)
    for view in (PhotoUploadView(), PhotoFileView(), BackgroundUploadView(), BackgroundFileView()):
        hass.http.register_view(view)
    async_register_websocket_commands(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: PlantGardenConfigEntry) -> bool:
    """Set up Plant Garden from a config entry."""
    integration = await async_get_integration(hass, DOMAIN)
    # Data is not keyed by entry id: removing and re-adding the integration
    # keeps the garden (see docs/DECISIONS.md D-002).
    manager = GardenManager(hass, Path(hass.config.path(DOMAIN)))
    try:
        await manager.async_setup()
    except DatabaseError as err:
        raise ConfigEntryNotReady(str(err)) from err
    entry.runtime_data = PlantGardenData(version=str(integration.version), manager=manager)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await async_register_panel(hass, entry)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PlantGardenConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        async_unregister_panel(hass)
        await entry.runtime_data.manager.async_shutdown()
    return unloaded
