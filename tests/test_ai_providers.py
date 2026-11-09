"""AI providers: request bodies, usage mapping from recorded answers, retries, prices."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import pytest
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.plant_garden.ai import pricing
from custom_components.plant_garden.ai.base import (
    AIError,
    AIRequest,
    AuthError,
    Feature,
    Image,
    Message,
    Usage,
    parse_json,
)
from custom_components.plant_garden.ai.http import async_request
from custom_components.plant_garden.ai.providers import anthropic, gemini, openai_compat
from custom_components.plant_garden.ai.providers.ha_ai_task import AITaskProvider
from custom_components.plant_garden.ai.providers.plantnet import PlantNetProvider
from custom_components.plant_garden.ai.schemas import IDENTIFY_SCHEMA, clean_identification

PHOTO = Image(data=b"\xff\xd8jpeg", mime_type="image/jpeg", photo_id="P1", organ="leaf")


def _request(schema: bool = True) -> AIRequest:
    return AIRequest(
        feature=Feature.IDENTIFY,
        system="You are a gardener.",
        messages=[Message(role="user", text="What is this?", images=[PHOTO])],
        json_schema=IDENTIFY_SCHEMA if schema else None,
        max_output_tokens=1000,
    )


@pytest.fixture(autouse=True)
def no_sleep() -> Any:
    """Retries wait without slowing the tests."""
    with patch("custom_components.plant_garden.ai.http.asyncio.sleep"):
        yield


# ---------------------------------------------------------------- usage mapping (spec 6.3)
def test_anthropic_usage_counts_nothing_twice() -> None:
    usage = anthropic.map_usage(
        {
            "input_tokens": 120,
            "cache_creation_input_tokens": 2048,
            "cache_read_input_tokens": 0,
            "output_tokens": 310,
        },
        images=1,
    )
    assert usage == Usage(input=120, cached_input=0, cache_write=2048, output=310, images=1)


def test_openai_usage_splits_cached_and_reasoning() -> None:
    usage = openai_compat.map_usage(
        {
            "prompt_tokens": 2006,
            "completion_tokens": 500,
            "prompt_tokens_details": {"cached_tokens": 1920, "cache_write_tokens": 0},
            "completion_tokens_details": {"reasoning_tokens": 320},
        },
        images=2,
    )
    # prompt_tokens includes the cached part; completion_tokens includes reasoning
    assert usage == Usage(input=86, cached_input=1920, output=500, reasoning=320, images=2)
    assert openai_compat.map_usage({}, 0) == Usage()


def test_gemini_usage_bills_thoughts_as_output() -> None:
    usage = gemini.map_usage(
        {
            "promptTokenCount": 1500,
            "cachedContentTokenCount": 1000,
            "candidatesTokenCount": 200,
            "thoughtsTokenCount": 300,
            "totalTokenCount": 2000,
        },
        images=1,
    )
    assert usage == Usage(input=500, cached_input=1000, output=500, reasoning=300, images=1)


# ---------------------------------------------------------------- providers
async def test_anthropic_request_and_answer(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    aioclient_mock.post(
        f"{anthropic.BASE_URL}/messages",
        json={
            "model": "claude-opus-5-5",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": '{"questions": []}'}],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        },
        headers={"request-id": "req_1"},
    )
    provider = anthropic.AnthropicProvider(async_get_clientsession(hass), "sk-ant-x", "")
    response = await provider.async_generate(_request())
    assert response.data == {"questions": []}
    assert (response.model, response.request_id, response.usage.images) == (
        "claude-opus-5-5",
        "req_1",
        1,
    )
    _, _, body, headers = aioclient_mock.mock_calls[0]
    assert headers["anthropic-version"] == "2026-10-21"
    assert "temperature" not in body
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["messages"][0]["content"][0]["source"]["media_type"] == "image/jpeg"

    for stop in ("refusal", "max_tokens"):
        aioclient_mock.clear_requests()
        aioclient_mock.post(
            f"{anthropic.BASE_URL}/messages",
            json={"stop_reason": stop, "content": [], "usage": {"output_tokens": 7}},
        )
        with pytest.raises(AIError) as err:
            await provider.async_generate(_request())
        assert err.value.usage is not None
        assert err.value.usage.output == 7

    aioclient_mock.clear_requests()
    aioclient_mock.get(
        f"{anthropic.BASE_URL}/models",
        json={"data": [{"id": "claude-opus-5-5", "display_name": "Claude Opus 5.5"}]},
    )
    [model] = await provider.async_list_models()
    assert model.name == "Claude Opus 5.5"
    await provider.async_validate()


async def test_openai_compatible_request_and_answer(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    base = openai_compat.PRESETS["openrouter"]
    aioclient_mock.post(
        f"{base}/chat/completions",
        json={
            "id": "gen-1",
            "model": "openai/gpt-6-luna",
            "choices": [{"finish_reason": "stop", "message": {"content": '{"a": 1}'}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 10, "cost": 0.0042},
        },
    )
    provider = openai_compat.OpenAICompatibleProvider(
        async_get_clientsession(hass),
        base_url=base,
        api_key="sk-or-x",
        model="openai/gpt-6-luna",
        preset="openrouter",
    )
    response = await provider.async_generate(_request())
    assert (response.data, response.provider_cost, response.request_id) == (
        {"a": 1},
        0.0042,
        "gen-1",
    )
    _, _, body, headers = aioclient_mock.mock_calls[0]
    assert headers["authorization"] == "Bearer sk-or-x"
    assert body["max_completion_tokens"] == 1000
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["messages"][1]["content"][0]["image_url"]["url"].startswith(
        "data:image/jpeg;base64,"
    )

    # local servers: max_tokens, no key, plain text
    aioclient_mock.clear_requests()
    local = openai_compat.OpenAICompatibleProvider(
        async_get_clientsession(hass),
        base_url="http://ollama.local:11434/v1/",
        api_key=None,
        model="llava",
        preset="ollama",
    )
    aioclient_mock.post(
        "http://ollama.local:11434/v1/chat/completions",
        json={"choices": [{"finish_reason": "length", "message": {"content": "…"}}]},
    )
    with pytest.raises(AIError, match="cut off"):
        await local.async_generate(_request(schema=False))
    _, _, body, headers = aioclient_mock.mock_calls[0]
    assert "authorization" not in headers
    assert body["max_tokens"] == 1000
    aioclient_mock.clear_requests()
    aioclient_mock.post(
        "http://ollama.local:11434/v1/chat/completions",
        json={"choices": [{"message": {"refusal": "no"}}]},
    )
    with pytest.raises(AIError, match="declined"):
        await local.async_generate(_request(schema=False))
    aioclient_mock.get(
        "http://ollama.local:11434/v1/models",
        json={"data": [{"id": "llava", "architecture": {"input_modalities": ["text", "image"]}}]},
    )
    [model] = await local.async_list_models()
    assert model.vision is True


async def test_gemini_request_and_answer(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    provider = gemini.GeminiProvider(async_get_clientsession(hass), "AIza-x", "")
    url = f"{gemini.BASE_URL}/models/{gemini.DEFAULT_MODEL}:generateContent"
    aioclient_mock.post(
        url,
        json={
            "responseId": "r1",
            "modelVersion": "gemini-3.8-flash-001",
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": "thinking…", "thought": True}, {"text": "{}"}]},
                }
            ],
            "usageMetadata": {"promptTokenCount": 50, "candidatesTokenCount": 2},
        },
    )
    response = await provider.async_generate(_request())
    assert (response.text, response.model) == ("{}", "gemini-3.8-flash-001")
    _, _, body, headers = aioclient_mock.mock_calls[0]
    assert headers["x-goog-api-key"] == "AIza-x"
    assert body["generationConfig"]["responseFormat"]["text"]["mimeType"] == "APPLICATION_JSON"
    assert body["contents"][0]["parts"][0]["inline_data"]["mime_type"] == "image/jpeg"
    for reason, message in (("MAX_TOKENS", "cut off"), ("SAFETY", "declined")):
        aioclient_mock.clear_requests()
        aioclient_mock.post(url, json={"candidates": [{"finishReason": reason}]})
        with pytest.raises(AIError, match=message):
            await provider.async_generate(_request())
    aioclient_mock.get(
        f"{gemini.BASE_URL}/models",
        json={
            "models": [
                {
                    "name": "models/gemini-3.8-flash",
                    "supportedGenerationMethods": ["generateContent"],
                },
                {"name": "models/embedding", "supportedGenerationMethods": ["embedContent"]},
            ]
        },
    )
    assert [m.id for m in await provider.async_list_models()] == ["gemini-3.8-flash"]


async def test_plantnet(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    provider = PlantNetProvider(async_get_clientsession(hass), "2b10x")
    url = "https://my-api.plantnet.org/v2/identify/all"
    aioclient_mock.post(
        url,
        json={
            "bestMatch": "Rosa canina L.",
            "results": [
                {
                    "score": 0.83,
                    "species": {
                        "scientificNameWithoutAuthor": "Rosa canina",
                        "scientificNameAuthorship": "L.",
                        "genus": {"scientificNameWithoutAuthor": "Rosa"},
                        "family": {"scientificNameWithoutAuthor": "Rosaceae"},
                        "commonNames": ["Hunds-Rose"],
                    },
                },
                {"score": 0.1, "species": {}},
            ],
            "remainingIdentificationRequests": 498,
        },
    )
    result = await provider.async_identify([PHOTO], "de")
    [candidate] = result.candidates
    assert (candidate.scientific_name, candidate.family, candidate.score) == (
        "Rosa canina",
        "Rosaceae",
        0.83,
    )
    assert result.remaining == 498
    with pytest.raises(AIError):
        await provider.async_identify([], "de")
    with pytest.raises(AIError, match="JPEG"):
        await provider.async_identify([Image(data=b"", mime_type="image/webp")], "en")
    aioclient_mock.clear_requests()
    aioclient_mock.post(url, status=404, json={"message": "Species not found"})
    assert (await provider.async_identify([PHOTO], "en")).candidates == []
    aioclient_mock.clear_requests()
    aioclient_mock.post(url, status=500)
    with pytest.raises(AIError):
        await provider.async_identify([PHOTO], "en")
    assert len(aioclient_mock.mock_calls) == 1  # no retry: every request costs a credit
    aioclient_mock.get("https://my-api.plantnet.org/v2/languages", status=401, json={})
    with pytest.raises(AuthError):
        await provider.async_validate()


async def test_ai_task_provider(hass: HomeAssistant) -> None:
    calls: list[ServiceCall] = []

    async def generate(call: ServiceCall) -> dict[str, Any]:
        calls.append(call)
        return {"conversation_id": "c", "data": {"result": {"questions": ["Blüte?"]}}}

    hass.services.async_register(
        "ai_task", "generate_data", generate, supports_response=SupportsResponse.ONLY
    )
    hass.states.async_set("ai_task.openai", "unknown", {"friendly_name": "OpenAI"})
    provider = AITaskProvider(hass, "ai_task.openai")
    await provider.async_validate()
    assert [m.name for m in await provider.async_list_models()] == ["OpenAI"]
    response = await provider.async_generate(_request())
    assert response.data == {"questions": ["Blüte?"]}
    assert response.usage == Usage(images=1)  # no token data from AI Task
    data = calls[0].data
    assert data["attachments"] == [
        {"media_content_id": "media-source://plant_garden/P1", "media_content_type": "image/jpeg"}
    ]
    assert "result" in data["structure"]
    with pytest.raises(AIError):
        await AITaskProvider(hass, "ai_task.missing").async_validate()

    async def plain(call: ServiceCall) -> dict[str, Any]:
        return {"conversation_id": "c", "data": 'Sure: {"x": 2}'}

    hass.services.async_register(
        "ai_task", "generate_data", plain, supports_response=SupportsResponse.ONLY
    )
    assert (await provider.async_generate(_request())).data == {"x": 2}
    hass.services.async_remove("ai_task", "generate_data")
    with pytest.raises(AIError):
        await provider.async_generate(_request())


# ---------------------------------------------------------------- HTTP helper
async def test_retries_and_errors(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    session = async_get_clientsession(hass)
    url = "https://ai.example/v1/x"
    aioclient_mock.post(
        url, status=429, headers={"Retry-After": "2"}, json={"error": {"message": "slow down"}}
    )
    with pytest.raises(AIError, match="slow down") as err:
        await async_request(session, "POST", url, json={})
    assert err.value.retryable
    assert len(aioclient_mock.mock_calls) == 3
    for status, kind in ((401, AuthError), (400, AIError)):
        aioclient_mock.clear_requests()
        aioclient_mock.post(url, status=status, json={"error": "nope"})
        with pytest.raises(kind):
            await async_request(session, "POST", url, json={})
        assert len(aioclient_mock.mock_calls) == 1  # no retry for client errors
    aioclient_mock.clear_requests()
    aioclient_mock.post(url, status=503, text="<html>")
    with pytest.raises(AIError, match="HTTP 503"):
        await async_request(session, "POST", url, json={})
    aioclient_mock.clear_requests()
    aioclient_mock.post(url, exc=TimeoutError())
    with pytest.raises(AIError, match="not reachable"):
        await async_request(session, "POST", url, json={})
    aioclient_mock.clear_requests()
    aioclient_mock.post(url, status=500, json={"message": "boom"})
    with pytest.raises(AIError, match="boom"):
        await async_request(session, "POST", url, json={}, retries=0)


# ---------------------------------------------------------------- prices, JSON
def test_prices_and_costs() -> None:
    defaults = pricing.load_defaults()
    assert defaults["_as_of"] == "2026-11-08"
    prices = pricing.merged_prices(defaults, {"openai_compatible": {"llava": {"input": 0}}})
    opus = pricing.price_for(prices, "anthropic", "claude-opus-5-5")
    assert opus == {"input": 4.0, "cached_input": 0.2, "cache_write": 5.0, "output": 20.0}
    # dated or tagged ids find their base model
    assert pricing.price_for(prices, "openai_compatible", "gpt-6-luna-2026-10-01") is not None
    assert pricing.price_for(prices, "openai_compatible", "llava:13b") == {"input": 0}
    assert pricing.price_for(prices, "gemini", "unknown-model") is None
    usage = Usage(input=1_000_000, cached_input=1_000_000, cache_write=1_000_000, output=1_000_000)
    assert pricing.cost_of(usage, opus) == pytest.approx(4 + 0.2 + 5 + 20)
    assert pricing.cost_of(Usage(images=2), {"per_image": 0.01, "per_request": 0.02}) == 0.04
    assert pricing.cost_of(usage, None) is None
    assert pricing.estimate_tokens("x" * 400, 2) == 100 + 3200


def test_tolerant_json() -> None:
    assert parse_json('Here you go:\n```json\n{"a": [1]}\n```') == {"a": [1]}
    assert parse_json("no json") is None
    assert parse_json("[1, 2]") is None
    assert parse_json("{broken") is None
    cleaned = clean_identification(
        {
            "candidates": [
                {"scientific_name": " Rosa canina ", "confidence": 1.7, "family": 3},
                {"scientific_name": ""},
                "nonsense",
            ],
            "size": {"height_cm": "tall", "width_cm": 80, "confidence": 0.4},
            "age": {"age_months": -3, "max_months": 40},
            "health": {"status": "dying", "summary": "ok"},
            "care": {"category": "shrub", "water_need": "lots", "min_temperature_c": -20},
            "questions": ["Blüte?", 5, ""],
        }
    )
    assert cleaned["candidates"] == [
        {
            "scientific_name": "Rosa canina",
            "common_name_de": None,
            "common_name_en": None,
            "variety": None,
            "family": None,
            "confidence": 1.0,
            "reason": "",
        }
    ]
    assert (cleaned["size"]["height_cm"], cleaned["size"]["width_cm"]) == (None, 80)
    assert (cleaned["age"]["age_months"], cleaned["age"]["max_months"]) == (None, 40)
    assert cleaned["health"]["status"] == "unknown"
    assert (cleaned["care"]["category"], cleaned["care"]["water_need"]) == ("shrub", None)
    assert cleaned["questions"] == ["Blüte?"]
    assert clean_identification({})["candidates"] == []


def test_identify_schema_is_strict_everywhere() -> None:
    def check(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for key in ("minimum", "maximum", "minLength", "maxLength"):
                assert key not in node
            for value in node.values():
                check(value)
        elif isinstance(node, list):
            for value in node:
                check(value)

    check(IDENTIFY_SCHEMA)


async def test_gemini_rejects_a_wrong_key_with_400(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Google answers a wrong key with 400 API_KEY_INVALID: that is a key problem, not the net."""
    aioclient_mock.get(
        f"{gemini.BASE_URL}/models",
        status=400,
        json={
            "error": {
                "code": 400,
                "message": "API key not valid. Please pass a valid API key.",
                "status": "INVALID_ARGUMENT",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                        "reason": "API_KEY_INVALID",
                    }
                ],
            }
        },
    )
    provider = gemini.GeminiProvider(async_get_clientsession(hass), "AIza-wrong", "")
    with pytest.raises(AuthError, match="API key not valid"):
        await provider.async_validate()


def test_schemas_stay_within_claude_limits() -> None:
    """Claude: no enum inside a type array, at most 16 union fields, all fields required."""
    from custom_components.plant_garden.ai.schemas import (  # noqa: PLC0415
        DIAGNOSE_SCHEMA,
        IDENTIFY_SCHEMA,
        RESEARCH_SCHEMA,
        TIPS_SCHEMA,
        union_count,
    )

    def walk(node: Any) -> list[dict[str, Any]]:
        if isinstance(node, list):
            return [found for item in node for found in walk(item)]
        if not isinstance(node, dict):
            return []
        return [node, *(found for value in node.values() for found in walk(value))]

    for schema in (IDENTIFY_SCHEMA, DIAGNOSE_SCHEMA, TIPS_SCHEMA, RESEARCH_SCHEMA):
        assert union_count(schema) <= 16
        for node in walk(schema):
            assert not isinstance(node.get("type"), list), node  # no type arrays at all
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
    # the answer format "empty or 0 = unknown" is cleaned to None
    cleaned = clean_identification(
        {
            "candidates": [{"scientific_name": "Fagus sylvatica", "variety": "", "family": ""}],
            "size": {"height_cm": 0, "width_cm": 180, "basis": ""},
            "care": {"category": "", "light": "partial_shade", "mature_crown_diameter_m": 0},
        }
    )
    assert cleaned["candidates"][0]["variety"] is None
    assert cleaned["size"]["height_cm"] is None
    assert cleaned["size"]["width_cm"] == 180
    assert cleaned["care"]["category"] is None
    assert cleaned["care"]["light"] == "partial_shade"
    assert cleaned["care"]["mature_crown_diameter_m"] is None
