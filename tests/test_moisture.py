"""Soil moisture sensors linked to plants correct the water balance."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from homeassistant.core import HomeAssistant, State
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden import moisture
from custom_components.plant_garden.models import Plant
from custom_components.plant_garden.weather import open_meteo

from .test_weather import _entry, open_meteo_payload

SENSOR = "sensor.rose_moisture"
LOAM = {"fc": 0.27, "wp": 0.14}


def _plant(**fields: object) -> Plant:
    now = dt_util.utcnow()
    return Plant(id="P", name="Rose", created_at=now, updated_at=now, **fields)  # type: ignore[arg-type]


def _measure(plant: Plant, state: State | None, observed: float | None) -> moisture.Moisture:
    result = moisture.measure(
        plant, state, observed_max=observed, texture=LOAM, taw=78, now=dt_util.utcnow()
    )
    assert result is not None
    return result


def test_scale_from_the_user_or_learned() -> None:
    # nothing known yet
    assert moisture.scale_for(_plant(), None, LOAM) is None
    # learned: the wettest reading is field capacity, the wilting point follows the texture
    learned = moisture.scale_for(_plant(), 54.0, LOAM)
    assert learned == moisture.Scale(wet=54.0, dry=28.0, learned=True)
    # the user's values win
    own = moisture.scale_for(_plant(moisture_wet=40, moisture_dry=10), 54.0, LOAM)
    assert own == moisture.Scale(wet=40, dry=10, learned=False)
    # a scale without a range is none
    assert moisture.scale_for(_plant(moisture_wet=10, moisture_dry=10), None, LOAM) is None


def test_reading_becomes_depletion() -> None:
    scale = moisture.Scale(wet=40, dry=10, learned=False)
    assert moisture.depletion(40, scale, 78) == 0
    assert moisture.depletion(25, scale, 78) == 39
    assert moisture.depletion(10, scale, 78) == 78
    # readings outside the scale stay inside the bucket
    assert moisture.depletion(55, scale, 78) == 0
    assert moisture.depletion(2, scale, 78) == 78


def test_measure_states() -> None:
    now = dt_util.utcnow()
    plant = _plant(moisture_entity_id=SENSOR)
    assert (
        moisture.measure(_plant(), None, observed_max=None, texture=LOAM, taw=78, now=now) is None
    )
    # no state, an old one, or no number: unavailable
    assert _measure(plant, None, 50).status == "unavailable"
    old = State(SENSOR, "30", last_reported=now - timedelta(hours=30))
    assert _measure(plant, old, 50).status == "unavailable"
    assert _measure(plant, State(SENSOR, "unknown"), 50).status == ("unavailable")
    # a first reading is its own field capacity: the bucket is full
    first = _measure(plant, State(SENSOR, "30"), None)
    assert (first.status, first.depletion, first.scale.wet) == ("ok", 0, 30)
    # later readings sit on the learned scale (54 wet, 28 dry)
    later = _measure(plant, State(SENSOR, "41"), 54)
    assert later.depletion == 39
    assert later.as_dict() == {
        "status": "ok",
        "value": 41,
        "wet": 54,
        "dry": 28,
        "learned": True,
    }
    # a scale that cannot be: learning
    broken = _plant(moisture_entity_id=SENSOR, moisture_dry=80)
    assert _measure(broken, State(SENSOR, "41"), 54).status == "learning"


async def test_sensor_corrects_the_balance(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    hass_ws_client: WebSocketGenerator,
) -> None:
    today = dt_util.now().date()
    aioclient_mock.get(open_meteo.URL, json=open_meteo_payload(today - timedelta(days=30), 34))
    entry = _entry({"source": "open_meteo"})
    entry.add_to_hass(hass)
    hass.states.async_set(SENSOR, "30", {"unit_of_measurement": "%"})
    with patch(
        "custom_components.plant_garden.water.async_observed_max", return_value={SENSOR: 40.0}
    ):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        manager = entry.runtime_data.manager
        rose = await manager.async_create_plant(
            {"name": "Rose", "category": "shrub", "position": {"x": 0, "y": 0}}
        )
        await hass.services.async_call("plant_garden", "refresh_weather", blocking=True)
        await hass.async_block_till_done()
        client = await hass_ws_client(hass)

        async def summary() -> dict:
            await client.send_json_auto_id({"type": "plant_garden/water/summary"})
            return (await client.receive_json())["result"]["plants"][rose.id]

        # the model alone: a month without rain empties the bucket
        before = await summary()
        assert before["depletion"] == 77.5
        assert before["moisture"] is None
        assert before["model_depletion"] is None

        # link the sensor with the user's scale: 30 between 40 (wet) and 20 (dry)
        await client.send_json_auto_id(
            {
                "type": "plant_garden/plants/update",
                "plant_id": rose.id,
                "moisture_entity_id": SENSOR,
                "moisture_dry": 20,
            }
        )
        assert (await client.receive_json())["success"]
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=5))
        await hass.async_block_till_done()
        measured = await summary()
        assert measured["moisture"] == {
            "status": "ok",
            "value": 30,
            "wet": 40,
            "dry": 20,
            "learned": True,
        }
        assert measured["depletion"] == 39  # half of 78 mm
        assert measured["model_depletion"] == 77.5
        assert measured["needs_water"] is False  # not beyond RAW (39 mm)
        assert measured["outlook"][0]["depletion"] == 39
        assert hass.states.get("sensor.rose_soil_water_deficit").state == "39.0"

        # the sensor dries: recomputed a minute later, the plant needs water
        hass.states.async_set(SENSOR, "24", {"unit_of_measurement": "%"})
        await hass.async_block_till_done()
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=61))
        await hass.async_block_till_done()
        dry = await summary()
        assert dry["depletion"] == pytest.approx(62.4)
        assert dry["needs_water"] is True
        assert hass.states.get("binary_sensor.rose_needs_water").state == "on"

        # without a reading the model takes over again
        hass.states.async_set(SENSOR, "unavailable")
        await hass.async_block_till_done()
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=61))
        await hass.async_block_till_done()
        gone = await summary()
        assert gone["moisture"]["status"] == "unavailable"
        assert gone["depletion"] == 77.5
        assert gone["model_depletion"] is None

        # only sensors can be linked
        await client.send_json_auto_id(
            {
                "type": "plant_garden/plants/update",
                "plant_id": rose.id,
                "moisture_entity_id": "switch.pump",
            }
        )
        assert (await client.receive_json())["success"] is False
