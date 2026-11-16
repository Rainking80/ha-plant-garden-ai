"""Soil moisture sensors correct the water balance of the plants they are linked to.

A sensor reading (any unit, usually %) is put on the scale between two readings:
`wet` (the soil at field capacity, a day after thorough watering) and `dry` (the
wilting point). The share of that range that is used up is the share of the
total available water TAW that is gone - the depletion the balance works with.

Without values from the user the scale is learned: `wet` is the highest reading
of the last weeks (long-term statistics), `dry` follows from the soil's texture,
as capacitive sensors read roughly in proportion to the water content.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import partial
import logging
import math
from typing import Any

from homeassistant.core import HomeAssistant, State
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util

from .models import Plant

_LOGGER = logging.getLogger(__name__)

LEARN_DAYS = 60  # the wettest reading of this many days stands for field capacity
MAX_AGE = timedelta(hours=24)  # older readings are not trusted (battery empty, out of reach)

STATUS_OK = "ok"
STATUS_LEARNING = "learning"  # no scale yet: no statistics and no values from the user
STATUS_UNAVAILABLE = "unavailable"  # no (fresh, numeric) reading


@dataclass(slots=True, frozen=True)
class Scale:
    """Sensor readings at field capacity and at the wilting point."""

    wet: float
    dry: float
    learned: bool  # at least one end was not set by the user


@dataclass(slots=True, frozen=True)
class Moisture:
    """What the sensor of a plant says about its soil water."""

    status: str
    value: float | None = None
    scale: Scale | None = None
    depletion: float | None = None  # mm, None unless status is ok

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "value": self.value,
            "wet": self.scale.wet if self.scale else None,
            "dry": self.scale.dry if self.scale else None,
            "learned": self.scale.learned if self.scale else None,
        }


def scale_for(
    plant: Plant, observed_max: float | None, texture: Mapping[str, float]
) -> Scale | None:
    """The plant's scale: the user's values, else learned ones; None if there is none yet."""
    wet = plant.moisture_wet if plant.moisture_wet is not None else observed_max
    if wet is None:
        return None
    dry = plant.moisture_dry
    if dry is None:
        dry = wet * texture["wp"] / texture["fc"]
    if wet - dry <= 0:
        return None
    return Scale(
        wet=round(wet, 2),
        dry=round(dry, 2),
        learned=plant.moisture_wet is None or plant.moisture_dry is None,
    )


def depletion(value: float, scale: Scale, taw: float) -> float:
    """Depletion in mm for a reading: 0 at `wet`, TAW at `dry`."""
    used = (scale.wet - value) / (scale.wet - scale.dry)
    return round(min(max(used, 0.0), 1.0) * taw, 2)


def reading(state: State | None, now: datetime) -> float | None:
    """The fresh numeric value of a sensor state, else None."""
    if state is None or now - state.last_reported > MAX_AGE:
        return None
    try:
        value = float(state.state)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def measure(
    plant: Plant,
    state: State | None,
    *,
    observed_max: float | None,
    texture: Mapping[str, float],
    taw: float,
    now: datetime,
) -> Moisture | None:
    """The soil water a plant's sensor measures; None without a linked sensor."""
    if not plant.moisture_entity_id:
        return None
    value = reading(state, now)
    if value is not None:
        # a reading above everything seen so far is the new field capacity
        observed_max = value if observed_max is None else max(observed_max, value)
    scale = scale_for(plant, observed_max, texture)
    if value is None:
        return Moisture(status=STATUS_UNAVAILABLE, scale=scale)
    if scale is None:
        return Moisture(status=STATUS_LEARNING, value=value)
    return Moisture(
        status=STATUS_OK, value=value, scale=scale, depletion=depletion(value, scale, taw)
    )


async def async_observed_max(hass: HomeAssistant, entity_ids: Iterable[str]) -> dict[str, float]:
    """The highest reading of each sensor over the last weeks (long-term statistics)."""
    ids = set(entity_ids)
    if not ids or "recorder" not in hass.config.components:
        return {}
    # imported here: the recorder is optional (after_dependencies)
    from homeassistant.components.recorder import get_instance, statistics  # noqa: PLC0415

    end = dt_util.utcnow()
    try:
        stats = await get_instance(hass).async_add_executor_job(
            partial(
                statistics.statistics_during_period,
                hass,
                end - timedelta(days=LEARN_DAYS),
                end,
                ids,
                "day",
                None,
                {"max"},
            )
        )
    except HomeAssistantError as err:
        _LOGGER.debug("No statistics of the soil moisture sensors: %s", err)
        return {}
    result: dict[str, float] = {}
    for entity_id, rows in stats.items():
        values = [float(v) for row in rows if (v := row.get("max")) is not None]
        if values:
            result[entity_id] = max(values)
    return result
