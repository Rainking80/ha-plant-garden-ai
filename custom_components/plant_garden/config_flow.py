"""Config flow for Plant Garden."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector
import probatio

from .const import CONF_GARDEN_NAME, CONF_MAX_RUNTIME_HOURS, DEFAULT_MAX_RUNTIME_HOURS, DOMAIN

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
            return self.async_create_entry(
                data={CONF_MAX_RUNTIME_HOURS: int(user_input[CONF_MAX_RUNTIME_HOURS])}
            )
        current = self.config_entry.options.get(CONF_MAX_RUNTIME_HOURS, DEFAULT_MAX_RUNTIME_HOURS)
        return self.async_show_form(
            step_id="init",
            data_schema=probatio.Schema(
                {
                    probatio.Required(CONF_MAX_RUNTIME_HOURS, default=current): (
                        selector.NumberSelector(
                            selector.NumberSelectorConfig(
                                min=1,
                                max=48,
                                step=1,
                                unit_of_measurement="h",
                                mode=selector.NumberSelectorMode.BOX,
                            )
                        )
                    )
                }
            ),
        )
