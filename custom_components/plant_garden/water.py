"""Weather and water balance: fetches the weather, keeps the soil water per plant.

A DataUpdateCoordinator fetches all configured weather sources every hour,
merges them per value (the user's own sensors first, D-026), fills in ET₀ where
no source has it, stores the days in SQLite and recomputes every plant's soil
water bucket. Plant, layout and irrigation changes recompute without fetching.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .et0 import DayInput, reference_et0
from .geometry import footprints, precipitation_rate, zone_coverage
from .models import Emitter, Plant, Shape
from .water_balance import (
    BalanceDay,
    SoilWater,
    WeatherDay,
    effective_rain,
    run_balance,
    soil_water,
)
from .weather import bright_sky, home_assistant, open_meteo
from .weather.base import (
    SOURCE_BRIGHT_SKY,
    SOURCE_HOME_ASSISTANT,
    SOURCE_OPEN_METEO,
    DailyWeather,
    WeatherError,
)

_LOGGER = logging.getLogger(__name__)

SUBENTRY_WEATHER = "weather"
CONF_SOURCE = "source"
UPDATE_INTERVAL = timedelta(hours=1)
FETCH_DAYS = 30  # past days fetched every hour (sources fill gaps after downtime)
KEEP_DAYS = 365  # the balance starts at field capacity this long ago at most
FORECAST_DAYS = 3
SHOW_DAYS = 14
RECOMPUTE_DELAY = 3  # seconds; batches quick edits
MAX_RECOMMENDED_MIN = 240
RAIN_LOOKAHEAD_DAYS = 2


@dataclass(slots=True)
class SourceStatus:
    source: str
    title: str
    ok: bool = True
    error: str | None = None
    days: int = 0


@dataclass(slots=True)
class PlantWaterState:
    """Soil water of one plant today and over the last days."""

    soil: SoilWater
    depletion: float
    needs_water: bool
    frost: float | None  # coldest forecast night below the plant's limit
    days: list[BalanceDay]


@dataclass(slots=True)
class ZoneAdvice:
    recommended: bool
    minutes: float | None
    reason: str  # dry | rain_expected | ok | no_plants | no_rate


@dataclass(slots=True)
class WaterData:
    weather: list[DailyWeather] = field(default_factory=list)  # oldest first, incl. forecast
    et0_method: dict[str, str] = field(default_factory=dict)  # ISO day -> how ET₀ was obtained
    sources: list[SourceStatus] = field(default_factory=list)
    plants: dict[str, PlantWaterState] = field(default_factory=dict)
    zones: dict[str, ZoneAdvice] = field(default_factory=dict)
    updated: datetime | None = None

    def day(self, day: date) -> DailyWeather | None:
        return next((w for w in self.weather if w.day == day), None)


def weather_sources(entry: ConfigEntry) -> list[tuple[str, str, dict[str, Any]]]:
    """(source, title, data) of the configured weather subentries, own sensors first."""
    found = [
        (sub.data[CONF_SOURCE], sub.title, dict(sub.data))
        for sub in entry.subentries.values()
        if sub.subentry_type == SUBENTRY_WEATHER
    ]
    return sorted(found, key=lambda item: item[0] != SOURCE_HOME_ASSISTANT)


def merge(per_source: list[list[DailyWeather]]) -> list[DailyWeather]:
    """One record per day; earlier sources win, later ones fill gaps."""
    merged: dict[date, DailyWeather] = {}
    for records in per_source:
        for record in records:
            current = merged.get(record.day)
            merged[record.day] = current.merged_with(record) if current else record
    return [merged[day] for day in sorted(merged)]


def fill_et0(
    days: list[DailyWeather], latitude: float, elevation: float
) -> tuple[list[DailyWeather], dict[str, str]]:
    """ET₀ for days whose sources did not deliver it (Penman-Monteith or Hargreaves)."""
    methods: dict[str, str] = {}
    result = []
    for record in days:
        if record.et0_mm is not None:
            methods[record.day.isoformat()] = record.source
            result.append(record)
        elif record.t_max is not None and record.t_min is not None:
            value, method = reference_et0(
                DayInput(
                    day=record.day,
                    t_max=record.t_max,
                    t_min=record.t_min,
                    rh_max=record.rh_max,
                    rh_min=record.rh_min,
                    rh_mean=record.rh_mean,
                    dewpoint=record.dewpoint,
                    wind_2m=record.wind_2m,
                    solar_mj=record.solar_mj,
                ),
                latitude,
                elevation,
            )
            result.append(replace(record, et0_mm=round(value, 2)))
            methods[record.day.isoformat()] = method
        else:
            result.append(record)
    return result, methods


def expected_rain(weather: list[DailyWeather], today: date, defaults: Mapping[str, Any]) -> float:
    """Effective rain expected over the next days, weighted by its probability."""
    total = 0.0
    for offset in range(1, RAIN_LOOKAHEAD_DAYS + 1):
        day = next((w for w in weather if w.day == today + timedelta(days=offset)), None)
        if day is None or not day.precip_mm:
            continue
        probability = day.rain_probability if day.rain_probability is not None else 100
        total += effective_rain(day.precip_mm, defaults) * probability / 100
    return total


def zone_advice(
    zone: Shape,
    coverage: Mapping[str, float],
    plants: Mapping[str, PlantWaterState],
    areas: Mapping[str, float],
    rain_ahead: float,
) -> ZoneAdvice:
    """Should the zone run, and how long, to refill the thirstiest plant it reaches?"""
    settings = zone.irrigation
    reached = [pid for pid in coverage if pid in plants]
    if settings is None or not reached:
        return ZoneAdvice(recommended=False, minutes=None, reason="no_plants")
    thirsty = [pid for pid in reached if plants[pid].needs_water]
    if not thirsty:
        return ZoneAdvice(recommended=False, minutes=0.0, reason="ok")
    needs = {
        pid: plants[pid].depletion - (0.0 if plants[pid].soil.sheltered else rain_ahead)
        for pid in thirsty
    }
    needs = {pid: need for pid, need in needs.items() if need > 0}
    if not needs:
        return ZoneAdvice(recommended=False, minutes=0.0, reason="rain_expected")
    efficiency = settings.effective_efficiency
    hours: list[float] = []
    for pid, need in needs.items():
        if settings.emitter is Emitter.DRIP:
            rate = settings.drip_l_h
            if rate:
                hours.append(need * areas[pid] / (rate * efficiency))
        else:
            pr = precipitation_rate(settings, zone.geometry)
            if pr:
                hours.append(need / (pr * efficiency * coverage[pid]))
    if not hours:
        return ZoneAdvice(recommended=True, minutes=None, reason="no_rate")
    minutes = min(max(hours) * 60, MAX_RECOMMENDED_MIN)
    return ZoneAdvice(recommended=True, minutes=round(minutes, 1), reason="dry")


class WaterCoordinator(DataUpdateCoordinator[WaterData]):
    """Fetches the weather hourly and keeps the water balance of all plants."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        manager: Any,  # GardenManager (import cycle)
        defaults: dict[str, Any],
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} weather",
            update_interval=UPDATE_INTERVAL,
        )
        self._entry = entry
        self._manager = manager
        self.defaults = defaults
        self._unsubs: list[CALLBACK_TYPE] = []
        self._recompute_later: CALLBACK_TYPE | None = None
        self._sources: list[SourceStatus] = []

    async def async_start(self) -> None:
        """Show what is stored right away, then fetch in the background."""
        self.async_set_updated_data(await self._async_compute(await self._async_stored()))
        self._unsubs.append(self._manager.async_subscribe(self._on_garden_change))
        # every new result reaches open panels (and keeps the hourly refresh scheduled)
        self._unsubs.append(self.async_add_listener(self._manager.notify_water))

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._recompute_later:
            self._recompute_later()
            self._recompute_later = None

    # ------------------------------------------------------------ fetching
    async def _async_update_data(self) -> WaterData:
        today = dt_util.now().date()
        start = today - timedelta(days=FETCH_DAYS)
        end = today + timedelta(days=FORECAST_DAYS)
        fetched: list[list[DailyWeather]] = []
        statuses = []
        for source, title, data in weather_sources(self._entry):
            status = SourceStatus(source=source, title=title)
            try:
                records = await self._async_fetch(source, data, start, end, today)
            except WeatherError as err:
                status.ok, status.error = False, str(err)
                _LOGGER.warning("Weather source %s: %s", title, err)
                records = []
            status.days = len(records)
            statuses.append(status)
            fetched.append(records)
        self._sources = statuses
        merged = merge(fetched)
        if merged:
            await self._manager.async_store_weather(
                [w for w in merged if w.day <= today], dt_util.utcnow()
            )
        stored = await self._async_stored()
        # stored past days, fresh values (incl. forecast) on top
        weather = merge([[w for w in merged if w.day >= today - timedelta(days=1)], stored])
        return await self._async_compute(weather)

    async def _async_fetch(
        self, source: str, data: dict[str, Any], start: date, end: date, today: date
    ) -> list[DailyWeather]:
        hass = self.hass
        origin = self._manager.layout.origin
        latitude = origin.latitude if origin else hass.config.latitude
        longitude = origin.longitude if origin else hass.config.longitude
        session = async_get_clientsession(hass)
        if source == SOURCE_OPEN_METEO:
            return await open_meteo.async_fetch(
                session,
                latitude,
                longitude,
                hass.config.time_zone,
                past_days=(today - start).days,
                forecast_days=(end - today).days + 1,
            )
        if source == SOURCE_BRIGHT_SKY:
            return await bright_sky.async_fetch(
                session, latitude, longitude, hass.config.time_zone, start=start, end=end
            )
        if source == SOURCE_HOME_ASSISTANT:
            records = await home_assistant.async_fetch_history(hass, data, start, today)
            if data.get(home_assistant.FORECAST):
                forecast = await home_assistant.async_fetch_forecast(
                    hass, data[home_assistant.FORECAST]
                )
                # sensors know today better than the forecast
                records = merge([records, [f for f in forecast if f.day >= today]])
            return records
        raise WeatherError(f"unknown weather source {source}")

    async def _async_stored(self) -> list[DailyWeather]:
        today = dt_util.now().date()
        stored: list[DailyWeather] = await self._manager.async_stored_weather(
            today - timedelta(days=KEEP_DAYS)
        )
        return stored

    # ------------------------------------------------------------ balance
    @callback
    def _on_garden_change(self, change: Any) -> None:
        if change.kind not in ("plant", "plant_removed", "layout", "irrigation"):
            return
        if self._recompute_later:
            self._recompute_later()

        @callback
        def recompute(_now: datetime) -> None:
            self._recompute_later = None
            self.hass.async_create_task(self._async_recompute(), eager_start=True)

        self._recompute_later = async_call_later(self.hass, RECOMPUTE_DELAY, recompute)

    async def _async_recompute(self) -> None:
        current: WaterData | None = self.data  # None until async_start ran
        if current is None:
            return
        self.async_set_updated_data(await self._async_compute(current.weather))

    async def _async_compute(self, weather: list[DailyWeather]) -> WaterData:
        hass = self.hass
        today = dt_util.now().date()
        origin = self._manager.layout.origin
        latitude = origin.latitude if origin else hass.config.latitude
        weather, methods = fill_et0(weather, latitude, hass.config.elevation or 0)
        past = [w for w in weather if w.day <= today]
        irrigation: dict[str, dict[date, float]] = {}
        if past:
            by_day = await self._manager.async_plant_water_by_day(past[0].day)
            irrigation = {
                plant_id: {date.fromisoformat(day): mm for day, (_l, mm) in days.items()}
                for plant_id, days in by_day.items()
            }
        shapes = self._manager.shapes()
        plants: dict[str, PlantWaterState] = {}
        balance_days = [WeatherDay(day=w.day, et0=w.et0_mm, rain=w.precip_mm) for w in past]
        forecast = [w for w in weather if w.day > today]
        for plant in self._manager.watered_plants():
            plants[plant.id] = self._plant_state(
                plant, shapes, balance_days, irrigation.get(plant.id, {}), forecast
            )
        zones: dict[str, ZoneAdvice] = {}
        if plants:
            widths = await self._manager.async_latest_widths()
            prints = footprints(self._manager.watered_plants(), shapes, widths)
            areas = {pid: footprint.area for pid, footprint in prints.items()}
            rain_ahead = expected_rain(weather, today, self.defaults)
            for zone in self._manager.zones():
                zones[zone.id] = zone_advice(
                    zone, zone_coverage(zone, prints), plants, areas, rain_ahead
                )
        return WaterData(
            weather=weather,
            et0_method=methods,
            sources=list(self._sources),
            plants=plants,
            zones=zones,
            updated=dt_util.utcnow(),
        )

    def _plant_state(
        self,
        plant: Plant,
        shapes: list[Shape],
        days: list[WeatherDay],
        irrigation: Mapping[date, float],
        forecast: list[DailyWeather],
    ) -> PlantWaterState:
        soil = soil_water(plant, shapes, self.defaults)
        balance = run_balance(plant, soil, days, irrigation, self.defaults)
        depletion = balance[-1].depletion if balance else 0.0
        frost = None
        if plant.min_temperature_c is not None:
            lows = [w.t_min for w in forecast if w.t_min is not None]
            if lows and min(lows) < plant.min_temperature_c:
                frost = min(lows)
        return PlantWaterState(
            soil=soil,
            depletion=depletion,
            needs_water=bool(balance) and depletion > soil.raw,
            frost=frost,
            days=balance[-SHOW_DAYS:],
        )


def water_summary(data: WaterData | None, has_sources: bool) -> dict[str, Any]:
    """The water data for the panel (JSON)."""
    if data is None:
        return {"configured": has_sources, "updated": None, "sources": [], "weather": []}
    today = dt_util.now().date()
    shown = [w for w in data.weather if w.day > today - timedelta(days=SHOW_DAYS)]
    return {
        "configured": has_sources,
        "updated": data.updated.isoformat() if data.updated else None,
        "sources": [
            {"source": s.source, "title": s.title, "ok": s.ok, "error": s.error, "days": s.days}
            for s in data.sources
        ],
        "weather": [
            {
                **w.as_dict(),
                "forecast": w.day > today,
                "et0_method": data.et0_method.get(w.day.isoformat()),
            }
            for w in shown
        ],
        "plants": {
            plant_id: {
                "depletion": state.depletion,
                "taw": state.soil.taw,
                "raw": state.soil.raw,
                "soil": state.soil.soil,
                "root_depth_m": state.soil.root_depth_m,
                "sheltered": state.soil.sheltered,
                "needs_water": state.needs_water,
                "frost": state.frost,
                "days": [
                    {
                        "day": d.day.isoformat(),
                        "et0": d.et0,
                        "kc": d.kc,
                        "etc": d.etc,
                        "rain": d.rain,
                        "irrigation": d.irrigation,
                        "depletion": d.depletion,
                    }
                    for d in state.days
                ],
            }
            for plant_id, state in data.plants.items()
        },
        "zones": {
            zone_id: {"recommended": a.recommended, "minutes": a.minutes, "reason": a.reason}
            for zone_id, a in data.zones.items()
        },
    }


def garden_values(data: WaterData | None) -> dict[str, float | None]:
    """ET₀ and rain today, rain expected tomorrow (garden sensors)."""
    if data is None:
        return {"et0_today": None, "rain_today": None, "rain_forecast": None}
    today = dt_util.now().date()
    now, tomorrow = data.day(today), data.day(today + timedelta(days=1))
    return {
        "et0_today": now.et0_mm if now else None,
        "rain_today": now.precip_mm if now else None,
        "rain_forecast": tomorrow.precip_mm if tomorrow else None,
    }
