"""JSON storage (HA Store) for the garden's domain data."""

from __future__ import annotations

from typing import Any, TypedDict

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

STORAGE_KEY = "plant_garden.garden"
STORAGE_VERSION = 1
# 1.1 plants; 1.2 adds the layout (origin and shapes); 1.3 background and markers
STORAGE_MINOR_VERSION = 3


class GardenData(TypedDict):
    """Top-level layout of the stored JSON."""

    plants: list[dict[str, Any]]
    layout: dict[str, Any]


def empty_garden_data() -> GardenData:
    return {
        "plants": [],
        "layout": {"origin": None, "shapes": [], "background": None, "markers": []},
    }


class GardenStore(Store[GardenData]):
    """Store with schema migrations."""

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
        """Upgrade stored data step by step. Add a step when the version changes."""
        data: dict[str, Any] = dict(old_data)
        data.setdefault("plants", [])
        if old_major_version == 1 and old_minor_version < 2:
            data.setdefault("layout", {"origin": None, "shapes": []})
        if old_major_version == 1 and old_minor_version < 3:
            layout = dict(data["layout"])
            layout.setdefault("background", None)
            layout.setdefault("markers", [])
            data["layout"] = layout
        return data  # type: ignore[return-value]
