"""Constants for the Plant Garden integration."""

from __future__ import annotations

from pathlib import Path
from typing import Final

DOMAIN: Final = "plant_garden"

CONF_GARDEN_NAME: Final = "garden_name"

# Frontend panel
PANEL_URL_PATH: Final = "plant-garden"
PANEL_WEBCOMPONENT: Final = "plant-garden-panel"
PANEL_ICON: Final = "mdi:flower"
FRONTEND_DIR: Final = Path(__file__).parent / "frontend"
FRONTEND_BUNDLE: Final = "plant-garden-panel.js"
STATIC_URL_PATH: Final = "/plant_garden_static"
