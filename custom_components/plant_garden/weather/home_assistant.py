"""The user's own Home Assistant sensors as weather source (spec 4.6, first priority).

Past days come from the recorder's long-term statistics, so the sensors need a
state class. Rain and ET₀ sensors may be counters (total/total_increasing: the
daily change is used) or daily values that reset at midnight (the daily maximum).
The forecast comes from a weather entity via `weather.get_forecasts`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import partial
import logging
from typing import Any

from homeassistant.components.recorder import get_instance, statistics
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util

from .base import SOURCE_HOME_ASSISTANT, DailyWeather, WeatherError

_LOGGER = logging.getLogger(__name__)

# subentry data keys -> what they measure
RAIN = "rain_entity"
ET0 = "et0_entity"
TEMPERATURE = "temperature_entity"
HUMIDITY = "humidity_entity"
WIND = "wind_entity"
RADIATION = "radiation_entity"
FORECAST = "weather_entity"
SENSOR_KEYS = (RAIN, ET0, TEMPERATURE, HUMIDITY, WIND, RADIATION)

UNITS = {"distance": "mm", "temperature": "°C", "speed": "m/s"}
W_M2_TO_MJ_DAY = 0.0864  # mean W/m² over a day -> MJ/m²


def _daily(rows: list[Any], key: str) -> dict[date, float]:
    result: dict[date, float] = {}
    for row in rows:
        value = row.get(key)
        if value is not None:
            day = dt_util.as_local(datetime.fromtimestamp(row["start"], dt_util.UTC)).date()
            result[day] = float(value)
    return result


def _amount(rows: list[Any]) -> dict[date, float]:
    """Daily amount of a rain/ET₀ sensor: the change of a counter, else the daily maximum."""
    change = _daily(rows, "change")
    return change if change else _daily(rows, "max")


async def async_fetch_history(
    hass: HomeAssistant, config: dict[str, Any], start: date, end: date
) -> list[DailyWeather]:
    """Daily values from the long-term statistics of the configured sensors."""
    ids = {config[key] for key in SENSOR_KEYS if config.get(key)}
    if not ids:
        return []
    if "recorder" not in hass.config.components:
        raise WeatherError("The recorder is needed for the history of your sensors")
    begin = dt_util.start_of_local_day(start)
    finish = dt_util.start_of_local_day(end + timedelta(days=1))
    try:
        stats = await get_instance(hass).async_add_executor_job(
            partial(
                statistics.statistics_during_period,
                hass,
                begin,
                finish,
                ids,
                "day",
                UNITS,
                {"change", "max", "mean", "min"},
            )
        )
    except HomeAssistantError as err:
        raise WeatherError(f"Could not read the statistics: {err}") from err

    def rows(key: str) -> list[Any]:
        entity = config.get(key)
        return list(stats.get(entity, [])) if entity else []

    rain = _amount(rows(RAIN))
    et0 = _amount(rows(ET0))
    t_min, t_max, t_mean = (_daily(rows(TEMPERATURE), k) for k in ("min", "max", "mean"))
    rh_min, rh_max, rh_mean = (_daily(rows(HUMIDITY), k) for k in ("min", "max", "mean"))
    wind = _daily(rows(WIND), "mean")
    radiation = _daily(rows(RADIATION), "mean")
    days = sorted(set(rain) | set(et0) | set(t_min) | set(rh_mean) | set(wind) | set(radiation))
    return [
        DailyWeather(
            day=day,
            t_min=t_min.get(day),
            t_max=t_max.get(day),
            t_mean=t_mean.get(day),
            rh_mean=rh_mean.get(day),
            rh_min=rh_min.get(day),
            rh_max=rh_max.get(day),
            wind_2m=wind.get(day),  # garden weather stations measure at about 2 m
            solar_mj=round(radiation[day] * W_M2_TO_MJ_DAY, 2) if day in radiation else None,
            precip_mm=rain.get(day),
            et0_mm=et0.get(day),
            source=SOURCE_HOME_ASSISTANT,
        )
        for day in days
        if start <= day <= end
    ]


async def async_fetch_forecast(hass: HomeAssistant, entity_id: str) -> list[DailyWeather]:
    """Daily forecast of a weather entity (today and the next days)."""
    try:
        response = await hass.services.async_call(
            "weather",
            "get_forecasts",
            {"entity_id": entity_id, "type": "daily"},
            blocking=True,
            return_response=True,
        )
    except HomeAssistantError as err:
        raise WeatherError(f"{entity_id}: no daily forecast ({err})") from err
    answer: dict[str, Any] = dict(response or {})
    forecast = answer.get(entity_id)
    items: list[Any] = forecast.get("forecast", []) if isinstance(forecast, dict) else []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        when = dt_util.parse_datetime(str(item.get("datetime", "")))
        if when is None:
            continue
        result.append(
            DailyWeather(
                day=dt_util.as_local(when).date(),
                t_max=_number(item, "temperature"),
                t_min=_number(item, "templow"),
                rh_mean=_number(item, "humidity"),
                precip_mm=_number(item, "precipitation"),
                rain_probability=_number(item, "precipitation_probability"),
                source=SOURCE_HOME_ASSISTANT,
            )
        )
    return result


def _number(item: dict[str, Any], key: str) -> float | None:
    value = item.get(key)
    return float(value) if isinstance(value, int | float) else None
