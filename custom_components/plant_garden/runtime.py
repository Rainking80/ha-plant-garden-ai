"""Runtime data attached to the Plant Garden config entry."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .garden import GardenManager


@dataclass(slots=True)
class PlantGardenData:
    """Objects that live as long as the config entry is loaded."""

    version: str
    manager: GardenManager


type PlantGardenConfigEntry = ConfigEntry[PlantGardenData]


def get_loaded_entry(hass: HomeAssistant) -> PlantGardenConfigEntry | None:
    """Return the (single) loaded Plant Garden entry, if any."""
    entries: list[PlantGardenConfigEntry] = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0] if entries else None


def get_manager(hass: HomeAssistant) -> GardenManager | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.manager if entry else None
