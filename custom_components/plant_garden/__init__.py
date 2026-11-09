"""The Plant Garden integration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv, device_registry as dr
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .ai.assistant import Assistant
from .ai.pricing import load_defaults as load_pricing
from .ai.service import AIService
from .care import CareManager
from .const import CONF_MAX_RUNTIME_HOURS, DEFAULT_MAX_RUNTIME_HOURS, DOMAIN
from .database import DatabaseError
from .entity import async_garden_device
from .garden import GardenManager
from .http import (
    BackgroundFileView,
    BackgroundUploadView,
    GardenExportView,
    GardenImportView,
    PhotoFileView,
    PhotoUploadView,
)
from .irrigation import IrrigationTracker
from .panel import async_register_panel, async_register_static_path, async_unregister_panel
from .runtime import PlantGardenConfigEntry, PlantGardenData
from .services import async_register_services
from .water import WaterCoordinator
from .water_balance import load_defaults
from .websocket_ai import async_register_ai_commands
from .websocket_api import async_register_websocket_commands
from .websocket_care import async_register_care_commands

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS: list[Platform] = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.TODO]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up things that exist once per Home Assistant run."""
    await async_register_static_path(hass)
    for view in (
        PhotoUploadView(),
        PhotoFileView(),
        BackgroundUploadView(),
        BackgroundFileView(),
        GardenExportView(),
        GardenImportView(),
    ):
        hass.http.register_view(view)
    async_register_websocket_commands(hass)
    async_register_ai_commands(hass)
    async_register_care_commands(hass)
    async_register_services(hass)
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
    irrigation = IrrigationTracker(
        hass,
        manager,
        lambda: float(entry.options.get(CONF_MAX_RUNTIME_HOURS, DEFAULT_MAX_RUNTIME_HOURS)),
    )
    await irrigation.async_start()
    water = WaterCoordinator(hass, entry, manager, await hass.async_add_executor_job(load_defaults))
    await water.async_start()
    ai = AIService(hass, entry, manager, await hass.async_add_executor_job(load_pricing))
    await ai.async_start()
    care = CareManager(hass, manager)
    await care.async_setup()
    assistant = Assistant(hass, entry, manager=manager, care=care, ai=ai, water=water)
    await assistant.async_setup()
    entry.runtime_data = PlantGardenData(
        version=str(integration.version),
        manager=manager,
        irrigation=irrigation,
        water=water,
        ai=ai,
        care=care,
        assistant=assistant,
    )
    async_garden_device(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await async_register_panel(hass, entry)

    async def refetch(hass: HomeAssistant, entry: PlantGardenConfigEntry) -> None:
        """Weather sources (subentries) or options changed."""
        await entry.runtime_data.water.async_request_refresh()

    entry.async_on_unload(entry.add_update_listener(refetch))
    # fetch now, not only an hour later (does not delay the start)
    entry.async_create_background_task(hass, water.async_refresh(), "plant_garden weather")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PlantGardenConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        async_unregister_panel(hass)
        entry.runtime_data.assistant.async_stop()
        entry.runtime_data.care.async_stop()
        entry.runtime_data.water.async_stop()
        entry.runtime_data.ai.async_stop()
        await entry.runtime_data.irrigation.async_stop()
        await entry.runtime_data.manager.async_shutdown()
    return unloaded


async def async_remove_config_entry_device(
    hass: HomeAssistant, entry: PlantGardenConfigEntry, device: dr.DeviceEntry
) -> bool:
    """Allow removing a plant or zone device whose plant or zone no longer exists."""
    manager = entry.runtime_data.manager
    existing = {f"plant_{plant.id}" for plant in manager.plants} | {
        f"zone_{zone.id}" for zone in manager.zones()
    }
    existing.add("garden")
    return not any(
        domain == DOMAIN and identifier in existing for domain, identifier in device.identifiers
    )
