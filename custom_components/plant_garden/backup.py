"""Backup platform: write the database's WAL and pending Store data before a backup."""

from __future__ import annotations

from homeassistant.core import HomeAssistant

from .runtime import get_manager


async def async_pre_backup(hass: HomeAssistant) -> None:
    """Checkpoint SQLite so the backup holds a consistent plant_garden.db."""
    manager = get_manager(hass)
    if manager is not None:
        await manager.async_checkpoint()


async def async_post_backup(hass: HomeAssistant) -> None:
    """Nothing to undo: the checkpoint does not stop writing."""
