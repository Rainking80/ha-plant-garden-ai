"""Tests for the Plant Garden config flow."""

from __future__ import annotations

from unittest.mock import patch

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plant_garden.const import CONF_GARDEN_NAME, DOMAIN


async def test_user_flow_creates_entry(hass: HomeAssistant) -> None:
    """A name is all it takes to create the garden."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {}

    with patch("custom_components.plant_garden.async_setup_entry", return_value=True) as setup:
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {CONF_GARDEN_NAME: "  Schrebergarten  "}
        )
        await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Schrebergarten"
    assert result["data"] == {}
    assert len(setup.mock_calls) == 1


async def test_blank_name_is_rejected(hass: HomeAssistant) -> None:
    """Whitespace-only names show an error and keep the form open."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_GARDEN_NAME: "   "}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_GARDEN_NAME: "name_required"}


async def test_default_name_follows_language(hass: HomeAssistant) -> None:
    """The suggested name is German for German installations."""
    hass.config.language = "de"
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    schema = result["data_schema"].schema
    default = next(key.default() for key in schema if key == CONF_GARDEN_NAME)
    assert default == "Garten"

    hass.config.language = "fr"
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    schema = result["data_schema"].schema
    default = next(key.default() for key in schema if key == CONF_GARDEN_NAME)
    assert default == "Garden"


async def test_only_one_garden(hass: HomeAssistant, mock_config_entry: MockConfigEntry) -> None:
    """A second garden cannot be added."""
    mock_config_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_options_flow_sets_the_run_time_warning(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    """The warning limit for long zone runs is an option (default 6 h)."""
    result = await hass.config_entries.options.async_init(loaded_entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"
    schema_keys = {str(key): key for key in result["data_schema"].schema}
    assert schema_keys["max_runtime_hours"].default() == 6

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"max_runtime_hours": 3.0}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert loaded_entry.options == {
        "max_runtime_hours": 3,
        "ai_budget": 0,
        "ai_budget_stop": False,
        "ai_debug": False,
        "ai_retention_days": 90,
        "usd_eur": 0,
        "weekly_check": False,
        "ai_auto_identify": False,
        "research_schedule": "off",
        "weather_alerts": True,
        "photo_compare": False,
        "context_tokens_diagnose": 2500,
        "context_tokens_tips": 4000,
        "context_tokens_chat": 3000,
    }
    assert loaded_entry.runtime_data.irrigation._max_runtime_hours() == 3
