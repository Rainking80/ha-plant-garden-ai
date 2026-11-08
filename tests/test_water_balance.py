"""Soil water bucket, merging weather sources, zone advice (pure functions)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest

from custom_components.plant_garden.models import (
    Emitter,
    Irrigation,
    LocationType,
    Plant,
    PlantCategory,
    Point,
    Shape,
    ShapeKind,
    SoilType,
    WaterNeed,
)
from custom_components.plant_garden.water import (
    PlantWaterState,
    expected_rain,
    fill_et0,
    merge,
    zone_advice,
)
from custom_components.plant_garden.water_balance import (
    BalanceDay,
    SoilWater,
    WeatherDay,
    crop_coefficient,
    effective_rain,
    load_defaults,
    run_balance,
    soil_water,
)
from custom_components.plant_garden.weather.base import DailyWeather

DEFAULTS = load_defaults()
DAY = date(2026, 7, 1)
BED = {"type": "rect", "cx": 0, "cy": 0, "w": 4, "h": 4, "rotation": 0}


def _plant(**fields: Any) -> Plant:
    from homeassistant.util import dt as dt_util  # noqa: PLC0415 - keeps the import local

    now = dt_util.utcnow()
    return Plant(id="P", name="P", created_at=now, updated_at=now, **fields)


def test_defaults_have_sources_for_every_table() -> None:
    assert set(DEFAULTS["_sources"]) >= {"soil", "landscape_coefficient", "lawn", "rain"}
    assert set(DEFAULTS["soil"]) == {soil.value for soil in SoilType}
    assert set(DEFAULTS["root_depth_m"]) == {c.value for c in PlantCategory}


def test_soil_water_from_bed_pot_and_shelter() -> None:
    shrub = _plant(category=PlantCategory.SHRUB, position=Point(x=1, y=1))
    sandy = Shape(id="B", kind=ShapeKind.BED, geometry=BED, soil_type=SoilType.SAND)
    water = soil_water(shrub, [sandy], DEFAULTS)
    # sand: (0.12 - 0.045) x 0.6 m root zone = 45 mm, half of it readily available
    assert (water.soil, water.taw, water.raw, water.sheltered) == ("sand", 45, 22.5, False)

    # an explicit soil and root depth win; loam is the default
    deep = _plant(category=PlantCategory.SHRUB, soil_type=SoilType.CLAY, root_depth_cm=100)
    assert soil_water(deep, [sandy], DEFAULTS).taw == pytest.approx(140)
    assert soil_water(_plant(), [], DEFAULTS).soil == "loam"

    pot = _plant(location_type=LocationType.POT)
    potted = soil_water(pot, [], DEFAULTS)
    assert (potted.soil, potted.root_depth_m) == ("potting_mix", 0.25)

    roof = Shape(id="R", kind=ShapeKind.ROOF, geometry=BED)
    assert soil_water(shrub, [roof], DEFAULTS).sheltered
    assert soil_water(_plant(location_type=LocationType.GREENHOUSE), [], DEFAULTS).sheltered
    vegetable = soil_water(_plant(category=PlantCategory.VEGETABLE), [], DEFAULTS)
    assert vegetable.raw == pytest.approx(0.4 * vegetable.taw)


def test_crop_coefficients() -> None:
    assert crop_coefficient(_plant(category=PlantCategory.LAWN), DAY, DEFAULTS) == 0.8
    assert crop_coefficient(_plant(water_need=WaterNeed.HIGH), DAY, DEFAULTS) == 0.8
    assert crop_coefficient(_plant(water_need=WaterNeed.VERY_LOW), DAY, DEFAULTS) == 0.1
    assert crop_coefficient(_plant(), DAY, DEFAULTS) == 0.5  # moderate by default
    tomato = _plant(category=PlantCategory.VEGETABLE, planted_on=DAY)
    assert crop_coefficient(tomato, DAY + timedelta(days=10), DEFAULTS) == 0.6
    assert crop_coefficient(tomato, DAY + timedelta(days=40), DEFAULTS) == 1.05
    assert crop_coefficient(tomato, DAY + timedelta(days=100), DEFAULTS) == 0.85
    assert crop_coefficient(tomato, DAY - timedelta(days=1), DEFAULTS) == 1.05  # not planted yet
    assert crop_coefficient(_plant(category=PlantCategory.VEGETABLE), DAY, DEFAULTS) == 1.05


def test_effective_rain() -> None:
    assert effective_rain(1.5, DEFAULTS) == 0
    assert effective_rain(12, DEFAULTS) == pytest.approx(8)


def test_bucket_fills_empties_and_stops_at_its_limits() -> None:
    plant = _plant()  # moderate: ETc = 0.5 x ET0
    water = SoilWater(soil="loam", root_depth_m=0.4, taw=52, raw=26, sheltered=False)
    days = [WeatherDay(day=DAY + timedelta(days=i), et0=6, rain=0) for i in range(10)]
    balance = run_balance(plant, water, days, {}, DEFAULTS)
    assert [d.depletion for d in balance[:3]] == [3, 6, 9]
    assert balance[-1].depletion == 30
    # rain and irrigation refill, never above field capacity
    wet = [*days[:2], WeatherDay(day=DAY + timedelta(days=2), et0=None, rain=30)]
    refilled = run_balance(plant, water, wet, {DAY: 1.0}, DEFAULTS)
    assert [d.depletion for d in refilled] == [2, 5, 0]
    assert (refilled[0].irrigation, refilled[2].rain, refilled[2].etc) == (1.0, 22.4, 0)
    # never drier than empty
    dry = run_balance(plant, water, days, {}, DEFAULTS, start_depletion=50)
    assert dry[-1].depletion == 52
    sheltered = replace_sheltered(water)
    assert run_balance(plant, sheltered, wet, {}, DEFAULTS)[2].rain == 0


def replace_sheltered(water: SoilWater) -> SoilWater:
    return SoilWater(
        soil=water.soil,
        root_depth_m=water.root_depth_m,
        taw=water.taw,
        raw=water.raw,
        sheltered=True,
    )


# ---------------------------------------------------------------- merging sources
def test_merge_prefers_earlier_sources_and_fills_gaps() -> None:
    own = [DailyWeather(day=DAY, precip_mm=4.0, source="home_assistant")]
    service = [
        DailyWeather(day=DAY, precip_mm=9.0, t_max=25, t_min=12, source="open_meteo"),
        DailyWeather(day=DAY + timedelta(days=1), precip_mm=1.0, source="open_meteo"),
    ]
    merged = merge([own, service])
    assert [(d.precip_mm, d.t_max, d.source) for d in merged] == [
        (4.0, 25, "home_assistant"),
        (1.0, None, "open_meteo"),
    ]
    restored = DailyWeather.from_dict(merged[0].as_dict())
    assert restored == merged[0]


def test_fill_et0_uses_the_best_method() -> None:
    days = [
        DailyWeather(day=DAY, et0_mm=4.2, source="open_meteo"),
        DailyWeather(day=DAY + timedelta(days=1), t_max=25, t_min=12),
        DailyWeather(day=DAY + timedelta(days=2), t_max=25, t_min=12, rh_mean=60, wind_2m=2),
        DailyWeather(day=DAY + timedelta(days=3)),
    ]
    filled, methods = fill_et0(days, 52.5, 30)
    assert [d.et0_mm is not None for d in filled] == [True, True, True, False]
    assert list(methods.values()) == ["open_meteo", "hargreaves", "penman_monteith"]


def test_expected_rain_weights_the_probability() -> None:
    weather = [
        DailyWeather(day=DAY + timedelta(days=1), precip_mm=12, rain_probability=50),
        DailyWeather(day=DAY + timedelta(days=2), precip_mm=7),
        DailyWeather(day=DAY + timedelta(days=3), precip_mm=30),  # too far ahead
    ]
    assert expected_rain(weather, DAY, DEFAULTS) == pytest.approx(8 * 0.5 + 4)


# ---------------------------------------------------------------- zone advice
def _state(depletion: float, raw: float = 20, sheltered: bool = False) -> PlantWaterState:
    soil = SoilWater(soil="loam", root_depth_m=0.4, taw=52, raw=raw, sheltered=sheltered)
    return PlantWaterState(
        soil=soil,
        depletion=depletion,
        needs_water=depletion > raw,
        frost=None,
        days=[
            BalanceDay(day=DAY, et0=5, kc=0.5, etc=2.5, rain=0, irrigation=0, depletion=depletion)
        ],
    )


def _zone(**settings: Any) -> Shape:
    return Shape(id="Z", kind=ShapeKind.ZONE, geometry=BED, irrigation=Irrigation(**settings))


def test_zone_advice() -> None:
    plants = {"A": _state(30), "B": _state(5)}
    areas = {"A": 1.0, "B": 1.0}
    sprinkler = _zone(emitter=Emitter.ROTOR, rate_mm_h=10)  # 7.5 mm/h reach the ground
    advice = zone_advice(sprinkler, {"A": 1.0, "B": 1.0}, plants, areas, 0)
    assert (advice.recommended, advice.minutes, advice.reason) == (True, 240, "dry")  # capped
    advice = zone_advice(sprinkler, {"A": 1.0}, {"A": _state(25)}, areas, 0)
    assert advice.minutes == pytest.approx(25 / 7.5 * 60)
    assert zone_advice(sprinkler, {"A": 1.0}, plants, areas, 40).reason == "rain_expected"
    # under a roof the rain does not help
    roofed = {"A": _state(25, sheltered=True)}
    assert zone_advice(sprinkler, {"A": 1.0}, roofed, areas, 40).reason == "dry"
    assert zone_advice(sprinkler, {"B": 1.0}, plants, areas, 0).reason == "ok"
    assert zone_advice(sprinkler, {}, plants, areas, 0).reason == "no_plants"
    assert zone_advice(_zone(), {"A": 1.0}, plants, areas, 0).reason == "no_rate"
    by_flow = _zone(flow_l_min=4, efficiency=1)  # 4 L/min over 16 m² = 15 mm/h
    assert zone_advice(by_flow, {"A": 1.0}, {"A": _state(25)}, areas, 0).minutes == 100
    drip = _zone(emitter=Emitter.DRIP, drip_l_h=2, efficiency=1)
    # 25 mm over 0.5 m² = 12.5 L at 2 L/h
    assert zone_advice(drip, {"A": 1.0}, {"A": _state(25)}, {"A": 0.5}, 0).minutes == 240
    small = {"A": _state(25)}
    assert zone_advice(drip, {"A": 1.0}, small, {"A": 0.05}, 0).minutes == pytest.approx(37.5)
