"""Runtime data attached to the Plant Garden config entry."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .ai.assistant import Assistant
from .ai.research import Researcher
from .ai.service import AIService
from .care import CareManager
from .const import DOMAIN
from .garden import GardenManager
from .irrigation import IrrigationTracker
from .water import WaterCoordinator


@dataclass(slots=True)
class PlantGardenData:
    """Objects that live as long as the config entry is loaded."""

    version: str
    manager: GardenManager
    irrigation: IrrigationTracker
    water: WaterCoordinator
    ai: AIService
    care: CareManager
    assistant: Assistant
    researcher: Researcher


type PlantGardenConfigEntry = ConfigEntry[PlantGardenData]


def get_loaded_entry(hass: HomeAssistant) -> PlantGardenConfigEntry | None:
    """Return the (single) loaded Plant Garden entry, if any."""
    entries: list[PlantGardenConfigEntry] = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0] if entries else None


def get_manager(hass: HomeAssistant) -> GardenManager | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.manager if entry else None


def get_irrigation(hass: HomeAssistant) -> IrrigationTracker | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.irrigation if entry else None


def get_water(hass: HomeAssistant) -> WaterCoordinator | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.water if entry else None


def get_ai(hass: HomeAssistant) -> AIService | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.ai if entry else None


def get_care(hass: HomeAssistant) -> CareManager | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.care if entry else None


def get_assistant(hass: HomeAssistant) -> Assistant | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.assistant if entry else None


def get_researcher(hass: HomeAssistant) -> Researcher | None:
    entry = get_loaded_entry(hass)
    return entry.runtime_data.researcher if entry else None
