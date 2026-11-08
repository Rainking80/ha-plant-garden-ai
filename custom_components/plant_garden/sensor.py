"""Sensors: water per plant, run time and advice per zone, weather of the garden."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import UnitOfLength, UnitOfTime, UnitOfVolume
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .entity import (
    GARDEN,
    GARDEN_DEVICE,
    PLANT,
    ZONE,
    GardenEntity,
    GardenEntityDescription,
    async_track_items,
)
from .runtime import PlantGardenConfigEntry


@dataclass(frozen=True, kw_only=True)
class GardenSensorDescription(GardenEntityDescription, SensorEntityDescription):
    """A Plant Garden sensor."""


PLANT_SENSORS: tuple[GardenSensorDescription, ...] = (
    GardenSensorDescription(
        key="water_total",
        translation_key="water_total",
        item=PLANT,
        device_class=SensorDeviceClass.WATER,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfVolume.LITERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("total_l", 0.0),
    ),
    GardenSensorDescription(
        key="water_today",
        translation_key="water_today",
        item=PLANT,
        device_class=SensorDeviceClass.PRECIPITATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("today_mm", 0.0),
    ),
    GardenSensorDescription(
        key="last_watering",
        translation_key="last_watering",
        item=PLANT,
        device_class=SensorDeviceClass.TIMESTAMP,
        value=lambda stats: (
            dt_util.parse_datetime(stats["last_watering"]) if stats.get("last_watering") else None
        ),
    ),
    GardenSensorDescription(
        key="deficit",
        translation_key="deficit",
        item=PLANT,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("depletion"),
    ),
)

ZONE_SENSORS: tuple[GardenSensorDescription, ...] = (
    GardenSensorDescription(
        key="runtime_today",
        translation_key="runtime_today",
        item=ZONE,
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfTime.MINUTES,
        suggested_display_precision=0,
        value=lambda stats: round(stats.get("runtime_today_s", 0.0) / 60, 1),
    ),
    GardenSensorDescription(
        key="zone_water_today",
        translation_key="zone_water_today",
        item=ZONE,
        device_class=SensorDeviceClass.WATER,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfVolume.LITERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("liters_today", 0.0),
    ),
    GardenSensorDescription(
        key="recommended_runtime",
        translation_key="recommended_runtime",
        item=ZONE,
        device_class=SensorDeviceClass.DURATION,
        native_unit_of_measurement=UnitOfTime.MINUTES,
        suggested_display_precision=0,
        value=lambda stats: stats.get("minutes"),
    ),
)

GARDEN_SENSORS: tuple[GardenSensorDescription, ...] = (
    GardenSensorDescription(
        key="et0_today",
        translation_key="et0_today",
        item=GARDEN,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("et0_today"),
    ),
    GardenSensorDescription(
        key="rain_today",
        translation_key="rain_today",
        item=GARDEN,
        device_class=SensorDeviceClass.PRECIPITATION,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("rain_today"),
    ),
    GardenSensorDescription(
        key="rain_forecast",
        translation_key="rain_forecast",
        item=GARDEN,
        device_class=SensorDeviceClass.PRECIPITATION,
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        suggested_display_precision=1,
        value=lambda stats: stats.get("rain_forecast"),
    ),
    GardenSensorDescription(
        key="ai_cost_month",
        translation_key="ai_cost_month",
        item=GARDEN,
        device_class=SensorDeviceClass.MONETARY,
        suggested_display_precision=2,
        value=lambda stats: stats.get("month_cost"),
    ),
    GardenSensorDescription(
        key="ai_tokens_month",
        translation_key="ai_tokens_month",
        item=GARDEN,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement="tokens",
        value=lambda stats: stats.get("month_tokens"),
    ),
    GardenSensorDescription(
        key="ai_requests_today",
        translation_key="ai_requests_today",
        item=GARDEN,
        state_class=SensorStateClass.TOTAL_INCREASING,
        value=lambda stats: stats.get("today_requests"),
    ),
)


class GardenSensor(GardenEntity, SensorEntity):
    entity_description: GardenSensorDescription

    @property
    def native_value(self) -> float | datetime | None:
        value: float | datetime | None = self.entity_description.value(self._stats())
        return value

    @property
    def native_unit_of_measurement(self) -> str | None:
        if self.entity_description.key == "ai_cost_month":
            return self._data.ai.currency()
        return self.entity_description.native_unit_of_measurement


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PlantGardenConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    garden = DeviceInfo(identifiers={GARDEN_DEVICE})
    async_add_entities(
        GardenSensor(entry, "garden", garden, description) for description in GARDEN_SENSORS
    )
    async_track_items(
        hass,
        entry,
        async_add_entities,
        lambda plant_id, info: [GardenSensor(entry, plant_id, info, d) for d in PLANT_SENSORS],
        lambda zone_id, info: [GardenSensor(entry, zone_id, info, d) for d in ZONE_SENSORS],
        manage_devices=True,
    )
