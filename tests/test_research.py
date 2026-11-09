"""The assistant researches plants: Claude's web search, Wikipedia without it, the schedule."""

from __future__ import annotations

from datetime import timedelta
import json
from typing import Any

from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import (
    AiohttpClientMocker,
    AiohttpClientMockResponse,
)
from pytest_homeassistant_custom_component.typing import WebSocketGenerator
from yarl import URL

from custom_components.plant_garden.ai.providers import anthropic
from custom_components.plant_garden.ai.schemas import clean_research
from custom_components.plant_garden.const import DOMAIN

MESSAGES = f"{anthropic.BASE_URL}/messages"
CHAT = "https://api.openai.com/v1/chat/completions"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"

KNOWLEDGE = {
    "summary": "Robuster Zierstrauch mit duftenden Blüten.",
    "sections": [
        {"topic": "pruning", "text": "Im März auf 3-5 Augen zurückschneiden."},
        {"topic": "watering", "text": "Durchdringend, selten gießen."},
        {"topic": "pruning", "text": "Verblühtes laufend entfernen."},
        {"topic": "astrology", "text": "nicht erlaubt"},
    ],
    "calendar": [{"months": [3, 13, 3], "task": "Rückschnitt"}, {"months": [], "task": "leer"}],
    "warnings": ["Stacheln"],
}


def _entry(hass: HomeAssistant, provider: dict[str, Any], **options: Any) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
        options=options,
        subentries_data=[
            ConfigSubentryData(data=provider, subentry_type="ai", title="KI", unique_id=None)
        ],
    )
    entry.add_to_hass(hass)
    return entry


CLAUDE = {"kind": "anthropic", "api_key": "sk-ant-x", "model": "claude-opus-5-5"}


def _claude_answer(body: dict[str, Any], calls: list[dict[str, Any]]) -> dict[str, Any]:
    """Web research (paused once, then finished) or the tidy-up as JSON."""
    calls.append(body)
    if "tools" not in body:
        return {
            "model": "claude-opus-5-5",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": json.dumps(KNOWLEDGE)}],
            "usage": {"input_tokens": 3000, "output_tokens": 600},
        }
    if body["messages"][-1]["role"] == "user":
        return {
            "model": "claude-opus-5-5",
            "stop_reason": "pause_turn",
            "content": [
                {"type": "text", "text": "Ich suche. "},
                {
                    "type": "server_tool_use",
                    "id": "srvtoolu_1",
                    "name": "web_search",
                    "input": {"query": "Rosa canina Pflege"},
                },
            ],
            "usage": {
                "input_tokens": 9000,
                "output_tokens": 100,
                "server_tool_use": {"web_search_requests": 2},
            },
        }
    return {
        "model": "claude-opus-5-5",
        "stop_reason": "end_turn",
        "content": [
            {
                "type": "web_search_tool_result",
                "tool_use_id": "srvtoolu_1",
                "content": [{"type": "web_search_result", "url": "https://x.example/a"}],
            },
            {
                "type": "text",
                "text": "Schnitt im März.",
                "citations": [
                    {"type": "web_search_result_location", "url": "https://garten.example/rose",
                     "title": "Rosen schneiden", "cited_text": "..."},
                    {"type": "web_search_result_location", "url": "javascript:alert(1)",
                     "title": "bad", "cited_text": "..."},
                ],
            },
        ],
        "usage": {
            "input_tokens": 12000,
            "output_tokens": 900,
            "server_tool_use": {"web_search_requests": 1},
        },
    }  # fmt: skip


def _mock_claude(aioclient_mock: AiohttpClientMocker) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def answer(method: str, url: URL, data: Any) -> AiohttpClientMockResponse:
        return AiohttpClientMockResponse(method, url, json=_claude_answer(data, calls))

    aioclient_mock.post(MESSAGES, side_effect=answer)
    return calls


async def _run(client: Any, plant_id: str) -> dict[str, Any]:
    await client.send_json_auto_id({"type": "plant_garden/research/run", "plant_id": plant_id})
    return await client.receive_json()


async def _summary(client: Any) -> dict[str, Any]:
    await client.send_json_auto_id({"type": "plant_garden/research/summary"})
    msg = await client.receive_json()
    assert msg["success"], msg
    result: dict[str, Any] = msg["result"]
    return result


async def test_research_with_claude_web_search(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
) -> None:
    entry = _entry(hass, CLAUDE)
    assert await hass.config_entries.async_setup(entry.entry_id)
    manager = entry.runtime_data.manager
    rose = await manager.async_create_plant(
        {"name": "Hundsrose", "scientific_name": "Rosa canina", "notes": "vom Nachbarn"}
    )
    calls = _mock_claude(aioclient_mock)
    client = await hass_ws_client(hass)
    summary = await _summary(client)
    assert (summary["schedule"], summary["available"], summary["web"]) == ("off", True, True)
    assert summary["queue"] == [rose.id]
    assert summary["next_run"] is None  # off: nothing on its own
    assert summary["estimate"] > 0.05  # five searches alone are $0.05

    msg = await _run(client, rose.id)
    assert msg["success"], msg
    info = msg["result"]
    assert info["method"] == "web"
    assert info["summary"] == KNOWLEDGE["summary"]
    # pruning merged, unknown topics dropped, months cleaned
    assert [s["topic"] for s in info["sections"]] == ["watering", "pruning"]
    assert info["sections"][1]["text"].endswith("Verblühtes laufend entfernen.")
    assert info["calendar"] == [{"months": [3], "task": "Rückschnitt"}]
    assert info["sources"] == [{"url": "https://garten.example/rose", "title": "Rosen schneiden"}]
    # tokens of three calls plus three searches at $0.01
    assert info["cost"] > 0.03

    research, resumed, tidy = calls
    assert research["tools"] == [
        {"type": "web_search_20250305", "name": "web_search", "max_uses": 5}
    ]
    assert "output_config" not in research  # citations and JSON do not mix
    text = research["messages"][0]["content"][0]["text"]
    assert "Rosa canina" in text
    assert "Nachbarn" not in text  # notes stay at home
    assert resumed["messages"][-1]["role"] == "assistant"  # the paused turn sent back
    assert tidy["output_config"]["format"]["type"] == "json_schema"
    assert "Schnitt im März." in tidy["messages"][0]["content"][-1]["text"]
    log = await manager.async_usage_log(limit=5)
    assert [row["feature"] for row in log] == ["research", "research"]

    summary = await _summary(client)
    assert summary["queue"] == []  # has its knowledge: not researched again
    assert summary["plants"][rose.id]["summary"] == KNOWLEDGE["summary"]

    # deleting it puts the plant back in the queue
    await client.send_json_auto_id({"type": "plant_garden/research/delete", "plant_id": rose.id})
    assert (await client.receive_json())["success"]
    summary = await _summary(client)
    assert rose.id not in summary["plants"]
    assert summary["queue"] == [rose.id]


async def test_research_without_web_search_reads_wikipedia(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
) -> None:
    provider = {
        "kind": "openai_compatible",
        "preset": "openai",
        "base_url": "https://api.openai.com/v1",
        "api_key": "sk-x",
        "model": "gpt-5.5",
    }
    entry = _entry(hass, provider)
    assert await hass.config_entries.async_setup(entry.entry_id)
    rose = await entry.runtime_data.manager.async_create_plant({"name": "Dog rose"})

    async def wiki(method: str, url: URL, data: Any) -> AiohttpClientMockResponse:
        if url.query.get("list") == "search":
            return AiohttpClientMockResponse(
                method, url, json={"query": {"search": [{"title": "Rosa canina"}]}}
            )
        page = {"title": "Rosa canina", "extract": "Rosa canina is a climbing wild rose."}
        return AiohttpClientMockResponse(method, url, json={"query": {"pages": [page]}})

    aioclient_mock.get(WIKIPEDIA, side_effect=wiki)
    aioclient_mock.post(
        CHAT,
        json={
            "model": "gpt-5.5",
            "choices": [{"message": {"content": json.dumps(KNOWLEDGE)}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 2000, "completion_tokens": 500},
        },
    )
    client = await hass_ws_client(hass)
    assert (await _summary(client))["web"] is False
    msg = await _run(client, rose.id)
    assert msg["success"], msg
    info = msg["result"]
    assert info["method"] == "wikipedia"
    assert info["sources"] == [
        {"url": "https://en.wikipedia.org/wiki/Rosa_canina", "title": "Wikipedia: Rosa canina"}
    ]
    wiki_calls = [c for c in aioclient_mock.mock_calls if str(c[1]).startswith(WIKIPEDIA)]
    assert len(wiki_calls) == 2
    assert "PlantGarden/" in wiki_calls[0][3]["user-agent"]  # Wikimedia asks for a name
    body = aioclient_mock.mock_calls[-1][2]
    assert "widely accepted gardening knowledge" in body["messages"][0]["content"]
    assert "climbing wild rose" in body["messages"][1]["content"]


async def test_the_schedule_researches_one_plant_at_a_time(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    aioclient_mock: AiohttpClientMocker,
) -> None:
    entry = _entry(hass, CLAUDE)
    assert await hass.config_entries.async_setup(entry.entry_id)
    manager = entry.runtime_data.manager
    first = await manager.async_create_plant({"name": "Rose"})
    second = await manager.async_create_plant({"name": "Lavendel"})
    gone = await manager.async_create_plant({"name": "Alt", "status": "dead"})
    calls = _mock_claude(aioclient_mock)
    researcher = entry.runtime_data.researcher
    client = await hass_ws_client(hass)

    # off: the hourly check does nothing
    now = dt_util.utcnow().replace(minute=11, second=0, microsecond=0) + timedelta(hours=1)
    async_fire_time_changed(hass, now)
    await hass.async_block_till_done()
    assert calls == []

    # only admins choose the schedule
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    await reader.send_json_auto_id({"type": "plant_garden/research/schedule", "schedule": "daily"})
    assert (await reader.receive_json())["error"]["code"] == "unauthorized"
    await client.send_json_auto_id({"type": "plant_garden/research/schedule", "schedule": "daily"})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert entry.options["research_schedule"] == "daily"
    assert msg["result"]["queue"] == [first.id, second.id]  # dead plants are skipped
    assert gone.id not in msg["result"]["queue"]

    assert researcher.is_due(now)
    await researcher._async_tick(now)
    assert first.id in (await _summary(client))["plants"]
    # an hour later: a day has not passed
    assert not researcher.is_due(now + timedelta(hours=1))
    next_run = dt_util.parse_datetime((await _summary(client))["next_run"])
    assert next_run == now + timedelta(days=1)
    # a day later the next plant
    await researcher._async_tick(now + timedelta(days=1))
    summary = await _summary(client)
    assert set(summary["plants"]) == {first.id, second.id}
    assert summary["next_run"] is None  # nothing left to do

    # a failing research waits three days before it is tried again
    await client.send_json_auto_id({"type": "plant_garden/research/delete", "plant_id": second.id})
    await client.receive_json()
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, status=400, json={"error": {"message": "web search disabled"}})
    msg = await _run(client, second.id)
    assert msg["error"]["code"] == "ai_error"
    summary = await _summary(client)
    assert "web search disabled" in summary["failed"][second.id]["error"]
    assert summary["queue"] == []
    later = dt_util.utcnow() + timedelta(days=4)
    assert researcher.queue(later) == [second.id]

    # removing a plant forgets its knowledge
    await manager.async_delete_plant(first.id)
    await hass.async_block_till_done()
    assert first.id not in (await _summary(client))["plants"]


def test_clean_research_tolerates_bad_answers() -> None:
    assert clean_research({}) == {"summary": None, "sections": [], "calendar": [], "warnings": []}
    cleaned = clean_research(
        {
            "summary": "  Kurz.  ",
            "sections": [
                "kaputt",
                {"topic": "soil", "text": " "},
                {"topic": "soil", "text": "Lehm"},
            ],
            "calendar": [{"months": ["3", 4.0, True], "task": "Düngen"}],
            "warnings": [None, "Giftig für Katzen", ""],
        }
    )
    assert cleaned == {
        "summary": "Kurz.",
        "sections": [{"topic": "soil", "text": "Lehm"}],
        "calendar": [{"months": [4], "task": "Düngen"}],
        "warnings": ["Giftig für Katzen"],
    }


@pytest.mark.parametrize("schedule", ["weekly", "three_daily", "hourly"])
async def test_schedules_wait_their_interval(hass: HomeAssistant, schedule: str) -> None:
    entry = _entry(hass, CLAUDE, research_schedule=schedule)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await entry.runtime_data.manager.async_create_plant({"name": "Rose"})
    researcher = entry.runtime_data.researcher
    now = dt_util.utcnow().replace(minute=11, second=0, microsecond=0)
    assert researcher.is_due(now)
    researcher._data["last_run"] = now.isoformat()
    interval = {"weekly": timedelta(days=7), "three_daily": timedelta(hours=8)}.get(
        schedule, timedelta(hours=1)
    )
    assert not researcher.is_due(now + interval - timedelta(minutes=30))
    # a tick a few milliseconds early still counts
    assert researcher.is_due(now + interval - timedelta(milliseconds=5))
