"""Sensors: water per plant, run time and water per irrigation zone.

Every plant and every zone is a device below the garden device. Devices and
their entities appear and disappear with the plants and zones.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import UnitOfLength, UnitOfTime, UnitOfVolume
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .garden import GardenChange, GardenManager
from .irrigation import IrrigationTracker
from .runtime import PlantGardenConfigEntry

GARDEN_DEVICE = (DOMAIN, "garden")


def plant_device(plant_id: str) -> tuple[str, str]:
    return (DOMAIN, f"plant_{plant_id}")


def zone_device(zone_id: str) -> tuple[str, str]:
    return (DOMAIN, f"zone_{zone_id}")


@dataclass(frozen=True, kw_only=True)
class GardenSensorDescription(SensorEntityDescription):
    """How to read one value from the irrigation summary."""

    value: Callable[[dict[str, Any]], Any]


PLANT_SENSORS: tuple[GardenSensorDescription, ...] = (
    GardenSensorDescription(
        key="water_total",
        translation_key="water_total",
        device_class=SensorDeviceClass.WATER,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfVolume.LITERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("total_l", 0.0),
    ),
    GardenSensorDescription(
        key="water_today",
        translation_key="water_today",
        device_class=SensorDeviceClass.PRECIPITATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("today_mm", 0.0),
    ),
    GardenSensorDescription(
        key="last_watering",
        translation_key="last_watering",
        device_class=SensorDeviceClass.TIMESTAMP,
        value=lambda stats: (
            dt_util.parse_datetime(stats["last_watering"]) if stats.get("last_watering") else None
        ),
    ),
)

ZONE_SENSORS: tuple[GardenSensorDescription, ...] = (
    GardenSensorDescription(
        key="runtime_today",
        translation_key="runtime_today",
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfTime.MINUTES,
        suggested_display_precision=0,
        value=lambda stats: round(stats.get("runtime_today_s", 0.0) / 60, 1),
    ),
    GardenSensorDescription(
        key="zone_water_today",
        translation_key="zone_water_today",
        device_class=SensorDeviceClass.WATER,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfVolume.LITERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("liters_today", 0.0),
    ),
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


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PlantGardenConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    manager = entry.runtime_data.manager
    tracker = entry.runtime_data.irrigation
    registry = dr.async_get(hass)
    garden = registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={GARDEN_DEVICE},
        name=entry.title,
        manufacturer="Plant Garden",
        entry_type=dr.DeviceEntryType.SERVICE,
    )
    plants: set[str] = set()
    zones: set[str] = set()

    @callback
    def sync(change: GardenChange | None = None) -> None:
        if change is not None and change.kind == "irrigation":
            return
        new: list[SensorEntity] = []
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
                new.extend(
                    PlantSensor(manager, tracker, plant_id, info, description)
                    for description in PLANT_SENSORS
                )
            elif (
                device := registry.async_get_device_by_identifier(
                    plant_device(plant_id), entry.entry_id
                )
            ) and (device.name != plant.name or device.model != plant.scientific_name):
                registry.async_update_device(
                    device.id, name=plant.name, model=plant.scientific_name
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
                new.extend(
                    ZoneSensor(manager, tracker, zone_id, info, description)
                    for description in ZONE_SENSORS
                )
            elif (
                device := registry.async_get_device_by_identifier(
                    zone_device(zone_id), entry.entry_id
                )
            ) and device.name != name:
                registry.async_update_device(device.id, name=name)
        for gone, identifier, known in (
            (plants - current_plants.keys(), plant_device, plants),
            (zones - current_zones, zone_device, zones),
        ):
            for item_id in gone:
                known.discard(item_id)
                if device := registry.async_get_device_by_identifier(
                    identifier(item_id), entry.entry_id
                ):
                    registry.async_remove_device(device.id)
        if new:
            async_add_entities(new)

    sync()
    entry.async_on_unload(manager.async_subscribe(sync))


class GardenSensor(SensorEntity):
    """Common base: reads the tracker's summary, updates on irrigation changes."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    entity_description: GardenSensorDescription

    def __init__(
        self,
        manager: GardenManager,
        tracker: IrrigationTracker,
        item_id: str,
        device_info: DeviceInfo,
        description: GardenSensorDescription,
    ) -> None:
        self._manager = manager
        self._tracker = tracker
        self._item_id = item_id
        self.entity_description = description
        self._attr_device_info = device_info
        self._attr_unique_id = f"{item_id}_{description.key}"

    async def async_added_to_hass(self) -> None:
        @callback
        def changed(change: GardenChange) -> None:
            if change.kind == "irrigation":
                self.async_write_ha_state()

        self.async_on_remove(self._manager.async_subscribe(changed))

    def _stats(self) -> dict[str, Any]:
        raise NotImplementedError

    @property
    def native_value(self) -> float | datetime | None:
        value: float | datetime | None = self.entity_description.value(self._stats())
        return value


class PlantSensor(GardenSensor):
    def _stats(self) -> dict[str, Any]:
        stats: dict[str, Any] = self._tracker.summary()["plants"].get(self._item_id, {})
        return stats


class ZoneSensor(GardenSensor):
    def _stats(self) -> dict[str, Any]:
        stats: dict[str, Any] = self._tracker.summary()["zones"].get(self._item_id, {})
        return stats
