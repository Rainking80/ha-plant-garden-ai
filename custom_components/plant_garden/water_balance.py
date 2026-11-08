"""Soil water bucket per plant (FAO-56 chapter 8, simplified for gardens).

Every day: Dr = clamp(Dr_prev - effective rain - irrigation + ETc, 0, TAW) with
ETc = K x ET₀. The plant needs water when the depletion Dr exceeds the readily
available water RAW = p x TAW. All defaults with sources in water_defaults.json.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
import json
from pathlib import Path
from typing import Any

from .geometry import contains
from .models import LocationType, Plant, PlantCategory, Shape, ShapeKind, SoilType

DEFAULTS_FILE = Path(__file__).parent / "water_defaults.json"

# Areas that keep the rain off whatever lies below them
SHELTER_KINDS = frozenset({ShapeKind.HOUSE, ShapeKind.GREENHOUSE, ShapeKind.ROOF})
SHELTERED_LOCATIONS = frozenset({LocationType.GREENHOUSE, LocationType.COVERED})


def load_defaults() -> dict[str, Any]:
    """Read water_defaults.json (blocking: call it in the executor)."""
    data: dict[str, Any] = json.loads(DEFAULTS_FILE.read_text(encoding="utf-8"))
    return data


@dataclass(slots=True, frozen=True)
class SoilWater:
    """Soil water capacity of one plant's root zone."""

    soil: str
    root_depth_m: float
    taw: float  # total available water, mm
    raw: float  # readily available water, mm
    sheltered: bool  # no rain reaches it


def _soil_at(plant: Plant, shapes: Iterable[Shape]) -> SoilType | None:
    """The soil of the bed the plant stands in (topmost bed wins)."""
    if plant.position is None:
        return None
    found = None
    for shape in sorted(shapes, key=lambda s: s.z):
        if shape.soil_type and contains(shape.geometry, plant.position.x, plant.position.y):
            found = shape.soil_type
    return found


def _sheltered(plant: Plant, shapes: Iterable[Shape]) -> bool:
    if plant.location_type in SHELTERED_LOCATIONS:
        return True
    if plant.position is None:
        return False
    return any(
        shape.kind in SHELTER_KINDS and contains(shape.geometry, plant.position.x, plant.position.y)
        for shape in shapes
    )


def soil_water(plant: Plant, shapes: list[Shape], defaults: Mapping[str, Any]) -> SoilWater:
    """Soil, root depth and the water the root zone holds for one plant."""
    potted = plant.location_type is LocationType.POT or plant.category is PlantCategory.POTTED
    soil = plant.soil_type or _soil_at(plant, shapes)
    if soil is None:
        soil = SoilType.POTTING_MIX if potted else SoilType(defaults["default_soil"])
    if plant.root_depth_cm:
        root = plant.root_depth_cm / 100
    elif potted:
        root = float(defaults["pot_root_depth_m"])
    else:
        root = float(defaults["root_depth_m"].get(plant.category.value, 0.4))
    texture = defaults["soil"][soil.value]
    taw = 1000 * (texture["fc"] - texture["wp"]) * root
    fractions = defaults["depletion_fraction"]
    p = fractions.get(plant.category.value, fractions["default"])
    return SoilWater(
        soil=soil.value,
        root_depth_m=root,
        taw=round(taw, 2),
        raw=round(p * taw, 2),
        sheltered=_sheltered(plant, shapes),
    )


def crop_coefficient(plant: Plant, day: date, defaults: Mapping[str, Any]) -> float:
    """K for ETc = K x ET₀: lawn default, vegetable stage, else WUCOLS class."""
    if plant.category is PlantCategory.LAWN:
        return float(defaults["lawn"])
    if plant.category is PlantCategory.VEGETABLE:
        stages = defaults["vegetable"]
        if plant.planted_on is None or plant.planted_on > day:
            return float(stages["mid"])
        age = (day - plant.planted_on).days
        if age < stages["initial_days"]:
            return float(stages["initial"])
        if age < stages["mid_days"]:
            return float(stages["mid"])
        return float(stages["late"])
    need = plant.water_need.value if plant.water_need else defaults["default_water_need"]
    return float(defaults["landscape_coefficient"][need])


def effective_rain(rain_mm: float, defaults: Mapping[str, Any]) -> float:
    """Rain that reaches the roots: minus interception, times efficiency."""
    rain = defaults["rain"]
    return float(max(rain_mm - rain["interception_mm"], 0) * rain["efficiency"])


@dataclass(slots=True, frozen=True)
class WeatherDay:
    """What the balance needs from the weather of one day."""

    day: date
    et0: float | None
    rain: float | None


@dataclass(slots=True, frozen=True)
class BalanceDay:
    """One day of a plant's soil water bucket (all in mm)."""

    day: date
    et0: float | None
    kc: float
    etc: float
    rain: float  # effective rain
    irrigation: float
    depletion: float  # Dr at the end of the day


def run_balance(
    plant: Plant,
    water: SoilWater,
    weather: Iterable[WeatherDay],
    irrigation: Mapping[date, float],
    defaults: Mapping[str, Any],
    *,
    start_depletion: float = 0.0,
) -> list[BalanceDay]:
    """Daily bucket over the given days, oldest first.

    The first day starts at `start_depletion` (0 = field capacity). Days without
    ET₀ only count rain and irrigation.
    """
    depletion = start_depletion
    result = []
    for day in weather:
        kc = crop_coefficient(plant, day.day, defaults)
        etc = kc * day.et0 if day.et0 is not None else 0.0
        rain = 0.0 if water.sheltered or day.rain is None else effective_rain(day.rain, defaults)
        given = irrigation.get(day.day, 0.0)
        depletion = min(max(depletion - rain - given + etc, 0.0), water.taw)
        result.append(
            BalanceDay(
                day=day.day,
                et0=day.et0,
                kc=kc,
                etc=round(etc, 2),
                rain=round(rain, 2),
                irrigation=round(given, 2),
                depletion=round(depletion, 2),
            )
        )
    return result
