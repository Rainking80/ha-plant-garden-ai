"""Shared fixtures for the Plant Garden tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plant_garden.const import DOMAIN
from custom_components.plant_garden.garden import GardenManager


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Allow Home Assistant to load the integration from custom_components."""


@pytest.fixture(autouse=True)
def wait_for_background_tasks(monkeypatch: pytest.MonkeyPatch) -> None:
    """Let async_block_till_done wait for background tasks as well.

    Home Assistant runs time listeners (async_track_time_change, async_call_later)
    as background tasks, and so does the integration with work that must not hold
    up the start (first weather fetch, identification and photo comparison after
    an upload). async_block_till_done skips them by default: on a fast machine they
    happen to be done in time, on a slow CI runner they are not.
    """
    original = HomeAssistant.async_block_till_done

    async def block_till_done(self: HomeAssistant, wait_background_tasks: bool = True) -> None:
        await original(self, wait_background_tasks=wait_background_tasks)

    monkeypatch.setattr(HomeAssistant, "async_block_till_done", block_till_done)


@pytest.fixture
def hass_config_dir(hass_tmp_config_dir: str) -> str:
    """Use a temporary config dir, so photos and the database land in tmp_path."""
    return hass_tmp_config_dir


@pytest.fixture
def mock_config_entry() -> MockConfigEntry:
    """Return a config entry for a garden called 'Garten'."""
    return MockConfigEntry(domain=DOMAIN, title="Garten", data={})


@pytest.fixture
async def loaded_entry(hass: HomeAssistant, mock_config_entry: MockConfigEntry) -> MockConfigEntry:
    """The integration, set up and ready."""
    mock_config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()
    return mock_config_entry


@pytest.fixture
async def manager(hass: HomeAssistant, tmp_path: Path) -> AsyncGenerator[GardenManager]:
    """A garden manager on its own, without the config entry."""
    garden = GardenManager(hass, tmp_path / "garden")
    await garden.async_setup()
    yield garden
    await garden.async_shutdown()
