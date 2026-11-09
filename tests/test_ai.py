"""The AI layer in a running garden: identification, suggestions, log, budget, flows."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

from homeassistant.components.media_source import async_browse_media, async_resolve_media
from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, issue_registry as ir
from homeassistant.setup import async_setup_component
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.ai.providers import anthropic, openai_compat
from custom_components.plant_garden.const import DOMAIN

from .images import make_image

PLANTNET = "https://my-api.plantnet.org/v2"
MESSAGES = f"{anthropic.BASE_URL}/messages"

ANSWER = {
    "candidates": [
        {
            "scientific_name": "Rosa canina",
            "common_name_de": "Hunds-Rose",
            "common_name_en": "Dog rose",
            "variety": None,
            "family": "Rosaceae",
            "confidence": 0.86,
            "reason": "Leaves and hips",
        }
    ],
    "size": {
        "height_cm": 150, "height_min_cm": 120, "height_max_cm": 180,
        "width_cm": 100, "width_min_cm": 80, "width_max_cm": 120,
        "confidence": 0.4, "basis": "watering can",
    },
    "age": {
        "age_months": 36, "min_months": 24, "max_months": 60,
        "stage": "mature", "confidence": 0.3,
    },
    "health": {"status": "healthy", "summary": "Looks healthy."},
    "care": {
        "category": "perennial", "water_need": "moderate", "light": "full_sun",
        "min_temperature_c": -20, "mature_crown_diameter_m": 2.5, "pruning": "spring",
        "confidence": 0.7,
    },
    "questions": ["Please add a photo of the flower."],
}  # fmt: skip


def claude_reply(text: str, tokens: int = 1000) -> dict[str, Any]:
    return {
        "model": "claude-opus-5-5",
        "stop_reason": "end_turn",
        "content": [{"type": "text", "text": text}],
        "usage": {"input_tokens": tokens, "output_tokens": 500, "cache_read_input_tokens": 100},
    }


@pytest.fixture
async def garden(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> tuple[MockConfigEntry, Any, Any]:
    """A garden with Claude and Pl@ntNet, a rose with one photo."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
        subentries_data=[
            ConfigSubentryData(
                data={
                    "kind": "anthropic",
                    "api_key": "sk-ant-api03-secret",
                    "model": "claude-opus-5-5",
                },
                subentry_type="ai",
                title="Claude (claude-opus-5-5)",
                unique_id=None,
            ),
            ConfigSubentryData(
                data={"kind": "plantnet", "api_key": "2b10plantnetkey"},
                subentry_type="ai",
                title="Pl@ntNet",
                unique_id=None,
            ),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    manager = entry.runtime_data.manager
    rose = await manager.async_create_plant({"name": "Rose", "category": "shrub"})
    photo = await manager.async_add_photo(rose.id, make_image(900, 700))
    aioclient_mock.post(
        f"{PLANTNET}/identify/all",
        json={
            "results": [
                {
                    "score": 0.8,
                    "species": {
                        "scientificNameWithoutAuthor": "Rosa canina",
                        "family": {"scientificNameWithoutAuthor": "Rosaceae"},
                    },
                }
            ],
            "remainingIdentificationRequests": 499,
        },
    )
    return entry, rose, photo


async def test_identify_and_take_over_suggestions(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any, Any],
) -> None:
    entry, rose, photo = garden
    aioclient_mock.post(MESSAGES, json=claude_reply(json.dumps(ANSWER)))
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "plant_garden/ai/status"})
    status = (await client.receive_json())["result"]
    assert status == {
        "available": True,
        "identify": "Claude (claude-opus-5-5)",
        "plantnet": True,
        "currency": "USD",
    }
    await client.send_json_auto_id({"type": "plant_garden/ai/estimate", "photos": 2})
    assert (await client.receive_json())["result"]["cost"] > 0

    await client.send_json_auto_id(
        {
            "type": "plant_garden/ai/identify",
            "plant_id": rose.id,
            "photos": [{"photo_id": photo.id, "organ": "leaf"}],
        }
    )
    result = (await client.receive_json())["result"]
    assert result["plantnet"]["remaining"] == 499
    assert result["model"] == "claude-opus-5-5"
    states = {s["key"]: s["state"] for s in result["suggestions"]}
    # the user's category stays; the AI's different one is only shown
    assert states == {
        "scientific_name": "new",
        "family": "new",
        "category": "differs",
        "water_need": "new",
        "light": "new",
        "min_temperature_c": "new",
        "care_prune": "new",
        "crown_diameter_m": "new",
        "size": "new",
        "age": "new",
    }
    # Pl@ntNet's candidates went into the prompt, the photo as a WebP (medium size)
    body = aioclient_mock.mock_calls[-1][2]
    prompt = body["messages"][0]["content"][-1]["text"]
    assert "Rosa canina (Rosaceae), Score 0.8" in prompt
    assert body["messages"][0]["content"][0]["source"]["media_type"] == "image/webp"
    assert "Bekannt" not in prompt  # English garden

    async def decide(key: str, accept: bool = True) -> dict[str, Any]:
        await client.send_json_auto_id(
            {"type": "plant_garden/ai/decide", "plant_id": rose.id, "key": key, "accept": accept}
        )
        return await client.receive_json()

    assert (await decide("scientific_name"))["success"]
    assert (await decide("size"))["success"]
    assert (await decide("age"))["success"]
    rejected = (await decide("water_need", accept=False))["result"]
    assert {s["key"]: s["state"] for s in rejected["suggestions"]}["water_need"] == "rejected"
    refused = await decide("category")
    assert refused["error"]["code"] == "ai_error"  # never replaces the user's value
    assert (await decide("nonsense"))["error"]["code"] == "ai_error"

    manager = entry.runtime_data.manager
    plant = manager.get_plant(rose.id)
    assert plant.scientific_name == "Rosa canina"
    assert plant.sources["scientific_name"].source.value == "ai"
    assert plant.sources["scientific_name"].confidence == 0.86
    assert plant.age is not None
    assert plant.age.age_months == 36
    assert plant.category.value == "shrub"
    [measurement] = await manager.async_list_measurements(rose.id)
    assert (measurement.height_cm, measurement.source.value) == (150, "ai")

    await client.send_json_auto_id({"type": "plant_garden/ai/identification", "plant_id": rose.id})
    assert (await client.receive_json())["result"]["accepted"] == ["scientific_name", "size", "age"]

    # every call is logged, with tokens and costs where known
    await client.send_json_auto_id({"type": "plant_garden/ai/usage/log"})
    rows = (await client.receive_json())["result"]["rows"]
    assert [(r["provider"], r["status"]) for r in rows] == [("anthropic", "ok"), ("plantnet", "ok")]
    claude = rows[0]
    # 1000 x $4 + 100 x $0.20 + 500 x $20 per million tokens
    assert claude["cost"] == pytest.approx(0.01402)
    assert claude["prompt"] is None  # debug log off
    await client.send_json_auto_id({"type": "plant_garden/ai/usage/summary"})
    summary = (await client.receive_json())["result"]
    assert summary["month"]["requests"] == 2
    assert summary["today"]["cost"] == pytest.approx(0.01402)
    assert {row["key"] for row in summary["by"]["feature"]} == {"identify"}
    assert summary["providers"][0]["key"] == "sk-…cret"  # never the key itself
    assert hass.states.get("sensor.garten_ai_requests_today").state == "2"
    cost = hass.states.get("sensor.garten_ai_costs_this_month")
    assert cost.attributes["unit_of_measurement"] == "USD"
    assert float(cost.state) == pytest.approx(0.014, abs=0.001)

    # a care hint becomes part of the plant's care profile, marked as from the AI
    await entry.runtime_data.ai.async_decide(rose.id, "care_prune", accept=True)
    plant = manager.get_plant(rose.id)
    assert plant.care_prune == "spring"
    assert plant.sources["care_prune"].source.value == "ai"

    # deleting the plant forgets its identification
    await manager.async_delete_plant(rose.id)
    assert entry.runtime_data.ai.identification(rose.id) is None


async def test_identify_after_upload(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any, Any],
) -> None:
    """Option on: a new photo of a plant without botanical name is identified."""
    entry, rose, _photo = garden
    manager = entry.runtime_data.manager
    aioclient_mock.post(MESSAGES, json=claude_reply(json.dumps(ANSWER)))
    await manager.async_add_photo(rose.id, make_image(600, 400))
    await hass.async_block_till_done()
    assert entry.runtime_data.ai.identification(rose.id) is None  # option is off

    hass.config_entries.async_update_entry(entry, options={"ai_auto_identify": True})
    photo = await manager.async_add_photo(rose.id, make_image(600, 400))
    await hass.async_block_till_done()
    record = entry.runtime_data.ai.identification(rose.id)
    assert record is not None
    assert record["photos"] == [photo.id]

    # known species: no further calls
    calls = aioclient_mock.call_count
    await manager.async_update_plant(rose.id, {"scientific_name": "Rosa canina"})
    await manager.async_add_photo(rose.id, make_image(600, 400))
    await hass.async_block_till_done()
    assert aioclient_mock.call_count == calls


async def test_budget_and_json_repair(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any, Any],
) -> None:
    entry, rose, photo = garden
    client = await hass_ws_client(hass)
    request = {
        "type": "plant_garden/ai/identify",
        "plant_id": rose.id,
        "photos": [{"photo_id": photo.id}],
    }
    # the first answer is not JSON: one repair retry, both calls logged
    with patch.object(
        anthropic.AnthropicProvider,
        "async_generate",
        side_effect=[
            await _response("Sorry, here it is: not json"),
            await _response(json.dumps(ANSWER)),
        ],
    ) as generate:
        await client.send_json_auto_id(request)
        assert (await client.receive_json())["success"]
    assert generate.call_count == 2
    log = await entry.runtime_data.manager.async_usage_log(limit=10)
    assert [r["status"] for r in log if r["provider"] == "anthropic"] == ["ok", "invalid_json"]

    # a tiny budget with stop: the next call is refused before it is made
    hass.config_entries.async_update_entry(
        entry, options={"ai_budget": 0.001, "ai_budget_stop": True, "usd_eur": 0.9}
    )
    await hass.async_block_till_done()
    await client.send_json_auto_id(request)
    assert (await client.receive_json())["error"]["code"] == "budget_exceeded"
    entry.runtime_data.ai._update_budget_issues(1.0)
    assert ir.async_get(hass).async_get_issue(DOMAIN, "budget_exceeded") is not None
    hass.config_entries.async_update_entry(entry, options={})
    entry.runtime_data.ai._update_budget_issues(1.0)
    assert ir.async_get(hass).async_get_issue(DOMAIN, "budget_exceeded") is None

    # provider errors are logged too and reported readably
    with patch.object(anthropic.AnthropicProvider, "async_generate", side_effect=_auth_error()):
        await client.send_json_auto_id(request)
        assert (await client.receive_json())["error"]["code"] == "ai_error"
    statuses = entry.runtime_data.ai.providers_info()
    assert statuses[0]["status"]["ok"] is False


async def _response(text: str) -> Any:
    from custom_components.plant_garden.ai.base import AIResponse, Usage  # noqa: PLC0415

    return AIResponse(
        text=text,
        data=json.loads(text) if text.startswith("{") else None,
        usage=Usage(input=10, output=10),
        model="claude-opus-5-5",
    )


def _auth_error() -> Exception:
    from custom_components.plant_garden.ai.base import AuthError  # noqa: PLC0415

    return AuthError("invalid x-api-key", status=401)


async def test_pricing_tech_and_test(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any, Any],
) -> None:
    entry, _, _ = garden
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "plant_garden/ai/pricing/set",
            "kind": "anthropic",
            "model": "claude-opus-5-5",
            "prices": {"input": 1, "output": 2},
        }
    )
    pricing = (await client.receive_json())["result"]
    assert pricing["prices"]["anthropic"]["claude-opus-5-5"] == {"input": 1, "output": 2}
    await client.send_json_auto_id(
        {
            "type": "plant_garden/ai/pricing/set",
            "kind": "anthropic",
            "model": "claude-opus-5-5",
            "prices": None,
        }
    )
    assert (await client.receive_json())["result"]["prices"]["anthropic"]["claude-opus-5-5"][
        "input"
    ] == 4
    await client.send_json_auto_id({"type": "plant_garden/ai/pricing/get"})
    assert (await client.receive_json())["result"]["as_of"] == "2026-11-08"

    aioclient_mock.get(f"{PLANTNET}/languages", json=[{"code": "de"}])
    net = next(s for s in entry.runtime_data.ai.providers_info() if s["kind"] == "plantnet")
    await client.send_json_auto_id({"type": "plant_garden/ai/test", "provider_id": net["id"]})
    assert (await client.receive_json())["result"]["ok"] is True
    await client.send_json_auto_id({"type": "plant_garden/ai/test", "provider_id": "nope"})
    assert (await client.receive_json())["error"]["code"] == "not_found"

    await client.send_json_auto_id({"type": "plant_garden/tech/info"})
    info = (await client.receive_json())["result"]
    assert info["plants"] == 1
    assert info["storage"]["photos"] > 0
    assert info["entities"] > 5
    assert all("secret" not in json.dumps(p) for p in info["providers"])


async def test_media_source_and_action(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any, Any],
) -> None:
    entry, rose, photo = garden
    assert await async_setup_component(hass, "media_source", {})
    media = await async_resolve_media(hass, f"media-source://plant_garden/{photo.id}", None)
    assert media.mime_type == "image/webp"
    assert media.path is not None
    assert media.path.name.endswith(".medium.webp")
    root = await async_browse_media(hass, "media-source://plant_garden")
    [child] = root.children
    assert child.title == "Rose"
    photos = await async_browse_media(hass, f"media-source://plant_garden/plant/{rose.id}")
    assert [c.identifier for c in photos.children] == [photo.id]

    aioclient_mock.post(MESSAGES, json=claude_reply(json.dumps(ANSWER)))
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, f"plant_{rose.id}"), entry.entry_id
    )
    assert device is not None
    result = await hass.services.async_call(
        DOMAIN,
        "identify_plant",
        {"device_id": device.id, "photos": 1},
        blocking=True,
        return_response=True,
    )
    assert any(s["key"] == "scientific_name" for s in result["suggestions"])  # type: ignore[union-attr]
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, status=400, json={"error": {"message": "bad image"}})
    aioclient_mock.post(f"{PLANTNET}/identify/all", status=404, json={})
    with pytest.raises(HomeAssistantError, match="bad image"):
        await hass.services.async_call(
            DOMAIN, "identify_plant", {"device_id": device.id}, blocking=True, return_response=True
        )


# ---------------------------------------------------------------- subentry flow
async def _flow(hass: HomeAssistant, entry: MockConfigEntry, *steps: dict[str, Any]) -> Any:
    result = await hass.config_entries.subentries.async_init(
        (entry.entry_id, "ai"), context={"source": "user"}
    )
    for step in steps:
        result = await hass.config_entries.subentries.async_configure(result["flow_id"], step)
    return result


async def test_add_providers(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, aioclient_mock: AiohttpClientMocker
) -> None:
    # Claude: a wrong key, then the right one and a model from the list
    aioclient_mock.get(
        f"{anthropic.BASE_URL}/models", status=401, json={"error": {"message": "invalid"}}
    )
    result = await _flow(hass, loaded_entry, {"kind": "anthropic"}, {"api_key": "bad"})
    assert result["errors"] == {"base": "invalid_auth"}
    aioclient_mock.clear_requests()
    aioclient_mock.get(
        f"{anthropic.BASE_URL}/models",
        json={"data": [{"id": "claude-opus-5-5"}, {"id": "claude-haiku-5-5"}]},
    )
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"api_key": "good"}
    )
    assert result["step_id"] == "model"
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"model": "claude-opus-5-5"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Claude (claude-opus-5-5)"

    # OpenAI-compatible: a local server without key, then a bad custom URL
    aioclient_mock.get("http://localhost:11434/v1/models", json={"data": [{"id": "llava"}]})
    result = await _flow(
        hass, loaded_entry, {"kind": "openai_compatible"}, {"preset": "ollama"}, {"model": "llava"}
    )
    assert result["data"] == {
        "kind": "openai_compatible",
        "preset": "ollama",
        "base_url": "http://localhost:11434/v1",
        "model": "llava",
    }
    result = await _flow(
        hass,
        loaded_entry,
        {"kind": "openai_compatible"},
        {"preset": "custom", "base_url": "ftp://x"},
    )
    assert result["errors"] == {"base_url": "invalid_url"}
    aioclient_mock.get(f"{openai_compat.PRESETS['openai']}/models", exc=TimeoutError())
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"preset": "openai", "api_key": "sk"}
    )
    assert result["errors"] == {"base": "cannot_connect"}

    # Pl@ntNet and HA AI Task
    aioclient_mock.get(f"{PLANTNET}/languages", json=[])
    result = await _flow(hass, loaded_entry, {"kind": "plantnet"}, {"api_key": "2b10"})
    assert result["title"] == "Pl@ntNet"
    result = await _flow(hass, loaded_entry, {"kind": "ha_ai_task"}, {"entity_id": "ai_task.x"})
    assert result["errors"] == {"base": "cannot_connect"}
    hass.states.async_set("ai_task.x", "unknown")
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"entity_id": "ai_task.x"}
    )
    assert result["title"] == "HA AI Task (ai_task.x)"

    # a new key for Claude
    claude = next(s for s in loaded_entry.subentries.values() if s.data["kind"] == "anthropic")
    result = await hass.config_entries.subentries.async_init(
        (loaded_entry.entry_id, "ai"),
        context={"source": "reconfigure", "subentry_id": claude.subentry_id},
    )
    assert result["step_id"] == "key"
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"api_key": "new"}
    )
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"model": "claude-haiku-5-5"}
    )
    assert result["reason"] == "reconfigure_successful"
    assert loaded_entry.subentries[claude.subentry_id].data["api_key"] == "new"

    # the options offer the language models for the features
    result = await hass.config_entries.options.async_init(loaded_entry.entry_id)
    keys = {str(key) for key in result["data_schema"].schema}
    assert {"ai_identify", "ai_text", "ai_budget"} <= keys
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "max_runtime_hours": 6,
            "ai_identify": claude.subentry_id,
            "ai_budget": 5,
            "ai_budget_stop": True,
            "usd_eur": 0.92,
            "ai_debug": True,
            "ai_retention_days": 30,
        },
    )
    assert loaded_entry.options["ai_identify"] == claude.subentry_id
    assert loaded_entry.runtime_data.ai.currency() == "EUR"
