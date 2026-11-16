"""Autogarden as a tool set for Home Assistant's conversation agents."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import llm
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plant_garden import llm_api
from custom_components.plant_garden.models import Plant


def _context() -> llm.LLMContext:
    return llm.LLMContext(
        platform="test",
        context=Context(),
        language="de",
        assistant="conversation",
        device_id=None,
    )


async def _api(hass: HomeAssistant) -> llm.APIInstance:
    return await llm.async_get_api(hass, "plant_garden", _context())


async def _call(api: llm.APIInstance, name: str, **args: Any) -> dict[str, Any]:
    tool = next(t for t in api.tools if t.name == name)
    # the agent validates the arguments with the tool's schema before the call
    checked = tool.parameters(args)
    # called directly: the agent's own path needs the conversation integration
    result = await tool.async_call(
        api.api.hass, llm.ToolInput(tool_name=name, tool_args=checked), api.llm_context
    )
    data: dict[str, Any] = getattr(result, "data", result)
    return data


def _named(*names: str) -> list[Plant]:
    now = dt_util.utcnow()
    return [Plant(id=name, name=name, created_at=now, updated_at=now) for name in names]


def test_find_plant_by_spoken_name() -> None:
    plants = _named("Rose", "Rosenkohl", "Tomate Balkon", "Tomate Beet")
    plants[1].scientific_name = "Brassica oleracea"
    assert llm_api.find_plant(plants, " rose ").name == "Rose"  # exact beats partial
    assert llm_api.find_plant(plants, "Kohl").name == "Rosenkohl"
    assert llm_api.find_plant(plants, "brassica").name == "Rosenkohl"
    with pytest.raises(llm_api.ToolError, match="Several plants match"):
        llm_api.find_plant(plants, "Tomate")
    with pytest.raises(llm_api.ToolError, match="The plants are: Rose, Rosenkohl"):
        llm_api.find_plant(plants, "Gurke")
    with pytest.raises(llm_api.ToolError):
        llm_api.find_plant(plants, "  ")


async def test_the_api_is_offered_while_the_garden_is_loaded(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    manager = loaded_entry.runtime_data.manager
    await manager.async_create_plant({"name": "Rose", "notes": "vom Nachbarn"})
    await manager.async_create_plant({"name": "Alter Apfel", "status": "removed"})
    assert "plant_garden" in [api.id for api in llm.async_get_apis(hass)]
    api = await _api(hass)
    assert [tool.name for tool in api.tools] == [
        "garden_overview",
        "plant_info",
        "log_watering",
        "create_task",
        "complete_task",
        "report_problem",
    ]
    # the prompt names the plants (not the removed one), nothing private
    assert "The plants: Rose" in api.api_prompt
    assert "Apfel" not in api.api_prompt
    assert "Nachbarn" not in api.api_prompt
    if hasattr(llm, "ToolAnnotations"):
        by_name = {tool.name: tool for tool in api.tools}
        assert by_name["garden_overview"].annotations.read_only is True
        assert by_name["log_watering"].annotations.read_only is False
        assert all(tool.annotations.open_world is False for tool in api.tools)
        assert all(tool.integration == "plant_garden" for tool in api.tools)

    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    await hass.async_block_till_done()
    assert "plant_garden" not in [api.id for api in llm.async_get_apis(hass)]


async def test_tools_read_and_change_the_garden(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    data = loaded_entry.runtime_data
    rose = await data.manager.async_create_plant(
        {
            "name": "Rose",
            "scientific_name": "Rosa canina",
            "category": "shrub",
            "notes": "vom Nachbarn",
            "care_prune": "im Frühjahr",
            "position": {"x": 0, "y": 0},
        }
    )
    await data.manager.async_create_plant({"name": "Tomate"})
    today = dt_util.now().date()
    await data.care.async_create_task(
        {"title": "Rose düngen", "kind": "fertilize", "plant_id": rose.id, "due": today}
    )
    await data.care.async_create_task({"title": "Laub rechen", "due": today + timedelta(days=3)})
    api = await _api(hass)

    overview = await _call(api, "garden_overview")
    assert overview["plant_count"] == 2
    assert overview["tasks_due"] == [
        {"title": "Rose düngen", "kind": "fertilize", "plant": "Rose", "due": today.isoformat()}
    ]
    assert [t["title"] for t in overview["tasks_this_week"]] == ["Laub rechen"]
    assert overview["needs_water_today"] == []
    assert overview["problems"] == []

    # watering by voice
    logged = await _call(api, "log_watering", plants=["rose"], liters=5)
    assert logged == {"logged": ["Rose"], "liters_each": 5.0}
    info = await _call(api, "plant_info", plant="Rosa")
    assert info["name"] == "Rose"
    assert info["water_today_l"] == 5
    assert info["care"]["pruning"] == "im Frühjahr"
    assert info["open_tasks"][0]["title"] == "Rose düngen"
    assert "vom Nachbarn" not in str(info)  # notes stay private
    assert "position" not in info

    # tasks
    created = await _call(
        api, "create_task", title="Rose schneiden", plant="Rose", kind="prune", due_in_days=2
    )
    assert created == {
        "created": "Rose schneiden",
        "plant": "Rose",
        "due": (today + timedelta(days=2)).isoformat(),
    }
    ambiguous = await _call(api, "complete_task", title="Rose")
    assert "Several open tasks match" in ambiguous["error"]
    done = await _call(api, "complete_task", title="düngen", plant="Rose")
    assert done["completed"] == "Rose düngen"
    open_titles = [t.title for t in await data.care.async_tasks() if t.status.value == "open"]
    assert sorted(open_titles) == ["Laub rechen", "Rose schneiden"]
    assert "No open task matches" in (await _call(api, "complete_task", title="Hecke"))["error"]

    # a problem by voice shows up in the overview
    reported = await _call(api, "report_problem", plant="Tomate", title="Braune Flecken")
    assert reported == {"reported": "Braune Flecken", "plant": "Tomate"}
    assert (await _call(api, "garden_overview"))["problems"][0]["title"] == "Braune Flecken"

    # unknown plants come back as an answer for the model, not as an exception
    missing = await _call(api, "plant_info", plant="Gurke")
    assert "The plants are: Rose, Tomate" in missing["error"]
    # the schema refuses nonsense before the tool runs
    tool = next(t for t in api.tools if t.name == "log_watering")
    with pytest.raises(Exception, match=r"."):
        tool.parameters({"plants": ["Rose"], "liters": -3})
