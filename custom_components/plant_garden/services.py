"""Actions (services) of Plant Garden."""

from __future__ import annotations

from pathlib import Path

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
    async_register_assistant_services(hass)


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


SERVICE_ASK_ASSISTANT = "ask_assistant"
SERVICE_CREATE_TASK = "create_task"
SERVICE_ADD_PHOTO = "add_photo"


def _plant_id(hass: HomeAssistant, device_id: str | None) -> str | None:
    if not device_id:
        return None
    plants, _ = _targets(hass, [device_id])
    if not plants:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="not_plant_or_zone",
            translation_placeholders={"device_id": device_id},
        )
    return plants[0]


@callback
def async_register_assistant_services(hass: HomeAssistant) -> None:
    async def ask_assistant(call: ServiceCall) -> ServiceResponse:
        """A question about the garden or one plant; the answer as text (and in the chat)."""
        entry = get_loaded_entry(hass)
        if entry is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        plant_id = _plant_id(hass, call.data.get("device_id"))
        try:
            answer = await entry.runtime_data.assistant.async_chat(plant_id, call.data["question"])
        except AIError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="ai_failed",
                translation_placeholders={"error": str(err)},
            ) from err
        return {"answer": answer.text}

    hass.services.async_register(
        DOMAIN,
        SERVICE_ASK_ASSISTANT,
        ask_assistant,
        schema=probatio.Schema(
            {
                probatio.Required("question"): probatio.All(str, probatio.Length(min=1, max=4000)),
                probatio.Optional("device_id"): str,
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )

    async def create_task(call: ServiceCall) -> ServiceResponse:
        entry = get_loaded_entry(hass)
        if entry is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        fields: dict[str, object] = {
            "title": call.data["title"],
            "kind": call.data["kind"],
            "plant_id": _plant_id(hass, call.data.get("device_id")),
            "notes": call.data["notes"],
            "due": call.data.get("due"),
        }
        if call.data.get("repeat_every"):
            fields["repeat"] = {
                "every": call.data["repeat_every"],
                "unit": call.data["repeat_unit"],
            }
        task = await entry.runtime_data.care.async_create_task(fields)
        return {"task_id": task.id}

    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_TASK,
        create_task,
        schema=probatio.Schema(
            {
                probatio.Required("title"): probatio.All(str, probatio.Length(min=1, max=200)),
                probatio.Optional("kind", default="other"): probatio.In(
                    [
                        "water",
                        "fertilize",
                        "prune",
                        "repot",
                        "pest_check",
                        "harvest",
                        "photo",
                        "other",
                    ]
                ),
                probatio.Optional("device_id"): str,
                probatio.Optional("due"): cv.date,
                probatio.Optional("repeat_every"): probatio.All(
                    probatio.Coerce(int), probatio.Range(min=1, max=365)
                ),
                probatio.Optional("repeat_unit", default="days"): probatio.In(["days", "weeks"]),
                probatio.Optional("notes", default=""): probatio.All(
                    str, probatio.Length(max=2000)
                ),
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )

    async def add_photo(call: ServiceCall) -> ServiceResponse:
        """A photo from a file in an allowed folder or a camera snapshot."""
        entry = get_loaded_entry(hass)
        if entry is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        plant_id = _plant_id(hass, call.data["device_id"])
        assert plant_id is not None  # device_id is required
        path = call.data.get("file_path")
        camera = call.data.get("camera_entity_id")
        if bool(path) == bool(camera):
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="photo_source")
        if path:
            if not hass.config.is_allowed_path(path):
                raise ServiceValidationError(
                    translation_domain=DOMAIN,
                    translation_key="path_not_allowed",
                    translation_placeholders={"path": path},
                )
            try:
                data = await hass.async_add_executor_job(Path(path).read_bytes)
            except OSError as err:
                raise HomeAssistantError(str(err)) from err
        else:
            # imported here: the camera integration needs extra packages (PyTurboJPEG)
            from homeassistant.components.camera import async_get_image  # noqa: PLC0415

            data = (await async_get_image(hass, str(camera))).content
        try:
            photo = await entry.runtime_data.manager.async_add_photo(
                plant_id, data, tags=call.data["tags"], note=call.data["note"]
            )
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err
        return {"photo_id": photo.id}

    hass.services.async_register(
        DOMAIN,
        SERVICE_ADD_PHOTO,
        add_photo,
        schema=probatio.Schema(
            {
                probatio.Required("device_id"): str,
                probatio.Optional("file_path"): str,
                probatio.Optional("camera_entity_id"): cv.entity_domain("camera"),
                probatio.Optional("tags", default=[]): probatio.All(cv.ensure_list, [str]),
                probatio.Optional("note", default=""): probatio.All(str, probatio.Length(max=500)),
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )
