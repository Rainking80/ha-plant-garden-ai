"""Config flow for Plant Garden."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import (
    SOURCE_RECONFIGURE,
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    OptionsFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util
import probatio

from .ai.flow import AISubentryFlow
from .const import (
    CONF_AI_BUDGET,
    CONF_AI_BUDGET_STOP,
    CONF_AI_DEBUG,
    CONF_AI_IDENTIFY,
    CONF_AI_RETENTION_DAYS,
    CONF_AI_TEXT,
    CONF_CONTEXT_TOKENS,
    CONF_GARDEN_NAME,
    CONF_MAX_RUNTIME_HOURS,
    CONF_USD_EUR,
    CONF_WEEKLY_CHECK,
    DEFAULT_AI_RETENTION_DAYS,
    DEFAULT_CONTEXT_TOKENS,
    DEFAULT_MAX_RUNTIME_HOURS,
    DOMAIN,
    SUBENTRY_AI,
)
from .water import CONF_SOURCE, SUBENTRY_WEATHER
from .weather import bright_sky, home_assistant, open_meteo
from .weather.base import (
    SOURCE_BRIGHT_SKY,
    SOURCE_HOME_ASSISTANT,
    SOURCE_OPEN_METEO,
    WeatherError,
    round_coordinate,
)

DEFAULT_NAMES = {"de": "Garten"}
FALLBACK_NAME = "Garden"


class PlantGardenConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a garden."""

    VERSION = 1
    MINOR_VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return PlantGardenOptionsFlow()

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        return {SUBENTRY_WEATHER: WeatherSubentryFlow, SUBENTRY_AI: AISubentryFlow}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Ask for the garden name."""
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_GARDEN_NAME].strip()
            if name:
                return self.async_create_entry(title=name, data={})
            errors[CONF_GARDEN_NAME] = "name_required"

        default_name = DEFAULT_NAMES.get(self.hass.config.language, FALLBACK_NAME)
        return self.async_show_form(
            step_id="user",
            data_schema=probatio.Schema(
                {probatio.Required(CONF_GARDEN_NAME, default=default_name): str}
            ),
            errors=errors,
        )


class PlantGardenOptionsFlow(OptionsFlow):
    """Settings that are read while the garden runs (no reload needed)."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            data = {
                CONF_MAX_RUNTIME_HOURS: int(user_input[CONF_MAX_RUNTIME_HOURS]),
                CONF_AI_BUDGET: float(user_input.get(CONF_AI_BUDGET) or 0),
                CONF_AI_BUDGET_STOP: bool(user_input.get(CONF_AI_BUDGET_STOP)),
                CONF_AI_DEBUG: bool(user_input.get(CONF_AI_DEBUG)),
                CONF_AI_RETENTION_DAYS: int(
                    user_input.get(CONF_AI_RETENTION_DAYS) or DEFAULT_AI_RETENTION_DAYS
                ),
                CONF_USD_EUR: float(user_input.get(CONF_USD_EUR) or 0),
                CONF_WEEKLY_CHECK: bool(user_input.get(CONF_WEEKLY_CHECK)),
            }
            for feature, default in DEFAULT_CONTEXT_TOKENS.items():
                data[CONF_CONTEXT_TOKENS + feature] = int(
                    user_input.get(CONF_CONTEXT_TOKENS + feature) or default
                )
            for key in (CONF_AI_IDENTIFY, CONF_AI_TEXT):
                if user_input.get(key):
                    data[key] = user_input[key]
            return self.async_create_entry(data=data)
        options = self.config_entry.options

        def number(minimum: float, maximum: float, step: float, unit: str | None = None) -> Any:
            config = selector.NumberSelectorConfig(
                min=minimum, max=maximum, step=step, mode=selector.NumberSelectorMode.BOX
            )
            if unit:
                config["unit_of_measurement"] = unit
            return selector.NumberSelector(config)

        providers = [
            selector.SelectOptionDict(value=sub.subentry_id, label=sub.title)
            for sub in self.config_entry.subentries.values()
            if sub.subentry_type == SUBENTRY_AI and sub.data.get("kind") != "plantnet"
        ]
        fields: dict[Any, Any] = {
            probatio.Required(
                CONF_MAX_RUNTIME_HOURS,
                default=options.get(CONF_MAX_RUNTIME_HOURS, DEFAULT_MAX_RUNTIME_HOURS),
            ): number(1, 48, 1, "h"),
        }
        if providers:
            for key in (CONF_AI_IDENTIFY, CONF_AI_TEXT):
                fields[
                    probatio.Optional(key, description={"suggested_value": options.get(key)})
                ] = selector.SelectSelector(selector.SelectSelectorConfig(options=providers))
        fields.update(
            {
                probatio.Required(CONF_AI_BUDGET, default=options.get(CONF_AI_BUDGET, 0)): number(
                    0, 10000, 0.5
                ),
                probatio.Required(
                    CONF_AI_BUDGET_STOP, default=options.get(CONF_AI_BUDGET_STOP, False)
                ): bool,
                probatio.Required(CONF_USD_EUR, default=options.get(CONF_USD_EUR, 0)): number(
                    0, 10, 0.001
                ),
                probatio.Required(CONF_AI_DEBUG, default=options.get(CONF_AI_DEBUG, False)): bool,
                probatio.Required(
                    CONF_AI_RETENTION_DAYS,
                    default=options.get(CONF_AI_RETENTION_DAYS, DEFAULT_AI_RETENTION_DAYS),
                ): number(7, 730, 1, "d"),
                probatio.Required(
                    CONF_WEEKLY_CHECK, default=options.get(CONF_WEEKLY_CHECK, False)
                ): bool,
            }
        )
        for feature, default in DEFAULT_CONTEXT_TOKENS.items():
            fields[
                probatio.Required(
                    CONF_CONTEXT_TOKENS + feature,
                    default=options.get(CONF_CONTEXT_TOKENS + feature, default),
                )
            ] = number(500, 20000, 100)
        return self.async_show_form(
            step_id="init",
            data_schema=probatio.Schema(fields),
        )


SOURCE_TITLES = {
    SOURCE_OPEN_METEO: "Open-Meteo",
    SOURCE_BRIGHT_SKY: "Bright Sky (DWD)",
}
OWN_SENSORS_TITLE = {"de": "Eigene Sensoren"}

# field, entity domain, device class (None: any)
SENSOR_FIELDS: tuple[tuple[str, str, str | None], ...] = (
    (home_assistant.RAIN, "sensor", None),
    (home_assistant.ET0, "sensor", None),
    (home_assistant.TEMPERATURE, "sensor", "temperature"),
    (home_assistant.HUMIDITY, "sensor", "humidity"),
    (home_assistant.WIND, "sensor", "wind_speed"),
    (home_assistant.RADIATION, "sensor", "irradiance"),
    (home_assistant.FORECAST, "weather", None),
)


class WeatherSubentryFlow(ConfigSubentryFlow):
    """Add or change a weather source of the garden."""

    _source: str

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        """Choose the kind of source."""
        if user_input is not None:
            self._source = user_input[CONF_SOURCE]
            if self._source == SOURCE_HOME_ASSISTANT:
                return await self.async_step_sensors()
            existing = self._get_entry().subentries.values()
            if any(sub.data.get(CONF_SOURCE) == self._source for sub in existing):
                return self.async_abort(reason="already_configured")
            return await self.async_step_service()
        return self.async_show_form(
            step_id="user",
            data_schema=probatio.Schema(
                {
                    probatio.Required(CONF_SOURCE, default=SOURCE_OPEN_METEO): (
                        selector.SelectSelector(
                            selector.SelectSelectorConfig(
                                options=[
                                    SOURCE_OPEN_METEO,
                                    SOURCE_BRIGHT_SKY,
                                    SOURCE_HOME_ASSISTANT,
                                ],
                                translation_key="weather_source",
                                mode=selector.SelectSelectorMode.LIST,
                            )
                        )
                    )
                }
            ),
        )

    def _location(self) -> tuple[float, float]:
        """The garden's location (it may have been moved away from HA's home), rounded."""
        entry = self._get_entry()
        manager = getattr(getattr(entry, "runtime_data", None), "manager", None)
        origin = manager.layout.origin if manager else None
        latitude = origin.latitude if origin else self.hass.config.latitude
        longitude = origin.longitude if origin else self.hass.config.longitude
        return round_coordinate(latitude), round_coordinate(longitude)

    async def async_step_service(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """A weather service: confirm what is sent, then test it."""
        errors: dict[str, str] = {}
        latitude, longitude = self._location()
        if user_input is not None:
            today = dt_util.now().date()
            session = async_get_clientsession(self.hass)
            try:
                if self._source == SOURCE_OPEN_METEO:
                    await open_meteo.async_fetch(
                        session,
                        latitude,
                        longitude,
                        self.hass.config.time_zone,
                        past_days=1,
                        forecast_days=1,
                    )
                else:
                    days = await bright_sky.async_fetch(
                        session,
                        latitude,
                        longitude,
                        self.hass.config.time_zone,
                        start=today,
                        end=today,
                    )
                    if not days:
                        raise WeatherError("no data")
            except WeatherError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=SOURCE_TITLES[self._source],
                    data={CONF_SOURCE: self._source},
                    unique_id=self._source,
                )
        return self.async_show_form(
            step_id="service",
            description_placeholders={
                "service": SOURCE_TITLES[self._source],
                "latitude": f"{latitude:.2f}",
                "longitude": f"{longitude:.2f}",
            },
            errors=errors,
        )

    def _sensor_schema(self, current: dict[str, Any]) -> probatio.Schema:
        fields: dict[Any, Any] = {}
        for key, domain, device_class in SENSOR_FIELDS:
            default = current.get(key)
            marker = (
                probatio.Optional(key, description={"suggested_value": default})
                if default
                else probatio.Optional(key)
            )
            config = (
                selector.EntitySelectorConfig(domain=domain, device_class=device_class)
                if device_class
                else selector.EntitySelectorConfig(domain=domain)
            )
            fields[marker] = selector.EntitySelector(config)
        return probatio.Schema(fields)

    async def async_step_sensors(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """The user's own sensors and weather entity."""
        errors: dict[str, str] = {}
        if user_input is not None:
            data = {key: value for key, value in user_input.items() if value}
            if not data:
                errors["base"] = "no_sensor"
            elif self.source == SOURCE_RECONFIGURE:
                return self.async_update_and_abort(
                    self._get_entry(),
                    self._get_reconfigure_subentry(),
                    data={CONF_SOURCE: SOURCE_HOME_ASSISTANT, **data},
                )
            else:
                return self.async_create_entry(
                    title=OWN_SENSORS_TITLE.get(self.hass.config.language, "Own sensors"),
                    data={CONF_SOURCE: SOURCE_HOME_ASSISTANT, **data},
                )
        current = user_input or (
            dict(self._get_reconfigure_subentry().data) if self.source == SOURCE_RECONFIGURE else {}
        )
        return self.async_show_form(
            step_id="sensors", data_schema=self._sensor_schema(current), errors=errors
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Only own sensors have settings; weather services have none."""
        if self._get_reconfigure_subentry().data.get(CONF_SOURCE) != SOURCE_HOME_ASSISTANT:
            return self.async_abort(reason="nothing_to_configure")
        return await self.async_step_sensors()
