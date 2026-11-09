"""Diagnostics: what helps with a bug report, without keys, coordinates or file paths."""

from __future__ import annotations

from collections import Counter
from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from .const import CONF_AI_BUDGET, CONF_AI_DEBUG
from .database import SCHEMA_VERSION
from .runtime import PlantGardenConfigEntry

# keys whose values never appear in diagnostics (spec 9)
TO_REDACT = {
    "api_key",
    "key",
    "latitude",
    "longitude",
    "lat",
    "lon",
    "origin",
    "path",
    "url",
    "base_url",
    "entity_id",
    "timer_entity_id",
    "meter_entity_id",
    "prompt",
    "response",
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: PlantGardenConfigEntry
) -> dict[str, Any]:
    data = entry.runtime_data
    manager = data.manager
    water = data.water.data
    usage_errors = [
        {k: row[k] for k in ("ts", "feature", "provider", "model", "status", "error")}
        for row in await manager.async_usage_log(limit=10, status="error")
    ]
    subentries = [
        {
            "type": sub.subentry_type,
            "title": sub.title,
            "data": async_redact_data(dict(sub.data), TO_REDACT),
        }
        for sub in entry.subentries.values()
    ]
    zones = data.irrigation.summary()["zones"]
    return {
        "version": data.version,
        "database_schema": SCHEMA_VERSION,
        "options": {
            **async_redact_data(dict(entry.options), TO_REDACT),
            CONF_AI_BUDGET: entry.options.get(CONF_AI_BUDGET),
            CONF_AI_DEBUG: entry.options.get(CONF_AI_DEBUG, False),
        },
        "subentries": subentries,
        "garden": {
            "plants": len(manager.plants),
            "categories": dict(Counter(p.category.value for p in manager.plants)),
            "placed": sum(1 for p in manager.plants if p.position is not None),
            "shapes": dict(Counter(s.kind.value for s in manager.shapes())),
            "markers": len(manager.layout.markers),
            "background": (manager.layout.background or {}).get("type"),
        },
        "storage": await manager.async_storage_stats(),
        "irrigation": {
            "zones": len(manager.zones()),
            "running": sum(1 for z in zones.values() if z.get("running_since")),
        },
        "weather": {
            "updated": water.updated.isoformat() if water and water.updated else None,
            "sources": [
                {"source": s.source, "ok": s.ok, "error": s.error, "days": s.days}
                for s in (water.sources if water else [])
            ],
            "plants_with_balance": len(water.plants) if water else 0,
            "last_error": str(data.water.last_exception) if data.water.last_exception else None,
        },
        "ai": {
            "stats": data.ai.stats,
            "providers": [
                {"kind": p["kind"], "model": p["model"], "status": p["status"]}
                for p in data.ai.providers_info()
            ],
            "recent_errors": usage_errors,
        },
        "care": data.care.garden_stats,
    }
