"""The garden agent: tool calling with three providers, the loop, actions and undo."""

from __future__ import annotations

from datetime import date
import json
from pathlib import Path
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import (
    AiohttpClientMocker,
    AiohttpClientMockResponse,
)
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.ai import agent as agent_module, toolcalls
from custom_components.plant_garden.ai.prompts import agent as prompts
from custom_components.plant_garden.ai.providers import anthropic
from custom_components.plant_garden.ai.toolcalls import ToolCall, ToolSpec
from custom_components.plant_garden.const import DOMAIN

MESSAGES = f"{anthropic.BASE_URL}/messages"
ROOT = Path(__file__).parents[1]
TOOL = ToolSpec(
    "plant_info", "About a plant", {"type": "object", "properties": {"plant": {"type": "string"}}}
)
TALK: list[dict[str, Any]] = [
    {"role": "user", "text": "Wie geht es der Rose?"},
    {
        "role": "assistant",
        "text": "",
        "calls": [ToolCall("c1", "plant_info", {"plant": "Rose"})],
        "raw": None,
    },
    {
        "role": "tool",
        "results": [
            {
                "id": "c1",
                "call_id": None,
                "name": "plant_info",
                "content": '{"name":"Rose"}',
                "error": False,
            }
        ],
    },
]


def claude_turn(*blocks: dict[str, Any], stop: str = "end_turn") -> dict[str, Any]:
    return {
        "model": "claude-opus-5-5",
        "stop_reason": stop,
        "content": list(blocks),
        "usage": {"input_tokens": 1000, "output_tokens": 100},
    }


def use(tool_id: str, tool: str, /, **args: Any) -> dict[str, Any]:
    return {"type": "tool_use", "id": tool_id, "name": tool, "input": args}


def say(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


@pytest.fixture
async def garden(hass: HomeAssistant) -> MockConfigEntry:
    """A garden with Claude and two plants."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
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
    manager = entry.runtime_data.manager
    await manager.async_create_plant(
        {"name": "Rose", "category": "shrub", "notes": "vom Nachbarn geschenkt"}
    )
    await manager.async_create_plant({"name": "Tomate"})
    return entry


async def _ask(client: Any, text: str, **extra: Any) -> list[dict[str, Any]]:
    """Ask the agent; all events up to and including the last one."""
    await client.send_json_auto_id({"type": "plant_garden/agent/ask", "text": text, **extra})
    assert (await client.receive_json())["success"]
    events = []
    while True:
        event = (await client.receive_json())["event"]
        events.append(event)
        if "done" in event or "error" in event:
            return events


async def _call(client: Any, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


# ---------------------------------------------------------------- providers
async def test_anthropic_turn(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    session: aiohttp.ClientSession = async_get_clientsession(hass)
    aioclient_mock.post(
        MESSAGES,
        json=claude_turn(
            say("Ich sehe nach."), use("t1", "plant_info", plant="Rose"), stop="tool_use"
        ),
    )
    data = {"kind": "anthropic", "api_key": "k", "model": "claude-opus-5-5"}
    turn = await toolcalls.async_turn(session, data, system="S", messages=TALK, tools=[TOOL])
    assert turn.text == "Ich sehe nach."
    assert turn.calls == [ToolCall("t1", "plant_info", {"plant": "Rose"})]
    assert turn.raw[1]["type"] == "tool_use"  # sent back as it is in the next turn
    body = aioclient_mock.mock_calls[-1][2]
    assert body["tools"] == [
        {"name": "plant_info", "description": "About a plant", "input_schema": TOOL.parameters}
    ]
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    # the tool result travels as a user message with a tool_result block
    assert body["messages"][2] == {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": "c1",
                "content": '{"name":"Rose"}',
                "is_error": False,
            }
        ],
    }


async def test_openai_turn(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    session: aiohttp.ClientSession = async_get_clientsession(hass)
    url = "https://openrouter.ai/api/v1/chat/completions"
    aioclient_mock.post(
        url,
        json={
            "model": "x/y",
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_9",
                                "type": "function",
                                "function": {
                                    "name": "plant_info",
                                    "arguments": '{"plant": "Rose"}',
                                },
                            }
                        ],
                    },
                }
            ],
            "usage": {"prompt_tokens": 900, "completion_tokens": 30, "cost": 0.004},
        },
    )
    data = {"kind": "openai_compatible", "preset": "openrouter", "api_key": "k", "model": "x/y",
            "base_url": "https://openrouter.ai/api/v1"}  # fmt: skip
    turn = await toolcalls.async_turn(session, data, system="S", messages=TALK, tools=[TOOL])
    assert turn.calls == [ToolCall("call_9", "plant_info", {"plant": "Rose"})]
    assert (turn.text, turn.provider_cost) == ("", 0.004)
    body = aioclient_mock.mock_calls[-1][2]
    assert body["tools"][0]["function"]["name"] == "plant_info"
    assert [m["role"] for m in body["messages"]] == ["system", "user", "assistant", "tool"]
    assert body["messages"][2]["tool_calls"][0]["function"]["arguments"] == '{"plant": "Rose"}'
    assert body["messages"][3] == {
        "role": "tool",
        "tool_call_id": "c1",
        "content": '{"name":"Rose"}',
    }


async def test_gemini_turn(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    session: aiohttp.ClientSession = async_get_clientsession(hass)
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"
    parts = [
        {"text": "thinking", "thought": True},
        {"functionCall": {"name": "plant_info", "args": {"plant": "Rose"}, "id": "g7"},
         "thoughtSignature": "sig"},
    ]  # fmt: skip
    aioclient_mock.post(
        url,
        json={
            "candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 800, "candidatesTokenCount": 20},
        },
    )
    data = {"kind": "gemini", "api_key": "k", "model": "gemini-3.8-flash"}
    turn = await toolcalls.async_turn(session, data, system="S", messages=TALK, tools=[TOOL])
    assert turn.calls == [ToolCall("call_1", "plant_info", {"plant": "Rose"})]
    assert turn.text == ""  # thoughts are not the answer
    assert turn.extra["native_ids"] == {"call_1": "g7"}
    # the model's message goes back untouched, with its thought signature
    assert turn.raw["parts"][1]["thoughtSignature"] == "sig"
    body = aioclient_mock.mock_calls[-1][2]
    assert body["tools"][0]["functionDeclarations"][0]["name"] == "plant_info"
    assert body["contents"][2] == {
        "role": "user",
        "parts": [
            {"functionResponse": {"name": "plant_info", "response": {"result": '{"name":"Rose"}'}}}
        ],
    }
    assert not toolcalls.can_call_tools({"kind": "ha_ai_task"})


# ---------------------------------------------------------------- handbook
def test_the_shipped_handbook_is_the_user_guide() -> None:
    # the agent's help is a copy of docs/: both must say the same
    for name in ("USER_GUIDE.md", "USER_GUIDE.de.md"):
        shipped = (ROOT / "custom_components/plant_garden/help" / name).read_text(encoding="utf-8")
        assert shipped == (ROOT / "docs" / name).read_text(encoding="utf-8"), name


def test_handbook_search() -> None:
    text = (ROOT / "docs/USER_GUIDE.de.md").read_text(encoding="utf-8")
    sections = agent_module.split_handbook(text)
    headings = [heading for heading, _ in sections]
    assert len(headings) >= 12
    assert headings[0].startswith("1.")
    # the long chapter about the assistant comes entry by entry, each short enough
    assert "6. Assistent - Garten-Assistent" in headings
    assert all(len(body) <= 4000 for _, body in sections)
    found = agent_module.search_handbook(sections, "Garten-Assistent Rückgängig")
    assert found[0][0] == "6. Assistent - Garten-Assistent"
    found = agent_module.search_handbook(sections, "Regner Tropfschlauch verknüpfen")
    assert "Bewässerung" in found[0][0]
    assert agent_module.search_handbook(sections, "xyzzy") == []
    assert agent_module.search_handbook(sections, "an") == []  # too short to mean anything


def test_system_prompt_says_where_the_user_is() -> None:
    text = prompts.system(
        "de", garden="Garten", today=date(2027, 5, 1), view="", plant="Rose", web=True, plants=2
    )
    assert 'Seite der Pflanze "Rose"' in text
    assert "web_search" in text
    assert "2027-05-01" in text
    plain = prompts.system(
        "en", garden="G", today=date(2027, 5, 1), view="Tasks", plant=None, web=False, plants=0
    )
    assert "not available" in plain
    assert 'in the area "Tasks"' in plain


# ---------------------------------------------------------------- the agent
async def test_question_answered_with_tools(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: MockConfigEntry,
) -> None:
    client = await hass_ws_client(hass)
    state = (await _call(client, type="plant_garden/agent/state"))["result"]
    assert state == {
        "available": True,
        "provider": "Claude",
        "web": True,
        "currency": "USD",
        "messages": [],
    }

    aioclient_mock.post(
        MESSAGES,
        side_effect=_replies(
            claude_turn(use("t1", "garden_overview"), use("t2", "list_plants"), stop="tool_use"),
            claude_turn(say("Heute ist nichts fällig. Im Garten stehen Rose und Tomate.")),
        ),
    )
    events = await _ask(client, "Was ist heute zu tun?", view="plan")
    assert [e.get("step") for e in events[:-1]] == ["garden_overview", "list_plants"]
    message = events[-1]["message"]
    assert message["text"].startswith("Heute ist nichts fällig.")
    assert message["steps"] == ["garden_overview", "list_plants"]
    assert message["actions"] == []
    assert message["cost"] == pytest.approx(2 * (1000 * 4e-6 + 100 * 20e-6))

    # the second request carries both tool results; notes never leave the house
    second = aioclient_mock.mock_calls[-1][2]
    results = second["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in results] == ["t1", "t2"]
    listed = json.loads(results[1]["content"])
    assert [p["name"] for p in listed["plants"]] == ["Rose", "Tomate"]
    assert "Nachbarn" not in json.dumps(second, ensure_ascii=False)
    assert [t["name"] for t in second["tools"]][-1] == "web_search"
    assert "Garden plan" in second["system"][0]["text"]

    rows = await garden.runtime_data.manager.async_usage_log(limit=5)
    assert [row["feature"] for row in rows] == ["agent", "agent"]
    history = (await _call(client, type="plant_garden/agent/state"))["result"]["messages"]
    assert [m["role"] for m in history] == ["user", "assistant"]

    # the next question gets the conversation so far
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, json=claude_turn(say("Gern.")))
    await _ask(client, "Danke")
    sent = aioclient_mock.mock_calls[-1][2]["messages"]
    assert [m["role"] for m in sent] == ["user", "assistant", "user"]
    assert sent[0]["content"][0]["text"] == "Was ist heute zu tun?"

    assert (await _call(client, type="plant_garden/agent/clear"))["success"]
    assert (await _call(client, type="plant_garden/agent/state"))["result"]["messages"] == []


def _replies(*payloads: dict[str, Any]) -> Any:
    """Answer the provider's requests one after the other."""
    queue = list(payloads)

    async def reply(method: str, url: Any, data: Any) -> AiohttpClientMockResponse:
        return AiohttpClientMockResponse(method, url, json=queue.pop(0))

    return reply


async def test_actions_and_undo(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: MockConfigEntry,
) -> None:
    data = garden.runtime_data
    client = await hass_ws_client(hass)
    aioclient_mock.post(
        MESSAGES,
        side_effect=_replies(
            claude_turn(
                use("a", "create_plant", name="Lavendel", scientific_name="Lavandula angustifolia",
                    category="perennial", light="full_sun", min_temperature_c=-20),
                use("b", "create_task", title="Lavendel schneiden", plant="Lavendel", kind="prune",
                    due_in_days=3),
                use("c", "log_watering", plants=["Rose"], liters=5),
                use("d", "update_plant", plant="Rose", water_need="high", category="nonsense"),
                use("e", "report_problem", plant="Tomate", title="Braune Flecken"),
                use("f", "create_plant", name="rose"),
                use("g", "plant_info", plant="Gurke"),
                stop="tool_use",
            ),
            claude_turn(say("Erledigt. Zieh den Lavendel im Plan an seinen Platz.")),
        ),
    )  # fmt: skip
    events = await _ask(client, "Leg einen Lavendel an und so weiter")
    message = events[-1]["message"]
    kinds = [action["kind"] for action in message["actions"]]
    assert kinds == [
        "create_plant",
        "create_task",
        "log_watering",
        "update_plant",
        "report_problem",
    ]
    assert all("undo" not in action for action in message["actions"])
    assert [e["action"]["kind"] for e in events if "action" in e] == kinds

    # the new plant: unplaced, its details marked as the AI's
    manager = data.manager
    lavender = next(p for p in manager.plants if p.name == "Lavendel")
    assert lavender.position is None
    assert lavender.scientific_name == "Lavandula angustifolia"
    assert lavender.sources["scientific_name"].source.value == "ai"
    rose = next(p for p in manager.plants if p.name == "Rose")
    assert rose.water_need.value == "high"
    assert rose.category.value == "shrub"  # a value that does not exist is ignored
    [task] = await data.care.async_tasks(lavender.id)
    assert (task.title, task.kind.value, task.source) == ("Lavendel schneiden", "prune", "ai")
    assert data.irrigation.summary()["plants"][rose.id]["today_l"] == 5

    # errors went back to the model as answers: a duplicate, an unknown plant
    results = aioclient_mock.mock_calls[-1][2]["messages"][-1]["content"]
    assert results[5]["is_error"] is True
    assert "exists already" in results[5]["content"]
    assert results[6]["is_error"] is True
    assert "No plant is called" in results[6]["content"]

    # undo, one by one
    by_kind = {action["kind"]: action["id"] for action in message["actions"]}
    undone = await _call(client, type="plant_garden/agent/undo", action_id=by_kind["create_plant"])
    assert undone["result"]["actions"][0]["undone"] is True
    assert all(p.name != "Lavendel" for p in manager.plants)
    await _call(client, type="plant_garden/agent/undo", action_id=by_kind["update_plant"])
    assert manager.get_plant(rose.id).water_need is None
    await _call(client, type="plant_garden/agent/undo", action_id=by_kind["log_watering"])
    assert rose.id not in data.irrigation.summary()["plants"] or not data.irrigation.summary()[
        "plants"
    ][rose.id].get("today_l")
    await _call(client, type="plant_garden/agent/undo", action_id=by_kind["report_problem"])
    assert await data.care.async_problems(active_only=True) == []
    # the task went with the plant; undoing it again is harmless
    again = await _call(client, type="plant_garden/agent/undo", action_id=by_kind["create_task"])
    assert again["success"]
    assert (await _call(client, type="plant_garden/agent/undo", action_id="nope"))["error"][
        "code"
    ] == "not_found"


async def test_help_web_search_and_limits(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: MockConfigEntry,
) -> None:
    client = await hass_ws_client(hass)
    searched = {
        "model": "claude-opus-5-5",
        "stop_reason": "end_turn",
        "content": [
            {
                "type": "text",
                "text": "Blattläuse mit Wasser abspritzen.",
                "citations": [{"url": "https://example.org/laus", "title": "Blattläuse"}],
            }
        ],
        "usage": {"input_tokens": 3000, "output_tokens": 200,
                  "server_tool_use": {"web_search_requests": 1}},
    }  # fmt: skip
    aioclient_mock.post(
        MESSAGES,
        side_effect=_replies(
            claude_turn(use("h", "help", topic="Open-Meteo evaporation"),
                        use("w", "web_search", query="Blattläuse an Rosen bekämpfen"),
                        stop="tool_use"),
            searched,
            claude_turn(say("Spritz sie mit Wasser ab.")),
        ),
    )  # fmt: skip
    events = await _ask(client, "Wie werde ich Blattläuse los und wo stelle ich Wetter ein?")
    message = events[-1]["message"]
    assert message["sources"] == [{"url": "https://example.org/laus", "title": "Blattläuse"}]
    results = aioclient_mock.mock_calls[-1][2]["messages"][-1]["content"]
    handbook = json.loads(results[0]["content"])
    assert "eather" in handbook["chapters"][0]["heading"]
    assert json.loads(results[1]["content"])["answer"] == "Blattläuse mit Wasser abspritzen."
    # the search itself was a call with Claude's web search tool
    assert aioclient_mock.mock_calls[1][2]["tools"][0]["name"] == "web_search"

    # a model that never stops calling tools is stopped after 8 rounds
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, json=claude_turn(use("x", "list_tasks"), stop="tool_use"))
    events = await _ask(client, "Und jetzt?")
    assert aioclient_mock.call_count == agent_module.MAX_STEPS + 1
    assert events[-1]["message"]["text"] == prompts.NO_ANSWER["en"]

    # a failing provider is an error event; the question is not kept
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, status=529, json={"error": {"message": "overloaded"}})
    events = await _ask(client, "Hallo?")
    assert events[-1]["code"] == "ai_error"
    history = (await _call(client, type="plant_garden/agent/state"))["result"]["messages"]
    assert history[-1]["role"] == "assistant"
    assert all(m["text"] != "Hallo?" for m in history)


async def test_without_a_provider(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    state = (await _call(client, type="plant_garden/agent/state"))["result"]
    assert (state["available"], state["web"]) == (False, False)
    events = await _ask(client, "Was ist zu tun?")
    assert events[-1]["code"] == "ai_error"
