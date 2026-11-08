"""Tasks, problems, questions and chat: the assistant's data without AI (spec 4.7)."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import sys
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from homeassistant.core import Event, HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden import care as care_module
from custom_components.plant_garden.care import RepeatUnit, next_due
from custom_components.plant_garden.const import (
    DOMAIN,
    EVENT_PROBLEM_DETECTED,
    EVENT_TASK_DUE,
)

from .images import make_image


async def _call(client: Any, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


def _events(hass: HomeAssistant, event_type: str) -> list[Event]:
    events: list[Event] = []
    hass.bus.async_listen(event_type, events.append)
    return events


def test_next_due() -> None:
    done = date(2026, 5, 10)
    assert next_due(done, 3, RepeatUnit.DAYS, []) == date(2026, 5, 13)
    assert next_due(done, 2, RepeatUnit.WEEKS, []) == date(2026, 5, 24)
    # seasonal: fertilise every 4 weeks from March to August
    assert next_due(date(2026, 8, 20), 4, RepeatUnit.WEEKS, [3, 4, 5, 6, 7, 8]) == date(2027, 3, 1)
    assert next_due(date(2026, 7, 1), 4, RepeatUnit.WEEKS, [3, 4, 5, 6, 7, 8]) == date(2026, 7, 29)


async def test_tasks_repeat_and_summary(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    manager = loaded_entry.runtime_data.manager
    rose = await manager.async_create_plant({"name": "Rose"})
    today = dt_util.now().date()
    due = _events(hass, EVENT_TASK_DUE)

    msg = await _call(
        client,
        type="plant_garden/tasks/create",
        kind="water",
        title="Gießen",
        plant_id=rose.id,
        due=today.isoformat(),
        repeat={"every": 1, "unit": "weeks"},
    )
    assert msg["success"], msg
    task = msg["result"]
    assert task["repeat"] == {"every": 1, "unit": "weeks"}
    await hass.async_block_till_done()
    assert [e.data["task_id"] for e in due] == [task["id"]]  # due today: fired once
    await loaded_entry.runtime_data.care.async_check_due()
    assert len(due) == 1

    prune = await _call(
        client,
        type="plant_garden/tasks/create",
        kind="prune",
        title="Schneiden",
        plant_id=rose.id,
        due=(today + timedelta(days=5)).isoformat(),
    )
    summary = (await _call(client, type="plant_garden/care/summary"))["result"]
    assert summary["plants"][rose.id]["open_tasks"] == 2
    assert summary["plants"][rose.id]["prune_due"] is True
    assert summary["garden"]["open_tasks"] == 2

    msg = await _call(client, type="plant_garden/tasks/complete", task_id=task["id"])
    following = msg["result"]["next"]
    assert following["due"] == (today + timedelta(days=7)).isoformat()
    assert following["title"] == "Gießen"
    msg = await _call(client, type="plant_garden/tasks/complete", task_id=task["id"])
    assert msg["result"] == {"next": None}  # done already

    tasks = (await _call(client, type="plant_garden/tasks/list", plant_id=rose.id))["result"]
    states = [(t["title"], t["status"]) for t in tasks["tasks"]]
    assert states == [("Schneiden", "open"), ("Gießen", "open"), ("Gießen", "done")]

    msg = await _call(client, type="plant_garden/tasks/reopen", task_id=task["id"])
    assert msg["result"]["status"] == "open"
    msg = await _call(
        client, type="plant_garden/tasks/update", task_id=prune["result"]["id"], title="  "
    )
    assert msg["error"]["code"] == "invalid_format"
    msg = await _call(
        client,
        type="plant_garden/tasks/update",
        task_id=prune["result"]["id"],
        due=None,
        months=[3, 13, 4],
        notes="mit Handschuhen",
    )
    assert msg["error"]["code"] == "invalid_format"  # month 13
    msg = await _call(
        client,
        type="plant_garden/tasks/update",
        task_id=prune["result"]["id"],
        due=None,
        repeat=None,
        notes="mit Handschuhen",
    )
    assert msg["result"]["due"] is None
    assert msg["result"]["notes"] == "mit Handschuhen"
    msg = await _call(client, type="plant_garden/tasks/delete", task_id=prune["result"]["id"])
    assert msg["success"]
    msg = await _call(client, type="plant_garden/tasks/delete", task_id=prune["result"]["id"])
    assert msg["error"]["code"] == "not_found"
    msg = await _call(client, type="plant_garden/tasks/create", title="x", plant_id="nope")
    assert msg["error"]["code"] == "not_found"

    # the sensor of the plant counts its open tasks
    state = hass.states.get("sensor.rose_open_tasks")
    assert state is not None
    assert state.state == "2"
    health = er.async_get(hass).async_get("sensor.rose_health")
    assert health is not None
    assert health.disabled_by is er.RegistryEntryDisabler.INTEGRATION


async def test_problems_from_photos(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    manager = loaded_entry.runtime_data.manager
    rose = await manager.async_create_plant({"name": "Rose"})
    detected = _events(hass, EVENT_PROBLEM_DETECTED)

    first = await manager.async_add_photo(
        rose.id, make_image(), tags=["problem"], note="Gelbe Blätter"
    )
    await hass.async_block_till_done()
    problems = (await _call(client, type="plant_garden/problems/list", plant_id=rose.id))["result"]
    [problem] = problems["problems"]
    assert problem["title"] == "Gelbe Blätter"
    assert problem["photo_ids"] == [first.id]
    assert detected[0].data == {
        "problem_id": problem["id"],
        "plant_id": rose.id,
        "title": "Gelbe Blätter",
    }
    assert hass.states.get("binary_sensor.rose_problem").state == "on"

    # a later photo tagged "problem" joins it, an untagged one does not
    second = await manager.async_add_photo(rose.id, make_image())
    await manager.async_update_photo(second.id, {"tags": ["problem"]})
    await manager.async_add_photo(rose.id, make_image())
    await hass.async_block_till_done()
    result = (await _call(client, type="plant_garden/problems/get", problem_id=problem["id"]))[
        "result"
    ]
    assert result["problem"]["photo_ids"] == [first.id, second.id]
    assert [e["kind"] for e in result["log"]] == ["photo"]

    msg = await _call(
        client,
        type="plant_garden/problems/log",
        problem_id=problem["id"],
        kind="action",
        text="Mit Brennnesseljauche gedüngt",
    )
    assert [e["kind"] for e in msg["result"]["log"]] == ["photo", "action"]
    msg = await _call(
        client, type="plant_garden/problems/update", problem_id=problem["id"], status="resolved"
    )
    assert msg["result"]["problem"]["resolved_at"] is not None
    assert msg["result"]["log"][-1] == {
        **msg["result"]["log"][-1],
        "kind": "status",
        "text": "resolved",
    }
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.rose_problem").state == "off"

    # reported by hand, with a photo of another plant refused
    tulip = await manager.async_create_plant({"name": "Tulpe"})
    other = await manager.async_add_photo(tulip.id, make_image())
    msg = await _call(
        client,
        type="plant_garden/problems/create",
        plant_id=rose.id,
        title="Mehltau",
        photo_ids=[other.id],
    )
    assert msg["error"]["code"] == "invalid_format"
    msg = await _call(
        client,
        type="plant_garden/problems/create",
        plant_id=rose.id,
        title="Mehltau",
        note="weißer Belag",
        observed_on="2026-06-01",
    )
    created = msg["result"]
    assert created["problem"]["observed_on"] == "2026-06-01"
    assert [e["text"] for e in created["log"]] == ["weißer Belag"]
    msg = await _call(
        client,
        type="plant_garden/problems/add_photo",
        problem_id=created["problem"]["id"],
        photo_id=other.id,
    )
    assert msg["error"]["code"] == "invalid_format"
    task = await loaded_entry.runtime_data.care.async_create_task(
        {"title": "Neues Foto", "problem_id": created["problem"]["id"]}
    )
    assert task.plant_id == rose.id  # from the problem
    await loaded_entry.runtime_data.care.async_complete_task(task.id)
    log = await loaded_entry.runtime_data.care.async_problem_log(created["problem"]["id"])
    assert [(e.kind, e.text) for e in log][-1] == ("action", "Neues Foto")
    msg = await _call(
        client, type="plant_garden/problems/delete", problem_id=created["problem"]["id"]
    )
    assert msg["success"]
    active = await loaded_entry.runtime_data.care.async_problems(rose.id, active_only=True)
    assert active == []


async def test_questions_chat_and_deleting_a_plant(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    data = loaded_entry.runtime_data
    rose = await data.manager.async_create_plant({"name": "Rose"})
    added = await data.care.async_add_questions(
        [
            {"plant_id": rose.id, "field": "soil_type", "question": "Welcher Boden?"},
            {"plant_id": rose.id, "field": None, "question": "welcher boden?"},  # same
            {"plant_id": "unknown", "question": "Wo steht der Kompost?"},
            {"question": "  "},
        ]
    )
    assert [(q.plant_id, q.field) for q in added] == [(rose.id, "soil_type"), (None, None)]
    listed = (await _call(client, type="plant_garden/questions/list", plant_id=rose.id))["result"]
    [question] = listed["questions"]
    msg = await _call(client, type="plant_garden/questions/answer", question_id=question["id"])
    assert msg["error"]["code"] == "invalid_format"
    msg = await _call(
        client,
        type="plant_garden/questions/answer",
        question_id=question["id"],
        answer="Sandiger Lehm",
    )
    assert msg["result"]["status"] == "answered"
    msg = await _call(
        client, type="plant_garden/questions/answer", question_id=added[1].id, dismiss=True
    )
    assert msg["result"]["status"] == "dismissed"
    assert (await _call(client, type="plant_garden/questions/list"))["result"]["questions"] == []
    msg = await _call(client, type="plant_garden/questions/answer", question_id="nope", answer="x")
    assert msg["error"]["code"] == "not_found"

    with patch.object(care_module, "CHAT_KEEP", 3):
        for i in range(5):
            await data.care.async_add_chat(rose.id, "user" if i % 2 == 0 else "assistant", f"m{i}")
        await data.care.async_add_chat(None, "user", "garden")
    history = await _call(client, type="plant_garden/assistant/chat/history", plant_id=rose.id)
    assert [m["text"] for m in history["result"]["messages"]] == ["m2", "m3", "m4"]
    msg = await _call(client, type="plant_garden/assistant/chat/clear", plant_id=rose.id)
    assert msg["success"]
    assert await data.care.async_chat(rose.id) == []
    assert [m.text for m in await data.care.async_chat(None)] == ["garden"]

    await data.care.async_create_task({"title": "Gießen", "plant_id": rose.id})
    await data.care.async_create_problem(rose.id, "Läuse")
    await data.care.async_add_chat(rose.id, "user", "Hallo")
    await data.manager.async_delete_plant(rose.id)
    await hass.async_block_till_done()
    assert await data.care.async_tasks() == []
    assert await data.care.async_problems() == []
    assert data.care.stats == {}


async def test_todo_list_both_ways(hass: HomeAssistant, loaded_entry: MockConfigEntry) -> None:
    data = loaded_entry.runtime_data
    rose = await data.manager.async_create_plant({"name": "Rose"})
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, f"plant_{rose.id}"), loaded_entry.entry_id
    )
    assert device is not None
    result = await hass.services.async_call(
        DOMAIN,
        "create_task",
        {"title": "Schneiden", "kind": "prune", "device_id": device.id, "repeat_every": 2,
         "repeat_unit": "weeks", "due": "2026-06-01"},
        blocking=True,
        return_response=True,
    )  # fmt: skip
    await hass.async_block_till_done()
    entity_id = "todo.garten_garden_tasks"
    assert hass.states.get(entity_id).state == "1"

    async def items() -> list[dict[str, Any]]:
        response = await hass.services.async_call(
            "todo", "get_items", {}, target={"entity_id": entity_id},
            blocking=True, return_response=True,
        )  # fmt: skip
        return response[entity_id]["items"]  # type: ignore[index,no-any-return]

    [item] = await items()
    assert item["summary"] == "Rose: Schneiden"
    assert item["uid"] == result["task_id"]  # type: ignore[index]
    assert item["due"] == "2026-06-01"

    # added in Home Assistant: linked to the plant by its name
    await hass.services.async_call(
        "todo", "add_item", {"item": "rose: Düngen", "due_date": "2026-06-05"},
        target={"entity_id": entity_id}, blocking=True,
    )  # fmt: skip
    await hass.async_block_till_done()
    tasks = await data.care.async_tasks()
    added = next(t for t in tasks if t.title == "Düngen")
    assert added.plant_id == rose.id
    assert added.due == date(2026, 6, 5)

    # ticked off in Home Assistant: done, the repeating task comes back
    await hass.services.async_call(
        "todo", "update_item", {"item": result["task_id"], "status": "completed"},  # type: ignore[index]
        target={"entity_id": entity_id}, blocking=True,
    )  # fmt: skip
    await hass.async_block_till_done()
    summaries = sorted((i["summary"], i["status"]) for i in await items())
    assert summaries == [
        ("Rose: Düngen", "needs_action"),
        ("Rose: Schneiden", "completed"),
        ("Rose: Schneiden", "needs_action"),
    ]
    await hass.services.async_call(
        "todo", "update_item",
        {"item": result["task_id"], "status": "needs_action", "rename": "Schneiden"},  # type: ignore[index]
        target={"entity_id": entity_id}, blocking=True,
    )  # fmt: skip
    reopened = await data.care.async_get_task(result["task_id"])  # type: ignore[index]
    assert reopened.status.value == "open"
    assert reopened.plant_id is None  # the plant prefix was removed
    await hass.services.async_call(
        "todo", "remove_item", {"item": [added.id]},
        target={"entity_id": entity_id}, blocking=True,
    )  # fmt: skip
    assert added.id not in {t.id for t in await data.care.async_tasks()}
    await hass.services.async_call(
        "todo", "add_item", {"item": "Kompost umsetzen"},
        target={"entity_id": entity_id}, blocking=True,
    )  # fmt: skip
    compost = next(t for t in await data.care.async_tasks() if t.title == "Kompost umsetzen")
    assert compost.plant_id is None


async def test_add_photo_action(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, tmp_path: Path
) -> None:
    data = loaded_entry.runtime_data
    rose = await data.manager.async_create_plant({"name": "Rose"})
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, f"plant_{rose.id}"), loaded_entry.entry_id
    )
    assert device is not None
    picture = tmp_path / "rose.jpg"
    picture.write_bytes(make_image())

    with pytest.raises(ServiceValidationError, match=r"path_not_allowed|not in a folder"):
        await hass.services.async_call(
            DOMAIN, "add_photo", {"device_id": device.id, "file_path": str(picture)},
            blocking=True,
        )  # fmt: skip
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "add_photo", {"device_id": device.id}, blocking=True)
    hass.config.allowlist_external_dirs = {str(tmp_path)}
    response = await hass.services.async_call(
        DOMAIN, "add_photo",
        {"device_id": device.id, "file_path": str(picture), "tags": ["problem"], "note": "Läuse"},
        blocking=True, return_response=True,
    )  # fmt: skip
    await hass.async_block_till_done()
    photos = await data.manager.async_list_photos(rose.id)
    assert [p.id for p in photos] == [response["photo_id"]]  # type: ignore[index]
    [problem] = await data.care.async_problems(rose.id)
    assert problem.title == "Läuse"

    # the camera integration itself needs PyTurboJPEG, which not every test setup has
    snapshot = AsyncMock(return_value=SimpleNamespace(content=make_image()))
    camera = SimpleNamespace(async_get_image=snapshot)
    with patch.dict(sys.modules, {"homeassistant.components.camera": camera}):
        await hass.services.async_call(
            DOMAIN, "add_photo", {"device_id": device.id, "camera_entity_id": "camera.garten"},
            blocking=True,
        )  # fmt: skip
    assert snapshot.call_args.args[1] == "camera.garten"
    assert len(await data.manager.async_list_photos(rose.id)) == 2
