"""Registration of the Plant Garden sidebar panel and its static files."""

from __future__ import annotations

import hashlib
import logging

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    FRONTEND_BUNDLE,
    FRONTEND_DIR,
    PANEL_ICON,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
    STATIC_URL_PATH,
)
from .runtime import PlantGardenConfigEntry

_LOGGER = logging.getLogger(__name__)


async def async_register_static_path(hass: HomeAssistant) -> None:
    """Serve the built frontend bundle. Must only be called once per HA run."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_PATH, str(FRONTEND_DIR), cache_headers=True)]
    )


def _bundle_fingerprint() -> str:
    """Return a short content hash of the bundle, used for cache busting."""
    try:
        data = (FRONTEND_DIR / FRONTEND_BUNDLE).read_bytes()
    except FileNotFoundError:
        _LOGGER.error(
            "Frontend bundle %s is missing, the panel will not load. "
            "Run 'npm run build' in the frontend directory",
            FRONTEND_DIR / FRONTEND_BUNDLE,
        )
        return "missing"
    return hashlib.sha256(data).hexdigest()[:12]


async def async_register_panel(hass: HomeAssistant, entry: PlantGardenConfigEntry) -> None:
    """Add the Plant Garden panel to the sidebar."""
    fingerprint = await hass.async_add_executor_job(_bundle_fingerprint)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT,
        sidebar_title=entry.title,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL_PATH}/{FRONTEND_BUNDLE}?v={fingerprint}",
        config={"entry_id": entry.entry_id},
        require_admin=False,
    )


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the Plant Garden panel from the sidebar."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
