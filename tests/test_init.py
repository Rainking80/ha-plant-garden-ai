"""Tests for setting up and unloading Plant Garden."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.const import (
    FRONTEND_BUNDLE,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
    STATIC_URL_PATH,
)
from custom_components.plant_garden.database import DatabaseError
from custom_components.plant_garden.panel import _bundle_fingerprint
from custom_components.plant_garden.runtime import get_manager
from custom_components.plant_garden.storage import STORAGE_KEY

from .images import make_image


async def test_data_survives_reload(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """Plants, photos and their files are still there after a reload."""
    await _setup(hass, mock_config_entry)
    manager = get_manager(hass)
    assert manager is not None
    plant = await manager.async_create_plant({"name": "Feige"})
    photo = await manager.async_add_photo(plant.id, make_image())

    assert await hass.config_entries.async_reload(mock_config_entry.entry_id)
    await hass.async_block_till_done()

    reloaded = get_manager(hass)
    assert reloaded is not None
    assert reloaded is not manager
    assert reloaded.get_plant(plant.id).name == "Feige"
    assert [p.id for p in await reloaded.async_list_photos(plant.id)] == [photo.id]


async def test_setup_retries_when_database_fails(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    mock_config_entry.add_to_hass(hass)
    with patch(
        "custom_components.plant_garden.garden.GardenDatabase.open",
        side_effect=DatabaseError("disk full"),
    ):
        await hass.config_entries.async_setup(mock_config_entry.entry_id)
    assert mock_config_entry.state is ConfigEntryState.SETUP_RETRY


async def test_old_store_is_migrated(
    hass: HomeAssistant, hass_storage: dict, mock_config_entry: MockConfigEntry
) -> None:
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 0, "key": STORAGE_KEY, "data": {}}
    await _setup(hass, mock_config_entry)
    manager = get_manager(hass)
    assert manager is not None
    assert manager.plants == []
    assert hass_storage[STORAGE_KEY]["minor_version"] == 1


async def _setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_setup_registers_panel(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """Setting up the entry adds the sidebar panel."""
    await _setup(hass, mock_config_entry)
    assert mock_config_entry.state is ConfigEntryState.LOADED

    panel = hass.data[DATA_PANELS][PANEL_URL_PATH]
    assert panel.sidebar_title == "Garten"
    assert panel.sidebar_icon == "mdi:flower"
    assert panel.require_admin is False
    custom = panel.config["_panel_custom"]
    assert custom["name"] == PANEL_WEBCOMPONENT
    assert custom["module_url"].startswith(f"{STATIC_URL_PATH}/{FRONTEND_BUNDLE}?v=")
    assert panel.config["entry_id"] == mock_config_entry.entry_id


async def test_unload_removes_panel(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """Unloading the entry removes the panel again."""
    await _setup(hass, mock_config_entry)
    assert await hass.config_entries.async_unload(mock_config_entry.entry_id)
    await hass.async_block_till_done()
    assert mock_config_entry.state is ConfigEntryState.NOT_LOADED
    assert PANEL_URL_PATH not in hass.data[DATA_PANELS]


async def test_ws_info(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    mock_config_entry: MockConfigEntry,
) -> None:
    """The panel can ask the backend for basic garden information."""
    await _setup(hass, mock_config_entry)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "plant_garden/info"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["garden_name"] == "Garten"
    assert msg["result"]["entry_id"] == mock_config_entry.entry_id
    assert msg["result"]["version"] == "0.1.0"
    assert msg["result"]["is_admin"] is True

    assert await hass.config_entries.async_unload(mock_config_entry.entry_id)
    await client.send_json_auto_id({"type": "plant_garden/info"})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "not_loaded"


async def test_bundle_fingerprint(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """The cache-busting fingerprint changes with the bundle content."""
    with patch("custom_components.plant_garden.panel.FRONTEND_DIR", tmp_path):
        assert _bundle_fingerprint() == "missing"
        assert "Frontend bundle" in caplog.text

        (tmp_path / FRONTEND_BUNDLE).write_text("console.log(1)")
        first = _bundle_fingerprint()
        (tmp_path / FRONTEND_BUNDLE).write_text("console.log(2)")
        second = _bundle_fingerprint()

    assert len(first) == 12
    assert first != second
