"""Open-Meteo (https://open-meteo.com): no key needed for non-commercial use.

One request returns past days and the forecast; ET₀ comes from Open-Meteo's own
FAO-56 calculation. Variable names and units verified against the live API
(2026-11-08).
"""

from __future__ import annotations

from datetime import date
from typing import Any

import aiohttp

from .base import SOURCE_OPEN_METEO, DailyWeather, WeatherError, round_coordinate

URL = "https://api.open-meteo.com/v1/forecast"
DAILY = (
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "relative_humidity_2m_mean",
    "relative_humidity_2m_max",
    "relative_humidity_2m_min",
    "dew_point_2m_mean",
    "wind_speed_10m_mean",
    "shortwave_radiation_sum",
    "precipitation_sum",
    "et0_fao_evapotranspiration",
    "precipitation_probability_max",
    "wind_gusts_10m_max",
)
MAX_PAST_DAYS = 92
TIMEOUT = aiohttp.ClientTimeout(total=30)
WIND_10M_TO_2M = 0.748  # FAO-56 eq. 47 for 10 m


def _value(daily: dict[str, Any], key: str, index: int) -> float | None:
    values = daily.get(key) or []
    value = values[index] if index < len(values) else None
    return float(value) if value is not None else None


def _kmh(metres_per_second: float | None) -> float | None:
    return round(metres_per_second * 3.6, 1) if metres_per_second is not None else None


def parse(payload: dict[str, Any]) -> list[DailyWeather]:
    """Daily records from an Open-Meteo answer."""
    daily = payload.get("daily")
    if not isinstance(daily, dict) or "time" not in daily:
        raise WeatherError("Open-Meteo answered without daily values")
    result = []
    for index, day in enumerate(daily["time"]):
        wind = _value(daily, "wind_speed_10m_mean", index)
        result.append(
            DailyWeather(
                day=date.fromisoformat(day),
                t_max=_value(daily, "temperature_2m_max", index),
                t_min=_value(daily, "temperature_2m_min", index),
                t_mean=_value(daily, "temperature_2m_mean", index),
                rh_mean=_value(daily, "relative_humidity_2m_mean", index),
                rh_max=_value(daily, "relative_humidity_2m_max", index),
                rh_min=_value(daily, "relative_humidity_2m_min", index),
                dewpoint=_value(daily, "dew_point_2m_mean", index),
                wind_2m=round(wind * WIND_10M_TO_2M, 2) if wind is not None else None,
                solar_mj=_value(daily, "shortwave_radiation_sum", index),
                precip_mm=_value(daily, "precipitation_sum", index),
                et0_mm=_value(daily, "et0_fao_evapotranspiration", index),
                rain_probability=_value(daily, "precipitation_probability_max", index),
                gust_max=_kmh(_value(daily, "wind_gusts_10m_max", index)),
                source=SOURCE_OPEN_METEO,
            )
        )
    return result


async def async_fetch(
    session: aiohttp.ClientSession,
    latitude: float,
    longitude: float,
    timezone: str,
    *,
    past_days: int,
    forecast_days: int,
) -> list[DailyWeather]:
    params = {
        "latitude": str(round_coordinate(latitude)),
        "longitude": str(round_coordinate(longitude)),
        "timezone": timezone,
        "past_days": str(min(past_days, MAX_PAST_DAYS)),
        "forecast_days": str(forecast_days),
        "wind_speed_unit": "ms",
        "daily": ",".join(DAILY),
    }
    try:
        async with session.get(URL, params=params, timeout=TIMEOUT) as resp:
            if resp.status != 200:
                raise WeatherError(f"Open-Meteo answered HTTP {resp.status}")
            payload = await resp.json()
    except (aiohttp.ClientError, TimeoutError) as err:
        raise WeatherError(f"Open-Meteo not reachable: {err}") from err
    return parse(payload)
