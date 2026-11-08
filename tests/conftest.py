"""Shared fixtures for the Plant Garden tests."""

from __future__ import annotations

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plant_garden.const import DOMAIN


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Allow Home Assistant to load the integration from custom_components."""


@pytest.fixture
def mock_config_entry() -> MockConfigEntry:
    """Return a config entry for a garden called 'Garten'."""
    return MockConfigEntry(domain=DOMAIN, title="Garten", data={})
