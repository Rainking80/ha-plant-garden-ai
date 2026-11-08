"""Irrigation zones: coverage, water per plant, run tracking, sensors, actions."""

from __future__ import annotations

from datetime import timedelta
import math
from typing import Any
from unittest.mock import MagicMock, patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, State
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr, issue_registry as ir
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
)
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden import async_remove_config_entry_device
from custom_components.plant_garden.const import DOMAIN, EVENT_IRRIGATION_FINISHED
from custom_components.plant_garden.garden import GardenManager
from custom_components.plant_garden.geometry import (
    area,
    bounds,
    contains,
    crown_diameter,
    footprints,
    share_inside,
    zone_coverage,
)
from custom_components.plant_garden.irrigation import IrrigationTracker, distribute
from custom_components.plant_garden.models import (
    Emitter,
    Irrigation,
    Plant,
    PlantCategory,
    Point,
    Shape,
    ShapeKind,
    WaterSource,
)

VALVE = "input_boolean.zone_lawn"
START = "2027-06-01 10:00:00+00:00"  # ahead of the real clock: timers only run forward
SQUARE = {"type": "rect", "cx": 0, "cy": 0, "w": 4, "h": 4, "rotation": 0}


def _plant(plant_id: str, x: float, y: float, crown: float = 1.0) -> Plant:
    now = dt_util.utcnow()
    return Plant(
        id=plant_id,
        name=plant_id,
        created_at=now,
        updated_at=now,
        position=Point(x=x, y=y),
        crown_diameter_m=crown,
    )


def _zone(geometry: dict[str, Any] = SQUARE, **settings: Any) -> Shape:
    return Shape(
        id="Z",
        kind=ShapeKind.ZONE,
        geometry=geometry,
        irrigation=Irrigation(**settings),
    )


# ---------------------------------------------------------------- geometry
def test_point_in_shapes_and_areas() -> None:
    rotated = {"type": "rect", "cx": 0, "cy": 0, "w": 4, "h": 1, "rotation": 90}
    assert contains(rotated, 0, 1.5)  # turned upright
    assert not contains(rotated, 1.5, 0)
    assert area(rotated) == 4
    assert bounds(rotated) == pytest.approx((-0.5, -2, 0.5, 2))
    circle = {"type": "circle", "cx": 1, "cy": 1, "r": 1}
    assert contains(circle, 1.5, 1.5)
    assert area(circle) == pytest.approx(math.pi)
    triangle = {"type": "polygon", "points": [[0, 0], [4, 0], [0, 4]]}
    assert contains(triangle, 1, 1)
    assert not contains(triangle, 3, 3)
    assert area(triangle) == 8
    assert bounds(triangle) == (0, 0, 4, 4)


def test_crown_diameter_falls_back_to_width_and_category() -> None:
    plant = _plant("A", 0, 0, crown=0)
    plant.crown_diameter_m = None
    plant.category = PlantCategory.TREE
    assert crown_diameter(plant) == 4
    assert crown_diameter(plant, 150) == 1.5
    plant.crown_diameter_m = 2
    assert crown_diameter(plant, 150) == 2


def test_share_inside_and_coverage() -> None:
    prints = footprints([_plant("in", 0, 0), _plant("edge", 2, 0), _plant("out", 9, 9)], [])
    assert share_inside(SQUARE, prints["in"]) == 1
    assert share_inside(SQUARE, prints["edge"]) == pytest.approx(0.5, abs=0.05)
    assert share_inside(SQUARE, prints["out"]) == 0
    zone = _zone(include=["out"], exclude=["in"])
    coverage = zone_coverage(zone, prints)
    assert set(coverage) == {"edge", "out"}
    assert coverage["out"] == 1


def test_linked_area_is_the_footprint() -> None:
    lawn = _plant("lawn", 50, 50)
    shape = Shape(
        id="L",
        kind=ShapeKind.LAWN,
        geometry={"type": "rect", "cx": 0, "cy": 0, "w": 2, "h": 2, "rotation": 0},
        plant_id="lawn",
    )
    unplaced = _plant("unplaced", 0, 0)
    unplaced.position = None
    prints = footprints([lawn, unplaced], [shape])
    assert prints["lawn"].area == 4  # the lawn area, not the crown at (50, 50)
    assert "unplaced" not in prints


# ---------------------------------------------------------------- water per plant
def test_area_zone_spreads_its_water() -> None:
    prints = footprints([_plant("A", 0, 0), _plant("B", 2, 0)], [])
    zone = _zone(emitter=Emitter.ROTOR, rate_mm_h=10)
    source, liters, depth, plants = distribute(zone, 0.5, prints)
    assert source is WaterSource.ESTIMATE
    assert liters == 80  # 10 mm/h x 0.5 h x 16 m²
    assert depth == 3.75  # x 75 % efficiency / 16 m²
    by_id = {p.plant_id: p for p in plants}
    assert by_id["A"].mm == 3.75
    assert by_id["A"].liters == pytest.approx(3.75 * math.pi * 0.25, abs=0.001)
    assert by_id["B"].mm == pytest.approx(3.75 / 2, abs=0.2)


def test_flow_meter_and_unknown_rates() -> None:
    prints = footprints([_plant("A", 0, 0)], [])
    zone = _zone(flow_l_min=10, efficiency=1)
    assert distribute(zone, 0.5, prints)[1:3] == (300, 18.75)
    assert distribute(zone, 0.5, prints, meter_liters=32)[:3] == (WaterSource.METER, 32, 2)
    assert distribute(_zone(), 1, prints) == (WaterSource.UNKNOWN, None, None, [])
    no_settings = Shape(id="X", kind=ShapeKind.ZONE, geometry=SQUARE)
    assert distribute(no_settings, 1, prints)[0] is WaterSource.UNKNOWN


def test_drip_waters_each_reached_plant() -> None:
    prints = footprints([_plant("A", 0, 0), _plant("B", 1, 1), _plant("far", 9, 9)], [])
    zone = _zone(emitter=Emitter.DRIP, drip_l_h=2)
    source, liters, depth, plants = distribute(zone, 1, prints)
    assert (source, liters, depth) == (WaterSource.ESTIMATE, 4, None)
    assert [(p.plant_id, p.liters) for p in plants] == [("A", 1.8), ("B", 1.8)]
    assert plants[0].mm == pytest.approx(1.8 / (math.pi * 0.25), abs=0.001)
    assert distribute(zone, 1, prints, meter_liters=10)[3][0].liters == 4.5
    by_flow = _zone(emitter=Emitter.DRIP, flow_l_min=1)
    assert distribute(by_flow, 1, prints)[1] == 60
    assert distribute(_zone(emitter=Emitter.DRIP), 1, prints)[0] is WaterSource.UNKNOWN
    empty = distribute(zone, 1, {})
    assert empty[1] == 0
    assert empty[3] == []


# ---------------------------------------------------------------- tracking
ZONE_DATA = {
    "kind": "zone",
    "label": "Rasen",
    "geometry": SQUARE,
    "irrigation": {"entity_id": VALVE, "emitter": "rotor", "rate_mm_h": 10},
}


async def _garden(
    hass: HomeAssistant, entry: MockConfigEntry
) -> tuple[GardenManager, IrrigationTracker, Shape]:
    manager: GardenManager = entry.runtime_data.manager
    tracker: IrrigationTracker = entry.runtime_data.irrigation
    await manager.async_create_plant(
        {"name": "Rose", "position": {"x": 0, "y": 0}, "crown_diameter_m": 1}
    )
    hass.states.async_set(VALVE, "off")
    zone = await manager.async_save_shape(ZONE_DATA)
    await hass.async_block_till_done()
    return manager, tracker, zone


async def test_zone_run_waters_the_plants(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, mock_config_entry: MockConfigEntry
) -> None:
    freezer.move_to(START)
    mock_config_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()
    manager, tracker, zone = await _garden(hass, mock_config_entry)
    finished = async_capture_events(hass, EVENT_IRRIGATION_FINISHED)

    hass.states.async_set(VALVE, "on")
    await hass.async_block_till_done()
    assert tracker.running_since(zone.id) == dt_util.utcnow()
    freezer.tick(timedelta(minutes=10))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.rasen_run_time_today").state == "10.0"

    freezer.tick(timedelta(minutes=20))
    hass.states.async_set(VALVE, "off")
    await hass.async_block_till_done()

    [event] = await manager.async_recent_events()
    assert event.duration_s == 1800
    assert (event.source, event.liters, event.depth_mm) == (WaterSource.ESTIMATE, 80, 3.75)
    assert not event.uncertain
    assert not event.reconstructed
    [share] = event.plants
    assert share.mm == 3.75
    assert finished[0].data["duration_s"] == 1800
    assert finished[0].data["zone"] == "Rasen"

    summary = tracker.summary()
    rose = next(iter(summary["plants"].values()))
    assert rose["today_mm"] == 3.75
    assert rose["days"][-1]["mm"] == 3.75
    assert summary["zones"][zone.id]["running_since"] is None
    assert hass.states.get("sensor.rose_water_today").state == "3.75"
    assert float(hass.states.get("sensor.rose_water_received").state) == pytest.approx(2.95, 0.01)
    assert hass.states.get("sensor.rose_last_watering").state == dt_util.utcnow().isoformat()
    assert hass.states.get("sensor.rasen_run_time_today").state == "30.0"
    assert hass.states.get("sensor.rasen_water_today").state == "80.0"

    # a new day starts at zero
    freezer.tick(timedelta(days=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.rose_water_today").state == "0.0"


async def test_glitches_and_unavailable(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, loaded_entry: MockConfigEntry
) -> None:
    freezer.move_to(START)
    manager, _, _ = await _garden(hass, loaded_entry)
    hass.states.async_set(VALVE, "on")
    freezer.tick(timedelta(seconds=2))
    hass.states.async_set(VALVE, "off")
    await hass.async_block_till_done()
    assert await manager.async_recent_events() == []  # a click, not irrigation

    hass.states.async_set(VALVE, "on")
    freezer.tick(timedelta(minutes=5))
    hass.states.async_set(VALVE, "unavailable")
    await hass.async_block_till_done()
    [event] = await manager.async_recent_events()
    assert event.uncertain
    assert event.duration_s == 300


@pytest.mark.parametrize(
    "case",
    [
        ("1.5", "1.532", "m³", WaterSource.METER, 32),
        ("900", "20", "L", WaterSource.ESTIMATE, 13.333),  # meter reset: estimate instead
        ("1", "2", "W", WaterSource.ESTIMATE, 13.333),  # not a volume
        ("1", "unknown", "L", WaterSource.ESTIMATE, 13.333),
    ],
)
async def test_meter_counts_real_litres(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    loaded_entry: MockConfigEntry,
    case: tuple[str, str, str, WaterSource, float],
) -> None:
    start, end, unit, source, liters = case
    freezer.move_to(START)
    manager: GardenManager = loaded_entry.runtime_data.manager
    hass.states.async_set(VALVE, "off")
    hass.states.async_set("sensor.meter", start, {"unit_of_measurement": unit})
    settings = {**ZONE_DATA["irrigation"], "meter_entity_id": "sensor.meter"}  # type: ignore[dict-item]
    await manager.async_save_shape({**ZONE_DATA, "irrigation": settings})
    await hass.async_block_till_done()
    hass.states.async_set(VALVE, "on")
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=5))
    hass.states.async_set("sensor.meter", end, {"unit_of_measurement": unit})
    hass.states.async_set(VALVE, "off")
    await hass.async_block_till_done()
    [event] = await manager.async_recent_events()
    assert event.source is source
    assert event.liters == pytest.approx(liters, abs=0.001)


async def test_open_run_survives_a_restart(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, loaded_entry: MockConfigEntry
) -> None:
    freezer.move_to(START)
    manager, _, zone = await _garden(hass, loaded_entry)
    hass.states.async_set(VALVE, "on")
    await hass.async_block_till_done()
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    await hass.async_block_till_done()

    freezer.tick(timedelta(minutes=20))
    hass.states.async_set(VALVE, "off")  # while the integration was not running
    freezer.tick(timedelta(minutes=5))
    assert await hass.config_entries.async_setup(loaded_entry.entry_id)
    await hass.async_block_till_done()

    manager = loaded_entry.runtime_data.manager
    [event] = await manager.async_recent_events(zone_id=zone.id)
    assert event.duration_s == 1200
    assert event.reconstructed


async def test_history_fills_gaps(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, loaded_entry: MockConfigEntry
) -> None:
    freezer.move_to(START)
    _, _, zone = await _garden(hass, loaded_entry)
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    await hass.async_block_till_done()
    began = dt_util.utcnow() + timedelta(minutes=10)
    ended = began + timedelta(minutes=15)
    freezer.tick(timedelta(hours=1))
    history = [
        State(VALVE, "off", last_changed=dt_util.utcnow() - timedelta(hours=2)),
        State(VALVE, "on", last_changed=began),
        State(VALVE, "off", last_changed=ended),
    ]
    recorder = MagicMock()
    recorder.async_add_executor_job = hass.async_add_executor_job
    hass.config.components.add("recorder")
    with (
        patch("custom_components.plant_garden.irrigation.get_instance", return_value=recorder),
        patch(
            "custom_components.plant_garden.irrigation.history.state_changes_during_period",
            return_value={VALVE: history},
        ),
    ):
        assert await hass.config_entries.async_setup(loaded_entry.entry_id)
        await hass.async_block_till_done()
    manager: GardenManager = loaded_entry.runtime_data.manager
    [event] = await manager.async_recent_events(zone_id=zone.id)
    assert (event.started_at, event.ended_at) == (began, ended)
    assert event.reconstructed

    # a failing recorder only costs the gap, not the setup
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    with (
        patch("custom_components.plant_garden.irrigation.get_instance", return_value=recorder),
        patch(
            "custom_components.plant_garden.irrigation.history.state_changes_during_period",
            side_effect=RuntimeError("db gone"),
        ),
    ):
        assert await hass.config_entries.async_setup(loaded_entry.entry_id)
        await hass.async_block_till_done()


async def test_long_run_raises_a_repair_issue(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, loaded_entry: MockConfigEntry
) -> None:
    freezer.move_to(START)
    _, _, zone = await _garden(hass, loaded_entry)
    issues = ir.async_get(hass)
    hass.states.async_set(VALVE, "on")
    freezer.tick(timedelta(hours=7))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    issue = issues.async_get_issue(DOMAIN, f"long_run_{zone.id}")
    assert issue is not None
    assert issue.translation_placeholders == {"zone": "Rasen", "entity": VALVE, "hours": "7.0"}
    hass.states.async_set(VALVE, "off")
    await hass.async_block_till_done()
    assert issues.async_get_issue(DOMAIN, f"long_run_{zone.id}") is None


async def test_relinking_and_removing_zones(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, loaded_entry: MockConfigEntry
) -> None:
    freezer.move_to(START)
    manager, tracker, zone = await _garden(hass, loaded_entry)
    hass.states.async_set(VALVE, "on")
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=3))
    hass.states.async_set("switch.other", "on")
    relinked = {**ZONE_DATA, "id": zone.id, "irrigation": {"entity_id": "switch.other"}}
    await manager.async_save_shape(relinked)
    await hass.async_block_till_done()
    # the old valve's run ended, the new entity is running from now on
    [event] = await manager.async_recent_events()
    assert event.duration_s == 180
    assert event.source is WaterSource.UNKNOWN  # the relinked zone has no rate
    assert tracker.running_since(zone.id) == dt_util.utcnow()

    await manager.async_delete_shape(zone.id)
    await hass.async_block_till_done()
    assert tracker.running_since(zone.id) is None
    assert tracker.summary()["zones"] == {}


# ---------------------------------------------------------------- panel API
async def test_websocket_irrigation_commands(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    manager, _, zone = await _garden(hass, loaded_entry)
    rose = manager.plants[0]
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "plant_garden/irrigation/log",
            "plants": [{"plant_id": rose.id, "liters": 5}],
            "note": "Gießkanne",
        }
    )
    manual = (await client.receive_json())["result"]
    assert manual["source"] == "manual"
    assert manual["plants"] == [
        {"plant_id": rose.id, "liters": 5, "mm": round(5 / (math.pi * 0.25), 3)}
    ]

    await client.send_json_auto_id(
        {"type": "plant_garden/irrigation/log_zone", "zone_id": zone.id, "minutes": 6}
    )
    run = (await client.receive_json())["result"]
    assert (run["duration_s"], run["liters"]) == (360, 16)

    await client.send_json_auto_id(
        {
            "type": "plant_garden/irrigation/log_zone",
            "zone_id": zone.id,
            "minutes": 6,
            "end": run["ended_at"],
        }
    )
    assert (await client.receive_json())["error"]["code"] == "invalid_format"  # same run twice

    await client.send_json_auto_id({"type": "plant_garden/irrigation/summary"})
    summary = (await client.receive_json())["result"]
    # 5 L by hand + 0.75 mm over the rose's 0.785 m² crown from the zone
    assert summary["plants"][rose.id]["total_l"] == pytest.approx(5 + 0.75 * math.pi / 4, abs=0.01)
    assert summary["zones"][zone.id]["runtime_today_s"] == 360

    await client.send_json_auto_id(
        {"type": "plant_garden/irrigation/events", "plant_id": rose.id, "limit": 1}
    )
    assert len((await client.receive_json())["result"]["events"]) == 1
    await client.send_json_auto_id({"type": "plant_garden/irrigation/events", "zone_id": zone.id})
    assert [e["id"] for e in (await client.receive_json())["result"]["events"]] == [run["id"]]

    await client.send_json_auto_id(
        {"type": "plant_garden/irrigation/delete", "event_id": run["id"]}
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id(
        {"type": "plant_garden/irrigation/delete", "event_id": run["id"]}
    )
    assert (await client.receive_json())["error"]["code"] == "not_found"
    await client.send_json_auto_id({"type": "plant_garden/irrigation/events"})
    assert [e["id"] for e in (await client.receive_json())["result"]["events"]] == [manual["id"]]


@pytest.mark.parametrize(
    ("irrigation", "code"),
    [
        ({"entity_id": "light.kitchen"}, "invalid_format"),
        ({"timer_entity_id": "switch.x"}, "invalid_format"),
        ({"efficiency": 2}, "invalid_format"),
        ({"include": ["nope"]}, "not_found"),
    ],
)
async def test_zone_settings_are_validated(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    loaded_entry: MockConfigEntry,
    irrigation: dict[str, Any],
    code: str,
) -> None:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "plant_garden/layout/shapes/save",
            "shape": {"kind": "zone", "geometry": SQUARE, "irrigation": irrigation},
        }
    )
    assert (await client.receive_json())["error"]["code"] == code


async def test_zone_settings_round_trip_and_plant_removal(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    manager, _, zone = await _garden(hass, loaded_entry)
    rose = manager.plants[0]
    saved = await manager.async_save_shape(
        {**ZONE_DATA, "id": zone.id, "irrigation": {"include": [rose.id], "exclude": []}}
    )
    assert saved.irrigation is not None
    assert saved.as_dict()["irrigation"]["include"] == [rose.id]
    assert Shape.from_dict(saved.as_dict()).irrigation == saved.irrigation
    await manager.async_delete_plant(rose.id)
    assert manager.get_zone(zone.id).irrigation.include == []  # type: ignore[union-attr]
    bed = await manager.async_save_shape({"kind": "bed", "geometry": SQUARE})
    assert bed.irrigation is None
    with pytest.raises(Exception, match=bed.id):
        manager.get_zone(bed.id)


# ---------------------------------------------------------------- action and devices
async def test_log_watering_action(hass: HomeAssistant, loaded_entry: MockConfigEntry) -> None:
    manager, _, zone = await _garden(hass, loaded_entry)
    rose = manager.plants[0]
    devices = dr.async_get(hass)
    plant_device = devices.async_get_device_by_identifier(
        (DOMAIN, f"plant_{rose.id}"), loaded_entry.entry_id
    )
    zone_device = devices.async_get_device_by_identifier(
        (DOMAIN, f"zone_{zone.id}"), loaded_entry.entry_id
    )
    garden = devices.async_get_device_by_identifier((DOMAIN, "garden"), loaded_entry.entry_id)
    assert plant_device is not None
    assert zone_device is not None
    assert garden is not None
    assert plant_device.via_device_id == garden.id

    await hass.services.async_call(
        DOMAIN,
        "log_watering",
        {"device_id": [plant_device.id, zone_device.id], "liters": 3, "minutes": 3},
        blocking=True,
    )
    events = await manager.async_recent_events()
    assert sorted(e.source.value for e in events) == ["estimate", "manual"]

    for data, key in (
        ({"device_id": plant_device.id}, "liters_needed"),
        ({"device_id": zone_device.id}, "minutes_needed"),
        ({"device_id": garden.id, "liters": 1}, "not_plant_or_zone"),
    ):
        with pytest.raises(ServiceValidationError) as err:
            await hass.services.async_call(DOMAIN, "log_watering", data, blocking=True)
        assert err.value.translation_key == key

    await manager.async_delete_shape(zone.id)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "log_watering", {"device_id": zone_device.id, "minutes": 1}, blocking=True
        )


async def test_action_without_garden(hass: HomeAssistant, loaded_entry: MockConfigEntry) -> None:
    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "log_watering", {"device_id": "x", "liters": 1}, blocking=True
        )


async def test_devices_follow_plants_and_zones(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    manager, _, zone = await _garden(hass, loaded_entry)
    rose = manager.plants[0]
    devices = dr.async_get(hass)
    await manager.async_update_plant(rose.id, {"name": "Edelrose", "scientific_name": "Rosa"})
    await hass.async_block_till_done()
    device = devices.async_get_device_by_identifier(
        (DOMAIN, f"plant_{rose.id}"), loaded_entry.entry_id
    )
    assert device is not None
    assert (device.name, device.model) == ("Edelrose", "Rosa")
    assert not await async_remove_config_entry_device(hass, loaded_entry, device)

    # unnamed zones take the name of their entity
    hass.states.async_set(VALVE, "off", {"friendly_name": "Regner"})
    await manager.async_save_shape({**ZONE_DATA, "id": zone.id, "label": None})
    await hass.async_block_till_done()
    zone_device = devices.async_get_device_by_identifier(
        (DOMAIN, f"zone_{zone.id}"), loaded_entry.entry_id
    )
    assert zone_device is not None
    assert zone_device.name == "Regner"

    await manager.async_delete_plant(rose.id)
    await manager.async_delete_shape(zone.id)
    await hass.async_block_till_done()
    assert devices.async_get(device.id) is None
    assert devices.async_get(zone_device.id) is None
    stale = devices.async_get_or_create(
        config_entry_id=loaded_entry.entry_id, identifiers={(DOMAIN, f"plant_{rose.id}")}
    )
    assert await async_remove_config_entry_device(hass, loaded_entry, stale)


async def test_unnamed_zone_without_entity(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    manager: GardenManager = loaded_entry.runtime_data.manager
    zone = await manager.async_save_shape({"kind": "zone", "geometry": SQUARE})
    await hass.async_block_till_done()
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, f"zone_{zone.id}"), loaded_entry.entry_id
    )
    assert device is not None
    assert device.name == "Irrigation zone"
