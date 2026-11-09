"""The assistant with a (mocked) Claude: diagnosis, tips, chat with streaming, weekly check."""

from __future__ import annotations

from datetime import timedelta
import json
from typing import Any

from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.ai import context as context_builder
from custom_components.plant_garden.ai.base import AIError, AIRequest, AuthError, Feature, Message
from custom_components.plant_garden.ai.http import async_stream
from custom_components.plant_garden.ai.providers import anthropic, gemini, openai_compat
from custom_components.plant_garden.ai.schemas import clean_diagnosis, clean_tips
from custom_components.plant_garden.const import DOMAIN

from .images import make_image

MESSAGES = f"{anthropic.BASE_URL}/messages"

DIAGNOSIS = {
    "summary": "Wahrscheinlich Trockenstress.",
    "health": "watch",
    "symptoms": ["Blätter hängen", "Ränder braun"],
    "causes": [
        {"name": "Spinnmilben", "type": "pest", "confidence": 0.2, "evidence": "feine Punkte"},
        {"name": "Trockenheit", "type": "water", "confidence": 0.7, "evidence": "Defizit 30 mm"},
    ],
    "actions": [{"text": "Morgens durchdringend gießen", "urgency": "now", "warning": None}],
    "monitoring": ["Blätter in 3 Tagen ansehen"],
    "missing_info": ["Wie oft wird gegossen?"],
    "follow_up_days": 7,
}

TIPS = {
    "tips": [
        {
            "title": "Rückschnitt",
            "text": "Jetzt verblühte Triebe schneiden.",
            "plant": "p1",
            "task": {
                "kind": "prune",
                "title": "Verblühtes schneiden",
                "due_in_days": 3,
                "repeat_every": None,
                "repeat_unit": None,
            },
        },
        {"title": "Mulch", "text": "Mulch hält Feuchte.", "plant": None, "task": None},
    ],
    "questions": [{"plant": "p1", "field": "soil_type", "question": "Welcher Boden?"}],
}


def claude(text: str) -> dict[str, Any]:
    return {
        "model": "claude-opus-5-5",
        "stop_reason": "end_turn",
        "content": [{"type": "text", "text": text}],
        "usage": {"input_tokens": 2000, "output_tokens": 400},
    }


def sse(*events: dict[str, Any]) -> str:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)


CLAUDE_STREAM = sse(
    {
        "type": "message_start",
        "message": {
            "id": "msg_1",
            "model": "claude-opus-5-5",
            "usage": {"input_tokens": 800, "cache_read_input_tokens": 200, "output_tokens": 1},
        },
    },
    {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Gieß "}},
    {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "morgen früh."}},
    {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 42}},
    {"type": "message_stop"},
)


@pytest.fixture
async def garden(hass: HomeAssistant) -> tuple[MockConfigEntry, Any]:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
        options={"weekly_check": True},
        subentries_data=[
            ConfigSubentryData(
                data={"kind": "anthropic", "api_key": "sk-ant-x", "model": "claude-opus-5-5"},
                subentry_type="ai",
                title="Claude",
                unique_id=None,
            )
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    rose = await entry.runtime_data.manager.async_create_plant(
        {"name": "Rose", "category": "shrub", "notes": "vom Nachbarn geschenkt"}
    )
    return entry, rose


async def _call(client: Any, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


def _sent(aioclient_mock: AiohttpClientMocker) -> dict[str, Any]:
    body: dict[str, Any] = aioclient_mock.mock_calls[-1][2]
    return body


async def test_diagnose_a_problem(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any],
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    old = await data.manager.async_add_photo(rose.id, make_image())
    await data.manager.async_update_photo(
        old.id, {"taken_at": dt_util.utcnow() - timedelta(days=60)}
    )
    photo = await data.manager.async_add_photo(rose.id, make_image(), tags=["problem"])
    [problem] = await data.care.async_problems(rose.id)
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(DIAGNOSIS)))
    client = await hass_ws_client(hass)

    msg = await _call(client, type="plant_garden/problems/diagnose", problem_id=problem.id)
    assert msg["success"], msg
    diagnosis = msg["result"]["problem"]["diagnosis"]
    assert [c["name"] for c in diagnosis["causes"]] == ["Trockenheit", "Spinnmilben"]
    assert diagnosis["follow_up_days"] == 7
    assert diagnosis["photo_ids"] == [photo.id, old.id]  # the problem photo, then an older one
    assert msg["result"]["log"][-1]["kind"] == "diagnosis"

    body = _sent(aioclient_mock)
    content = body["messages"][0]["content"]
    assert [c["type"] for c in content] == ["image", "image", "text"]
    text = content[-1]["text"]
    assert '"ref":"p1"' in text
    assert "Nachbarn" not in text  # notes are never sent
    assert "2. " in text
    assert "(earlier, for comparison)" in text
    assert body["output_config"]["format"]["type"] == "json_schema"

    [task] = await data.care.async_tasks(rose.id)
    assert task.kind.value == "photo"
    assert task.source == "ai"
    assert task.due == dt_util.now().date() + timedelta(days=7)
    [row] = await data.manager.async_usage_log(limit=5)
    assert row["feature"] == "diagnose"

    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, status=529, json={"error": {"message": "overloaded"}})
    msg = await _call(client, type="plant_garden/problems/diagnose", problem_id=problem.id)
    assert msg["error"]["code"] == "ai_error"


async def test_tips_with_tasks_and_questions(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any],
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(TIPS)))
    client = await hass_ws_client(hass)

    assert (await _call(client, type="plant_garden/assistant/tips"))["result"] is None
    msg = await _call(client, type="plant_garden/assistant/tips/create")
    record = msg["result"]
    assert [t["plant_id"] for t in record["tips"]] == [rose.id, None]
    assert [t["state"] for t in record["tips"]] == ["new", None]
    [question] = await data.care.async_questions(rose.id)
    assert question.field == "soil_type"

    tip_id = record["tips"][0]["id"]
    msg = await _call(client, type="plant_garden/assistant/tips/decide", tip_id=tip_id, accept=True)
    assert msg["result"]["tips"][0]["state"] == "accepted"
    [task] = await data.care.async_tasks(rose.id)
    assert (task.kind.value, task.title, task.source) == ("prune", "Verblühtes schneiden", "ai")
    assert task.due == dt_util.now().date() + timedelta(days=3)
    msg = await _call(
        client, type="plant_garden/assistant/tips/decide", tip_id=tip_id, accept=False
    )
    assert msg["result"]["tips"][0]["state"] == "accepted"  # decided already
    msg = await _call(client, type="plant_garden/assistant/tips/decide", tip_id="nope", accept=True)
    assert msg["error"]["code"] == "not_found"

    # tips for one plant
    msg = await _call(client, type="plant_garden/assistant/tips/create", plant_id=rose.id)
    assert msg["success"]
    assert (await _call(client, type="plant_garden/assistant/tips", plant_id=rose.id))["result"]
    await data.manager.async_delete_plant(rose.id)
    await hass.async_block_till_done()
    assert data.assistant.tips(rose.id) is None


async def test_chat_streams_the_answer(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any],
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    aioclient_mock.post(MESSAGES, text=CLAUDE_STREAM, headers={"Content-Type": "text/event-stream"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "plant_garden/assistant/chat", "plant_id": rose.id, "text": "Wann gießen?"}
    )
    assert (await client.receive_json())["success"]
    events = []
    while True:
        event = (await client.receive_json())["event"]
        events.append(event)
        if "done" in event or "error" in event:
            break
    assert [e.get("delta") for e in events[:-1]] == ["Gieß ", "morgen früh."]
    assert events[-1]["message"]["text"] == "Gieß morgen früh."
    assert _sent(aioclient_mock)["stream"] is True

    history = await data.care.async_chat(rose.id)
    assert [(m.role, m.text) for m in history] == [
        ("user", "Wann gießen?"),
        ("assistant", "Gieß morgen früh."),
    ]
    [row] = await data.manager.async_usage_log(limit=5)
    assert (row["feature"], row["input"], row["cached_input"], row["output"]) == (
        "chat", 800, 200, 42,
    )  # fmt: skip

    # the action answers without streaming and sends the history along
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, json=claude("Im Herbst."))
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, f"plant_{rose.id}"), entry.entry_id
    )
    assert device is not None
    response = await hass.services.async_call(
        DOMAIN, "ask_assistant", {"question": "Wann schneiden?", "device_id": device.id},
        blocking=True, return_response=True,
    )  # fmt: skip
    assert response == {"answer": "Im Herbst."}
    roles = [m["role"] for m in _sent(aioclient_mock)["messages"]]
    assert roles == ["user", "assistant", "user"]

    # errors arrive as an event
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, status=401, json={"error": {"message": "invalid x-api-key"}})
    await client.send_json_auto_id({"type": "plant_garden/assistant/chat", "text": "Hallo?"})
    assert (await client.receive_json())["success"]
    event = (await client.receive_json())["event"]
    assert event == {"error": "invalid x-api-key", "code": "ai_error"}


async def test_weekly_check(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, garden: tuple[MockConfigEntry, Any]
) -> None:
    entry, _rose = garden
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(TIPS)))
    now = dt_util.now()
    monday = (now + timedelta(days=(7 - now.weekday()) % 7 or 7)).replace(
        hour=8, minute=0, second=0, microsecond=0
    )
    async_fire_time_changed(hass, monday - timedelta(days=1))  # a Sunday: nothing
    await hass.async_block_till_done()
    assert entry.runtime_data.assistant.tips(None) is None
    async_fire_time_changed(hass, monday)
    await hass.async_block_till_done()
    record = entry.runtime_data.assistant.tips(None)
    assert record is not None
    assert record["weekly"] is True
    [row] = await entry.runtime_data.manager.async_usage_log(limit=5)
    assert row["feature"] == "digest"


async def test_context_is_compact_and_deterministic(
    hass: HomeAssistant, garden: tuple[MockConfigEntry, Any]
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    for i in range(40):
        await data.care.async_create_task({"title": f"Aufgabe {i}", "plant_id": rose.id})
    full, refs = await context_builder.async_build(
        data.manager, data.care, None, plant_id=None, budget=100000, latitude=-33.9
    )
    assert refs == {"p1": rose.id}
    assert full["season"].endswith("southern hemisphere")
    assert len(full["open_tasks"]) == 30
    small, _ = await context_builder.async_build(
        data.manager, data.care, None, plant_id=None, budget=300, latitude=52
    )
    again, _ = await context_builder.async_build(
        data.manager, data.care, None, plant_id=None, budget=300, latitude=52
    )
    assert small == again
    assert len(json.dumps(small)) // 4 <= 300
    assert "plants" in small or "open_tasks" not in small
    plant, _ = await context_builder.async_build(
        data.manager, data.care, None, plant_id=rose.id, budget=100000, latitude=52
    )
    assert plant["plant"]["ref"] == "p1"
    assert "notes" not in plant["plant"]

    # a German garden with a hedge: the AI knows the hedge cutting season
    def build(country: str | None) -> Any:
        return context_builder.async_build(
            data.manager, data.care, None, plant_id=None, budget=100000, latitude=52,
            country=country,
        )  # fmt: skip

    assert "rules" not in (await build("DE"))[0]  # no hedge yet
    await data.manager.async_create_plant({"name": "Hainbuche", "category": "hedge"})
    assert "§ 39 BNatSchG" in (await build("DE"))[0]["rules"][0]
    assert "rules" not in (await build("AT"))[0]


def test_schemas_clean_bad_answers() -> None:
    diagnosis = clean_diagnosis(
        {
            "health": "dying",
            "causes": [{"name": "X", "type": "aliens", "confidence": 3}, "junk", {"name": ""}],
            "actions": [{"text": "Gießen", "urgency": "yesterday"}],
            "follow_up_days": 400,
            "symptoms": "not a list",
        }
    )
    assert diagnosis["health"] == "watch"
    assert diagnosis["causes"] == [
        {"name": "X", "type": "other", "confidence": 1.0, "evidence": ""}
    ]
    assert diagnosis["actions"][0]["urgency"] == "soon"
    assert diagnosis["follow_up_days"] is None
    assert diagnosis["symptoms"] == []
    tips = clean_tips(
        {
            "tips": [
                {"text": "a", "plant": "p9", "task": {"title": "t", "kind": "dance",
                 "due_in_days": -1, "repeat_every": 2, "repeat_unit": "weeks"}},
                {"text": ""},
            ],
            "questions": [{"question": "q", "plant": "p1", "field": "colour"}],
        },
        {"p1": "ROSE"},
    )  # fmt: skip
    [tip] = tips["tips"]
    assert tip["plant_id"] is None
    assert tip["task"] == {
        "kind": "other", "title": "t", "due_in_days": None, "repeat": {"every": 2, "unit": "weeks"},
    }  # fmt: skip
    assert tips["questions"] == [{"plant_id": "ROSE", "field": None, "question": "q"}]


async def test_streaming_providers(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    session = async_get_clientsession(hass)
    request = AIRequest(
        feature=Feature.CHAT, system="s", messages=[Message(role="user", text="hi")]
    )
    chunks = "".join(
        f"data: {json.dumps(c)}\n\n"
        for c in (
            {"id": "c1", "model": "gpt-6.1-sol", "choices": [{"delta": {"content": "Hal"}}]},
            {"id": "c1", "choices": [{"delta": {"content": "lo"}, "finish_reason": "stop"}]},
            {"id": "c1", "choices": [], "usage": {"prompt_tokens": 50, "completion_tokens": 5,
                                                  "prompt_tokens_details": {"cached_tokens": 20}}},
        )
    ) + "data: [DONE]\n\n"  # fmt: skip
    aioclient_mock.post("https://api.openai.com/v1/chat/completions", text=chunks)
    provider = openai_compat.OpenAICompatibleProvider(
        session, base_url="https://api.openai.com/v1", api_key="k", model="gpt-6.1-sol",
        preset="openai",
    )  # fmt: skip
    deltas: list[str] = []
    response = await provider.async_stream(request, deltas.append)
    assert deltas == ["Hal", "lo"]
    assert (response.text, response.usage.input, response.usage.cached_input) == ("Hallo", 30, 20)
    assert _sent(aioclient_mock)["stream_options"] == {"include_usage": True}

    gemini_chunks = "".join(
        f"data: {json.dumps(c)}\n\n"
        for c in (
            {"candidates": [{"content": {"parts": [{"text": "denk", "thought": True},
                                                   {"text": "Ja"}]}}]},
            {"candidates": [{"content": {"parts": [{"text": "!"}]}, "finishReason": "STOP"}],
             "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 2,
                               "thoughtsTokenCount": 3},
             "modelVersion": "gemini-3.8-flash"},
        )
    )  # fmt: skip
    aioclient_mock.post(
        f"{gemini.BASE_URL}/models/gemini-3.8-flash:streamGenerateContent",
        params={"alt": "sse"},
        text=gemini_chunks,
    )
    deltas.clear()
    response = await gemini.GeminiProvider(session, "k", "gemini-3.8-flash").async_stream(
        request, deltas.append
    )
    assert deltas == ["Ja", "!"]
    assert (response.usage.output, response.usage.reasoning) == (5, 3)

    aioclient_mock.post(
        MESSAGES,
        text=sse({"type": "error", "error": {"type": "overloaded_error", "message": "busy"}}),
    )
    with pytest.raises(AIError, match="busy"):
        await anthropic.AnthropicProvider(session, "k", "").async_stream(request, deltas.append)

    aioclient_mock.post("https://example.invalid/stream", status=403, json={"error": "nope"})
    with pytest.raises(AuthError):
        async for _ in async_stream(session, "https://example.invalid/stream", json={}):
            pass  # pragma: no cover
    aioclient_mock.post("https://example.invalid/bad", status=400, json={"error": "bad"})
    with pytest.raises(AIError, match="bad"):
        async for _ in async_stream(session, "https://example.invalid/bad", json={}):
            pass  # pragma: no cover


COMPARISON = {
    "summary": "Deutlich gewachsen, aber neue braune Flecken.",
    "growth": "more",
    "changes": ["Mehr Triebe", "Braune Flecken an unteren Blättern"],
    "concerns": [{"text": "Flecken deuten auf Sternrußtau", "severity": "medium"}],
    "problem_title": "Braune Flecken",
}


async def test_compare_a_new_photo_with_an_earlier_one(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any],
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    client = await hass_ws_client(hass)
    first = await data.manager.async_add_photo(rose.id, make_image())
    msg = await _call(client, type="plant_garden/assistant/compare", photo_id=first.id)
    assert msg["error"]["code"] == "ai_error"  # nothing earlier to compare with

    old = await data.manager.async_add_photo(rose.id, make_image())
    await data.manager.async_update_photo(
        old.id, {"taken_at": dt_util.utcnow() - timedelta(days=40)}
    )
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(COMPARISON)))
    msg = await _call(client, type="plant_garden/assistant/compare", photo_id=first.id)
    assert msg["success"], msg
    result = msg["result"]
    assert (result["growth"], result["earlier_id"]) == ("more", old.id)
    body = _sent(aioclient_mock)
    content = body["messages"][0]["content"]
    assert [c["type"] for c in content] == ["image", "image", "text"]
    assert "Foto 2" in content[-1]["text"] or "Photo 2" in content[-1]["text"]
    # a real concern opens a problem with the new photo
    [problem] = await data.care.async_problems(rose.id)
    assert (problem.title, problem.photo_ids) == ("Braune Flecken", [first.id])
    assert result["problem_id"] == problem.id
    msg = await _call(client, type="plant_garden/assistant/comparison", plant_id=rose.id)
    assert msg["result"]["summary"] == COMPARISON["summary"]
    [row] = await data.manager.async_usage_log(limit=1)
    assert row["feature"] == "compare"

    # option on: a new photo is compared by itself
    hass.config_entries.async_update_entry(entry, options={"photo_compare": True})
    calm = {**COMPARISON, "concerns": [], "problem_title": "", "growth": "same"}
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(calm)))
    newest = await data.manager.async_add_photo(rose.id, make_image())
    await hass.async_block_till_done()
    comparison = data.assistant.comparison(rose.id)
    assert comparison is not None
    assert (comparison["photo_id"], comparison["growth"]) == (newest.id, "same")
    assert comparison["problem_id"] is None
    assert len(await data.care.async_problems(rose.id)) == 1  # no new problem
    # deleting a compared photo forgets the comparison
    await data.manager.async_delete_photo(newest.id)
    msg = await _call(client, type="plant_garden/assistant/comparison", plant_id=rose.id)
    assert msg["result"] is None
