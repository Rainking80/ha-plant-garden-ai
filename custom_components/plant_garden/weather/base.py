"""Common types of the weather sources."""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
from datetime import date
from typing import Any, Self

# Sources a garden can use (config subentry type "weather", field "source")
SOURCE_OPEN_METEO = "open_meteo"
SOURCE_BRIGHT_SKY = "bright_sky"
SOURCE_HOME_ASSISTANT = "home_assistant"


class WeatherError(Exception):
    """A weather source could not deliver data."""


@dataclass(slots=True, frozen=True)
class DailyWeather:
    """Weather of one day in SI units; None where the source has no value."""

    day: date
    t_min: float | None = None  # °C
    t_max: float | None = None
    t_mean: float | None = None
    rh_mean: float | None = None  # %
    rh_min: float | None = None
    rh_max: float | None = None
    dewpoint: float | None = None  # °C
    wind_2m: float | None = None  # m/s
    solar_mj: float | None = None  # MJ m⁻² day⁻¹
    precip_mm: float | None = None
    et0_mm: float | None = None
    rain_probability: float | None = None  # %, forecasts
    gust_max: float | None = None  # km/h, the strongest gust of the day
    source: str = ""

    def merged_with(self, other: Self) -> Self:
        """Fill this day's missing values from another source."""
        changes: dict[str, Any] = {}
        for item in fields(self):
            if item.name in ("day", "source"):
                continue
            if getattr(self, item.name) is None and getattr(other, item.name) is not None:
                changes[item.name] = getattr(other, item.name)
        return replace(self, **changes) if changes else self

    def as_dict(self) -> dict[str, Any]:
        data = {item.name: getattr(self, item.name) for item in fields(self)}
        data["day"] = self.day.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        values = {k: v for k, v in data.items() if k in {f.name for f in fields(cls)}}
        values["day"] = date.fromisoformat(data["day"])
        return cls(**values)


def round_coordinate(value: float) -> float:
    """About 1 km: enough for weather, does not reveal the house (spec chapter 7)."""
    return round(value, 2)
