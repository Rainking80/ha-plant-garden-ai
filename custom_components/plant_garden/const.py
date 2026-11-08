"""Constants for the Plant Garden integration."""

from __future__ import annotations

from pathlib import Path
from typing import Final

DOMAIN: Final = "plant_garden"

CONF_GARDEN_NAME: Final = "garden_name"

# Plan coordinates are metres around the origin (the garden's location). A
# garden is far smaller; the limit keeps the map projection accurate (D-017).
PLAN_EXTENT_M: Final = 10000

# Frontend panel
PANEL_URL_PATH: Final = "plant-garden"
PANEL_WEBCOMPONENT: Final = "plant-garden-panel"
PANEL_ICON: Final = "mdi:flower"
FRONTEND_DIR: Final = Path(__file__).parent / "frontend"
FRONTEND_BUNDLE: Final = "plant-garden-panel.js"
STATIC_URL_PATH: Final = "/plant_garden_static"

# HTTP API
PHOTO_UPLOAD_URL: Final = "/api/plant_garden/photos"
PHOTO_FILE_URL: Final = "/api/plant_garden/photos/{photo_id}/{variant}"
BACKGROUND_UPLOAD_URL: Final = "/api/plant_garden/backgrounds"
BACKGROUND_FILE_URL: Final = "/api/plant_garden/backgrounds/{image_id}"

# Irrigation
CONF_MAX_RUNTIME_HOURS: Final = "max_runtime_hours"
DEFAULT_MAX_RUNTIME_HOURS: Final = 6
EVENT_IRRIGATION_FINISHED: Final = "plant_garden_irrigation_finished"
ZONE_ENTITY_DOMAINS: Final = ("valve", "switch", "input_boolean", "binary_sensor")
