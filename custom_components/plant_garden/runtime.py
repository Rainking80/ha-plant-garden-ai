"""Runtime data attached to the Plant Garden config entry."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry


@dataclass(slots=True)
class PlantGardenData:
    """Objects that live as long as the config entry is loaded."""

    version: str


type PlantGardenConfigEntry = ConfigEntry[PlantGardenData]
