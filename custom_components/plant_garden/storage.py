"""JSON storage (HA Store) for the garden's domain data."""

from __future__ import annotations

from typing import Any, TypedDict

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

STORAGE_KEY = "plant_garden.garden"
STORAGE_VERSION = 1
STORAGE_MINOR_VERSION = 1


class GardenData(TypedDict):
    """Top-level layout of the stored JSON."""

    plants: list[dict[str, Any]]


def empty_garden_data() -> GardenData:
    return {"plants": []}


class GardenStore(Store[GardenData]):
    """Store with a hook for future schema migrations."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY,
            minor_version=STORAGE_MINOR_VERSION,
            atomic_writes=True,
        )

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> GardenData:
        """Upgrade stored data. Add steps here when STORAGE_(MINOR_)VERSION changes."""
        data: dict[str, Any] = dict(old_data)
        data.setdefault("plants", [])
        return data  # type: ignore[return-value]
