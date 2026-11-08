"""Devices and the common entity base of Plant Garden (D-025).

Every plant and every irrigation zone is a device below the garden device.
Platforms register factories; new plants and zones get their entities
automatically, the sensor platform also renames and removes devices.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity, EntityDescription
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .garden import GardenChange, GardenManager
from .runtime import PlantGardenConfigEntry
from .water import garden_values

GARDEN_DEVICE = (DOMAIN, "garden")

PLANT, ZONE, GARDEN = "plant", "zone", "garden"


def plant_device(plant_id: str) -> tuple[str, str]:
    return (DOMAIN, f"plant_{plant_id}")


def zone_device(zone_id: str) -> tuple[str, str]:
    return (DOMAIN, f"zone_{zone_id}")


@callback
def async_garden_device(hass: HomeAssistant, entry: PlantGardenConfigEntry) -> dr.DeviceEntry:
    return dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={GARDEN_DEVICE},
        name=entry.title,
        manufacturer="Plant Garden",
        entry_type=dr.DeviceEntryType.SERVICE,
    )


def zone_name(manager: GardenManager, zone_id: str, hass: HomeAssistant) -> str:
    zone = manager.get_zone(zone_id)
    if zone.label:
        return zone.label
    entity_id = zone.irrigation.entity_id if zone.irrigation else None
    state = hass.states.get(entity_id) if entity_id else None
    if state and state.name:
        return state.name
    return "Bewässerungszone" if hass.config.language == "de" else "Irrigation zone"


@dataclass(frozen=True, kw_only=True)
class GardenEntityDescription(EntityDescription):
    """Which item an entity belongs to and how to read its value."""

    item: str  # PLANT, ZONE or GARDEN
    value: Callable[[dict[str, Any]], Any]


type Factory = Callable[[str, DeviceInfo], list[Entity]]


@callback
def async_track_items(
    hass: HomeAssistant,
    entry: PlantGardenConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
    plant_entities: Factory,
    zone_entities: Factory,
    *,
    manage_devices: bool,
) -> None:
    """Add entities for every plant and zone, now and whenever one appears.

    With `manage_devices` this platform also keeps device names current and
    removes the devices of deleted plants and zones (with all their entities).
    """
    manager = entry.runtime_data.manager
    registry = dr.async_get(hass)
    garden = async_garden_device(hass, entry)
    plants: set[str] = set()
    zones: set[str] = set()

    def device(identifier: tuple[str, str]) -> dr.DeviceEntry | None:
        return registry.async_get_device_by_identifier(identifier, entry.entry_id)

    @callback
    def sync(change: GardenChange | None = None) -> None:
        if change is not None and change.kind in ("irrigation", "water"):
            return
        new: list[Entity] = []
        current_plants = {plant.id: plant for plant in manager.plants}
        current_zones = {zone.id for zone in manager.zones()}
        for plant_id, plant in current_plants.items():
            if plant_id not in plants:
                plants.add(plant_id)
                info = DeviceInfo(
                    identifiers={plant_device(plant_id)},
                    name=plant.name,
                    manufacturer="Plant Garden",
                    model=plant.scientific_name,
                    via_device_id=garden.id,
                )
                new.extend(plant_entities(plant_id, info))
            elif (
                manage_devices
                and (existing := device(plant_device(plant_id)))
                and (existing.name != plant.name or existing.model != plant.scientific_name)
            ):
                registry.async_update_device(
                    existing.id, name=plant.name, model=plant.scientific_name
                )
        for zone_id in current_zones:
            name = zone_name(manager, zone_id, hass)
            if zone_id not in zones:
                zones.add(zone_id)
                info = DeviceInfo(
                    identifiers={zone_device(zone_id)},
                    name=name,
                    manufacturer="Plant Garden",
                    model="Irrigation zone",
                    via_device_id=garden.id,
                )
                new.extend(zone_entities(zone_id, info))
            elif (
                manage_devices
                and (existing := device(zone_device(zone_id)))
                and (existing.name != name)
            ):
                registry.async_update_device(existing.id, name=name)
        for gone, identifier, known in (
            (plants - current_plants.keys(), plant_device, plants),
            (zones - current_zones, zone_device, zones),
        ):
            for item_id in gone:
                known.discard(item_id)
                if manage_devices and (existing := device(identifier(item_id))):
                    registry.async_remove_device(existing.id)
        if new:
            async_add_entities(new)

    sync()
    entry.async_on_unload(manager.async_subscribe(sync))


class GardenEntity(Entity):
    """Reads irrigation and water values of a plant, a zone or the garden."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    entity_description: GardenEntityDescription

    def __init__(
        self,
        entry: PlantGardenConfigEntry,
        item_id: str,
        device_info: DeviceInfo,
        description: GardenEntityDescription,
    ) -> None:
        self._data = entry.runtime_data
        self._item_id = item_id
        self.entity_description = description
        self._attr_device_info = device_info
        self._attr_unique_id = f"{item_id}_{description.key}"

    async def async_added_to_hass(self) -> None:
        @callback
        def changed(change: GardenChange) -> None:
            if change.kind in ("irrigation", "ai", "care", "plant"):
                self.async_write_ha_state()

        self.async_on_remove(self._data.manager.async_subscribe(changed))
        self.async_on_remove(self._data.water.async_add_listener(self.async_write_ha_state))

    def _stats(self) -> dict[str, Any]:
        """Everything known about this entity's item, for the description's `value`."""
        item = self.entity_description.item
        water = self._data.water.data
        if item == GARDEN:
            return dict(garden_values(water)) | self._data.ai.stats
        summary = self._data.irrigation.summary()
        if item == PLANT:
            stats = dict(summary["plants"].get(self._item_id, {}))
            stats.update(self._data.care.stats.get(self._item_id, {}))
            plant = next((p for p in self._data.manager.plants if p.id == self._item_id), None)
            if plant is not None:
                stats["health"] = plant.status.value
            state = water.plants.get(self._item_id) if water else None
            if state is not None:
                stats.update(
                    depletion=state.depletion, needs_water=state.needs_water, frost=state.frost
                )
            return stats
        stats = dict(summary["zones"].get(self._item_id, {}))
        advice = water.zones.get(self._item_id) if water else None
        if advice is not None:
            stats.update(recommended=advice.recommended, minutes=advice.minutes)
        return stats
