"""Config flow for Plant Garden."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
import probatio

from .const import CONF_GARDEN_NAME, DOMAIN

DEFAULT_NAMES = {"de": "Garten"}
FALLBACK_NAME = "Garden"


class PlantGardenConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a garden."""

    VERSION = 1
    MINOR_VERSION = 1

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
