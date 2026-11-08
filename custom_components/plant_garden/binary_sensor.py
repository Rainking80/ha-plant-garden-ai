"""Binary sensors: a plant needs water, a zone should run (for the user's automations)."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import PLANT, ZONE, GardenEntity, GardenEntityDescription, async_track_items
from .runtime import PlantGardenConfigEntry


@dataclass(frozen=True, kw_only=True)
class GardenBinarySensorDescription(GardenEntityDescription, BinarySensorEntityDescription):
    """A Plant Garden binary sensor."""


NEEDS_WATER = GardenBinarySensorDescription(
    key="needs_water",
    translation_key="needs_water",
    item=PLANT,
    value=lambda stats: stats.get("needs_water"),
)
IRRIGATION_RECOMMENDED = GardenBinarySensorDescription(
    key="irrigation_recommended",
    translation_key="irrigation_recommended",
    item=ZONE,
    value=lambda stats: stats.get("recommended"),
)


class GardenBinarySensor(GardenEntity, BinarySensorEntity):
    entity_description: GardenBinarySensorDescription

    @property
    def is_on(self) -> bool | None:
        value = self.entity_description.value(self._stats())
        return None if value is None else bool(value)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PlantGardenConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_track_items(
        hass,
        entry,
        async_add_entities,
        lambda plant_id, info: [GardenBinarySensor(entry, plant_id, info, NEEDS_WATER)],
        lambda zone_id, info: [GardenBinarySensor(entry, zone_id, info, IRRIGATION_RECOMMENDED)],
        manage_devices=False,
    )
