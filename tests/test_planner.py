"""Plants the AI proposes for a place on the plan ("What fits here?")."""

from __future__ import annotations

from datetime import date
import json
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden import sun
from custom_components.plant_garden.ai import planner
from custom_components.plant_garden.ai.schemas import PLAN_SCHEMA, clean_plan, union_count
from custom_components.plant_garden.models import Plant, PlantCategory, Point, Shape, ShapeKind

from .test_assistant import MESSAGES, _call, _sent, claude, garden  # noqa: F401

PLAN = {
    "note": "Halbschattig und trocken unter der Traufe.",
    "suggestions": [
        {
            "name": "Elfenblume",
            "scientific_name": "Epimedium x versicolor",
            "category": "perennial",
            "reason": "Verträgt trockenen Schatten.",
            "light": "shade",
            "water_need": "low",
            "height_cm": 30,
            "width_cm": 40,
            "min_temperature_c": -25,
            "planting_months": [9, 3, 4, 9, 14, "x"],
            "neighbours": "Passt zu Farnen.",
            "caution": "",
        },
        {
            "name": "Funkie",
            "scientific_name": "",
            "category": "tree fern",
            "reason": "",
            "light": "",
            "water_need": "",
            "height_cm": 0,
            "width_cm": 0,
            "min_temperature_c": None,
            "planting_months": [],
            "neighbours": "",
            "caution": "Schnecken",
        },
        {"name": ""},
    ],
}


def _plant(plant_id: str, x: float, y: float, **fields: Any) -> Plant:
    now = dt_util.utcnow()
    return Plant(
        id=plant_id, name=plant_id, created_at=now, updated_at=now, position=Point(x, y), **fields
    )


def test_schema_and_cleaning() -> None:
    assert union_count(PLAN_SCHEMA) <= 16
    cleaned = clean_plan(PLAN)
    assert cleaned["note"].startswith("Halbschattig")
    first, second = cleaned["suggestions"]
    assert first["planting_months"] == [3, 4, 9]
    assert (first["category"], first["light"], first["water_need"]) == ("perennial", "shade", "low")
    assert (first["height_cm"], first["width_cm"], first["min_temperature_c"]) == (30, 40, -25)
    # unknown values become None, a nameless suggestion is dropped
    assert second["category"] is None
    assert second["scientific_name"] is None
    assert second["width_cm"] is None
    assert second["caution"] == "Schnecken"
    assert clean_plan({}) == {"note": None, "suggestions": []}
    assert (
        len(clean_plan({"suggestions": [{"name": f"P{i}"} for i in range(9)]})["suggestions"]) == 5
    )


def test_site_facts() -> None:
    bed = Shape(
        id="B",
        kind=ShapeKind.BED,
        label="Beet Nord",
        geometry={"type": "rect", "cx": 0, "cy": -6, "w": 8, "h": 4, "rotation": 0},
    )
    bed.soil_type = None
    house = Shape(
        id="H",
        kind=ShapeKind.HOUSE,
        geometry={"type": "rect", "cx": 0, "cy": 0, "w": 10, "h": 6, "rotation": 0},
    )
    zone = Shape(
        id="Z", kind=ShapeKind.ZONE, geometry={"type": "circle", "cx": 0, "cy": -6, "r": 3}
    )
    fern = _plant("Farn", 1.5, -5, category=PlantCategory.PERENNIAL, scientific_name="Dryopteris")
    far = _plant("Eiche", 30, 30, category=PlantCategory.TREE)
    shapes = [house, bed, zone]
    plants = [fern, far]
    blockers = sun.obstacles(shapes, plants, {}, {})
    site = planner.site_facts(
        0,
        -5,
        plants=plants,
        shapes=shapes,
        blockers=blockers,
        widths_cm={},
        heights_cm={},
        latitude=52.5,
        winter_low=-14.5,
        today=date(2027, 3, 10),
    )
    assert site["area"] == {"kind": "bed", "label": "Beet Nord"}
    assert site["irrigated"] is True
    assert site["under_a_roof"] is False
    assert site["soil"] is None
    assert site["light"] in ("shade", "partial_shade", "full_sun")
    assert len(site["sun_hours_by_month"]) == 12
    # the fern 1.5 m away with a 0.5 m crown leaves 1.25 m; the oak is far away
    assert site["free_radius_m"] == 1.2
    assert site["neighbours"] == [
        {
            "name": "Farn",
            "scientific_name": "Dryopteris",
            "category": "perennial",
            "distance_m": 1.5,
            "crown_m": 0.5,
        }
    ]
    assert site["garden_plants"] == ["Dryopteris", "Eiche"]
    assert site["coldest_night_last_year_c"] == -14.5
    assert (site["hemisphere"], site["month"]) == ("north", 3)
    # nothing that tells where the garden is
    assert not {"x", "y", "latitude", "longitude"} & set(site)


def test_planting_day() -> None:
    today = date(2027, 6, 20)
    assert planner.planting_day([], today) == today
    assert planner.planting_day([5, 6], today) == today
    assert planner.planting_day([9, 10], today) == date(2027, 9, 1)
    assert planner.planting_day([3], today) == date(2028, 3, 1)


async def test_plan_a_place_and_take_a_plant_over(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any],  # noqa: F811
) -> None:
    entry, rose = garden
    data = entry.runtime_data
    await data.manager.async_move_plants([(rose.id, Point(1, 0))])
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(PLAN)))
    client = await hass_ws_client(hass)

    msg = await _call(
        client, type="plant_garden/assistant/plan", x=2.5, y=0, wish="etwas für Bienen"
    )
    assert msg["success"], msg
    record = msg["result"]
    assert [s["name"] for s in record["suggestions"]] == ["Elfenblume", "Funkie"]
    assert record["site"]["neighbours"][0]["name"] == "Rose"
    assert record["note"].startswith("Halbschattig")

    body = _sent(aioclient_mock)
    text = body["messages"][0]["content"][-1]["text"]
    assert "etwas für Bienen" in text
    assert '"free_radius_m"' in text
    assert "Nachbarn" not in text  # the rose's notes stay at home
    assert body["output_config"]["format"]["type"] == "json_schema"
    [row] = await data.manager.async_usage_log(limit=5)
    assert row["feature"] == "plan"

    # take the first one over: a plant at the place, as an AI suggestion, with a task
    chosen = record["suggestions"][0]
    msg = await _call(
        client,
        type="plant_garden/assistant/plan/accept",
        plan_id=record["id"],
        suggestion_id=chosen["id"],
    )
    assert msg["success"], msg
    plant = data.manager.get_plant(msg["result"]["plant_id"])
    assert (plant.name, plant.scientific_name) == ("Elfenblume", "Epimedium x versicolor")
    assert (plant.position.x, plant.position.y) == (2.5, 0)
    assert (plant.category.value, plant.light.value, plant.water_need.value) == (
        "perennial",
        "shade",
        "low",
    )
    assert plant.min_temperature_c == -25
    assert plant.crown_diameter_m == 0.4
    assert plant.tags == ["planned"]
    assert plant.sources["scientific_name"].source.value == "ai"
    assert plant.sources["name"].source.value == "user"
    [task] = await data.care.async_tasks(plant.id)
    assert (task.title, task.source) == ("Plant Elfenblume", "ai")
    assert task.due == planner.planting_day([3, 4, 9], dt_util.now().date())

    # unknown ids, a place outside the plan, no provider
    msg = await _call(
        client, type="plant_garden/assistant/plan/accept", plan_id=record["id"], suggestion_id="x"
    )
    assert msg["error"]["code"] == "not_found"
    msg = await _call(client, type="plant_garden/assistant/plan", x=99999, y=0)
    assert msg["success"] is False
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, status=529, json={"error": {"message": "overloaded"}})
    msg = await _call(client, type="plant_garden/assistant/plan", x=2.5, y=0)
    assert msg["error"]["code"] == "ai_error"
