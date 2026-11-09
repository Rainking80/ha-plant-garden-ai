"""Diagnostics, backup and repair issues (spec 5.2, M8)."""

from __future__ import annotations

import json
from unittest.mock import patch

from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.plant_garden import backup
from custom_components.plant_garden.ai.providers import anthropic
from custom_components.plant_garden.const import DOMAIN
from custom_components.plant_garden.diagnostics import async_get_config_entry_diagnostics

SECRET = "sk-ant-api03-very-secret-key-1234"


async def _garden(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
        options={"ai_budget": 5},
        subentries_data=[
            ConfigSubentryData(
                data={"kind": "anthropic", "api_key": SECRET, "model": "claude-opus-5-5"},
                subentry_type="ai",
                title="Claude",
                unique_id=None,
            ),
            ConfigSubentryData(
                data={"source": "open_meteo", "latitude": 48.14, "longitude": 11.58},
                subentry_type="weather",
                title="Open-Meteo",
                unique_id=None,
            ),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_diagnostics_hide_keys_places_and_entities(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    aioclient_mock.get("https://api.open-meteo.com/v1/forecast", json={})
    entry = await _garden(hass)
    manager = entry.runtime_data.manager
    await manager.async_create_plant({"name": "Rose", "category": "shrub"})
    await manager.async_save_shape(
        {
            "kind": "zone",
            "label": "Rasen",
            "geometry": {"type": "circle", "cx": 0, "cy": 0, "r": 3},
            "irrigation": {"entity_id": "switch.secret_valve", "emitter": "spray"},
        }
    )
    result = await async_get_config_entry_diagnostics(hass, entry)
    text = json.dumps(result)
    assert SECRET not in text
    assert "1234" not in text
    assert "48.14" not in text
    assert "switch.secret_valve" not in text
    assert result["garden"]["plants"] == 1
    assert result["garden"]["shapes"] == {"zone": 1}
    assert result["irrigation"] == {"zones": 1, "running": 0}
    assert result["options"]["ai_budget"] == 5
    kinds = {sub["type"]: sub["data"] for sub in result["subentries"]}
    assert kinds["ai"] == {
        "kind": "anthropic",
        "api_key": "**REDACTED**",
        "model": "claude-opus-5-5",
    }
    assert kinds["weather"]["latitude"] == "**REDACTED**"
    assert result["ai"]["providers"] == [
        {"kind": "anthropic", "model": "claude-opus-5-5", "status": None}
    ]


async def test_backup_checkpoints_the_database(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    with patch.object(
        loaded_entry.runtime_data.manager, "async_checkpoint", autospec=True
    ) as checkpoint:
        await backup.async_pre_backup(hass)
        await backup.async_post_backup(hass)
    checkpoint.assert_awaited_once()
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    await backup.async_pre_backup(hass)  # not loaded: nothing to do


async def test_rejected_key_raises_a_repair_issue(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    aioclient_mock.get("https://api.open-meteo.com/v1/forecast", json={})
    entry = await _garden(hass)
    ai = entry.runtime_data.ai
    [subentry] = [s for s in entry.subentries.values() if s.subentry_type == "ai"]
    issues = ir.async_get(hass)
    aioclient_mock.get(
        f"{anthropic.BASE_URL}/models", status=401, json={"error": {"message": "invalid x-api-key"}}
    )
    status = await ai.async_test(subentry.subentry_id)
    assert status["ok"] is False
    issue = issues.async_get_issue(DOMAIN, f"ai_auth_{subentry.subentry_id}")
    assert issue is not None
    assert issue.translation_placeholders == {"provider": "Claude"}

    aioclient_mock.clear_requests()
    aioclient_mock.get(f"{anthropic.BASE_URL}/models", json={"data": []})
    assert (await ai.async_test(subentry.subentry_id))["ok"] is True
    assert issues.async_get_issue(DOMAIN, f"ai_auth_{subentry.subentry_id}") is None


async def test_zone_with_a_missing_entity(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    manager = loaded_entry.runtime_data.manager
    issues = ir.async_get(hass)
    zone = await manager.async_save_shape(
        {
            "kind": "zone",
            "label": "Beet",
            "geometry": {"type": "circle", "cx": 0, "cy": 0, "r": 3},
            "irrigation": {"entity_id": "valve.gone", "timer_entity_id": "timer.gone"},
        }
    )
    await hass.async_block_till_done()
    issue = issues.async_get_issue(DOMAIN, f"missing_entity_{zone.id}")
    assert issue is not None
    assert issue.translation_placeholders == {"zone": "Beet", "entities": "valve.gone, timer.gone"}

    hass.states.async_set("valve.garden", "closed")
    await manager.async_save_shape({**zone.as_dict(), "irrigation": {"entity_id": "valve.garden"}})
    await hass.async_block_till_done()
    assert issues.async_get_issue(DOMAIN, f"missing_entity_{zone.id}") is None
