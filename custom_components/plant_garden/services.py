"""Actions (services) of Plant Garden."""

from __future__ import annotations

from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv, device_registry as dr
import probatio

from .ai.base import AIError
from .const import DOMAIN
from .garden import NotFoundError
from .runtime import get_loaded_entry

SERVICE_LOG_WATERING = "log_watering"

LOG_WATERING_SCHEMA = probatio.Schema(
    {
        probatio.Required("device_id"): probatio.All(cv.ensure_list, [str]),
        probatio.Optional("liters"): probatio.All(
            probatio.Coerce(float), probatio.Range(min=0.01, max=10000)
        ),
        probatio.Optional("minutes"): probatio.All(
            probatio.Coerce(float), probatio.Range(min=0.1, max=1440)
        ),
        probatio.Optional("note", default=""): probatio.All(str, probatio.Length(max=500)),
    }
)


def _targets(hass: HomeAssistant, device_ids: list[str]) -> tuple[list[str], list[str]]:
    """Plant ids and zone ids behind the selected devices."""
    registry = dr.async_get(hass)
    plants: list[str] = []
    zones: list[str] = []
    for device_id in device_ids:
        device = registry.async_get(device_id)
        ident = next((i for d, i in device.identifiers if d == DOMAIN), "") if device else ""
        if ident.startswith("plant_"):
            plants.append(ident.removeprefix("plant_"))
        elif ident.startswith("zone_"):
            zones.append(ident.removeprefix("zone_"))
        else:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="not_plant_or_zone",
                translation_placeholders={"device_id": device_id},
            )
    return plants, zones


@callback
def async_register_services(hass: HomeAssistant) -> None:
    async def log_watering(call: ServiceCall) -> None:
        entry = get_loaded_entry(hass)
        if entry is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        plants, zones = _targets(hass, call.data["device_id"])
        liters = call.data.get("liters")
        minutes = call.data.get("minutes")
        if plants and liters is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="liters_needed")
        if zones and minutes is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="minutes_needed"
            )
        tracker = entry.runtime_data.irrigation
        note = call.data["note"]
        try:
            if plants and liters is not None:
                await tracker.async_log_watering(dict.fromkeys(plants, liters), note=note)
            for zone_id in zones:
                if minutes is not None:
                    await tracker.async_log_zone_run(zone_id, minutes, note=note)
        except NotFoundError as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="not_plant_or_zone",
                translation_placeholders={"device_id": str(err)},
            ) from err

    hass.services.async_register(
        DOMAIN,
        SERVICE_LOG_WATERING,
        log_watering,
        schema=LOG_WATERING_SCHEMA,
        supports_response=SupportsResponse.NONE,
    )
    async_register_weather_service(hass)


SERVICE_REFRESH_WEATHER = "refresh_weather"
SERVICE_IDENTIFY_PLANT = "identify_plant"


@callback
def async_register_weather_service(hass: HomeAssistant) -> None:
    async def refresh_weather(call: ServiceCall) -> None:
        entry = get_loaded_entry(hass)
        if entry is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        await entry.runtime_data.water.async_refresh()

    hass.services.async_register(DOMAIN, SERVICE_REFRESH_WEATHER, refresh_weather)

    async def identify_plant(call: ServiceCall) -> ServiceResponse:
        """Identify a plant from its newest photos; returns the suggestions."""
        entry = get_loaded_entry(hass)
        if entry is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        plants, _ = _targets(hass, [call.data["device_id"]])
        if not plants:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="not_plant_or_zone",
                translation_placeholders={"device_id": call.data["device_id"]},
            )
        manager = entry.runtime_data.manager
        photos = await manager.async_list_photos(plants[0])
        if not photos:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="no_photos")
        try:
            result = await entry.runtime_data.ai.async_identify(
                plants[0],
                [(photo.id, "auto") for photo in photos[: call.data["photos"]]],
                hass.config.language,
            )
        except AIError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="ai_failed",
                translation_placeholders={"error": str(err)},
            ) from err
        return {"suggestions": result.get("suggestions", []), "result": result.get("result")}

    hass.services.async_register(
        DOMAIN,
        SERVICE_IDENTIFY_PLANT,
        identify_plant,
        schema=probatio.Schema(
            {
                probatio.Required("device_id"): str,
                probatio.Optional("photos", default=3): probatio.All(
                    probatio.Coerce(int), probatio.Range(min=1, max=3)
                ),
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )
