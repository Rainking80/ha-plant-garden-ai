"""Bright Sky (https://brightsky.dev): DWD observations and MOSMIX forecasts, no key.

Germany only. The API returns hourly records (default "dwd" units: wind in
km/h at 10 m, solar in kWh/m² per hour); they are summed and averaged per local
day here. Field names and units verified against the live API (2026-11-08).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
import math
from statistics import fmean
from typing import Any

import aiohttp

from .base import SOURCE_BRIGHT_SKY, DailyWeather, WeatherError, round_coordinate

URL = "https://api.brightsky.dev/weather"
TIMEOUT = aiohttp.ClientTimeout(total=60)
WIND_10M_TO_2M = 0.748  # FAO-56 eq. 47 for 10 m
KWH_TO_MJ = 3.6
MIN_HOURS = 18  # fewer hourly records do not make a day


def _numbers(records: list[dict[str, Any]], key: str) -> list[float]:
    return [float(r[key]) for r in records if r.get(key) is not None]


def _saturation(t: float) -> float:
    """Saturation vapour pressure in kPa (FAO-56 eq. 11, as in et0.py)."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def _humidity(record: dict[str, Any]) -> float | None:
    """Relative humidity, from the dew point where forecasts leave it out."""
    if record.get("relative_humidity") is not None:
        return float(record["relative_humidity"])
    t, dew = record.get("temperature"), record.get("dew_point")
    if t is None or dew is None:
        return None
    return min(100.0, 100 * _saturation(dew) / _saturation(t))


def aggregate(records: list[dict[str, Any]]) -> list[DailyWeather]:
    """Hourly records (local timestamps) to daily values."""
    by_day: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_day[datetime.fromisoformat(record["timestamp"]).date()].append(record)
    result = []
    for day, hours in sorted(by_day.items()):
        temps = _numbers(hours, "temperature")
        if len(hours) < MIN_HOURS or not temps:
            continue
        humidity = [h for h in (_humidity(r) for r in hours) if h is not None]
        winds = _numbers(hours, "wind_speed")
        solar = _numbers(hours, "solar")
        rain = _numbers(hours, "precipitation")
        dew = _numbers(hours, "dew_point")
        probability = _numbers(hours, "precipitation_probability")
        gusts = _numbers(hours, "wind_gust_speed")
        result.append(
            DailyWeather(
                day=day,
                t_max=max(temps),
                t_min=min(temps),
                t_mean=round(fmean(temps), 2),
                rh_mean=round(fmean(humidity), 1) if humidity else None,
                rh_max=max(humidity) if humidity else None,
                rh_min=min(humidity) if humidity else None,
                dewpoint=round(fmean(dew), 2) if dew else None,
                wind_2m=round(fmean(winds) / 3.6 * WIND_10M_TO_2M, 2) if winds else None,
                solar_mj=round(sum(solar) * KWH_TO_MJ, 2) if solar else None,
                precip_mm=round(sum(rain), 2) if rain else None,
                rain_probability=max(probability) if probability else None,
                gust_max=max(gusts) if gusts else None,
                source=SOURCE_BRIGHT_SKY,
            )
        )
    return result


async def async_fetch(
    session: aiohttp.ClientSession,
    latitude: float,
    longitude: float,
    timezone: str,
    *,
    start: date,
    end: date,
) -> list[DailyWeather]:
    params = {
        "lat": str(round_coordinate(latitude)),
        "lon": str(round_coordinate(longitude)),
        "date": start.isoformat(),
        "last_date": (end + timedelta(days=1)).isoformat(),
        "tz": timezone,
    }
    try:
        async with session.get(URL, params=params, timeout=TIMEOUT) as resp:
            if resp.status == 404:
                raise WeatherError("Bright Sky has no data for this place (Germany only)")
            if resp.status != 200:
                raise WeatherError(f"Bright Sky answered HTTP {resp.status}")
            payload = await resp.json()
    except (aiohttp.ClientError, TimeoutError) as err:
        raise WeatherError(f"Bright Sky not reachable: {err}") from err
    records = payload.get("weather")
    if not isinstance(records, list):
        raise WeatherError("Bright Sky answered without weather records")
    return [day for day in aggregate(records) if start <= day.day <= end]
