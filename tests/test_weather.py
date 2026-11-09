"""Weather sources, the water coordinator, its sensors and the weather subentry flow."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.const import DOMAIN
from custom_components.plant_garden.weather import bright_sky, home_assistant, open_meteo
from custom_components.plant_garden.weather.base import WeatherError

NOW = "2027-07-10 12:00:00+00:00"  # 05:00 in the tests' US/Pacific time zone
TODAY = date(2027, 7, 10)
VALVE = "input_boolean.zone"


def open_meteo_payload(start: date, days: int, rain: dict[date, float] | None = None) -> dict:
    rain = rain or {}
    dates = [start + timedelta(days=i) for i in range(days)]
    return {
        "daily": {
            "time": [d.isoformat() for d in dates],
            "temperature_2m_max": [28.0] * days,
            "temperature_2m_min": [14.0] * days,
            "temperature_2m_mean": [21.0] * days,
            "relative_humidity_2m_mean": [55] * days,
            "relative_humidity_2m_max": [80] * days,
            "relative_humidity_2m_min": [35] * days,
            "dew_point_2m_mean": [11.0] * days,
            "wind_speed_10m_mean": [3.0] * days,
            "shortwave_radiation_sum": [25.0] * days,
            "precipitation_sum": [rain.get(d, 0.0) for d in dates],
            "et0_fao_evapotranspiration": [5.0] * days,
            "precipitation_probability_max": [90 if d in rain else 0 for d in dates],
        }
    }


def bright_sky_hours(day: date, hours: int = 24) -> list[dict[str, Any]]:
    return [
        {
            "timestamp": f"{day.isoformat()}T{h:02d}:00:00+02:00",
            "temperature": 10 + h / 2,
            "precipitation": 0.5 if h < 4 else 0.0,
            "wind_speed": 18.0,
            "relative_humidity": None if h % 2 else 70,
            "dew_point": 8.0,
            "solar": 0.2 if 6 <= h <= 18 else 0.0,
            "precipitation_probability": 40 if h == 3 else None,
        }
        for h in range(hours)
    ]


# ---------------------------------------------------------------- sources
def test_open_meteo_parse() -> None:
    [first, *_] = open_meteo.parse(open_meteo_payload(TODAY, 2, {TODAY: 3.0}))
    assert (first.day, first.t_max, first.precip_mm, first.et0_mm) == (TODAY, 28, 3, 5)
    assert first.wind_2m == pytest.approx(3 * 0.748, abs=0.01)
    assert first.rain_probability == 90
    with pytest.raises(WeatherError):
        open_meteo.parse({"error": True})


def test_bright_sky_aggregates_hours() -> None:
    days = bright_sky.aggregate(
        [*bright_sky_hours(TODAY), *bright_sky_hours(TODAY + timedelta(1), 6)]
    )
    [day] = days  # the second day has too few hours
    assert (day.t_min, day.t_max, day.precip_mm) == (10, 21.5, 2)
    assert day.wind_2m == pytest.approx(5 * 0.748, abs=0.01)
    assert day.solar_mj == pytest.approx(13 * 0.2 * 3.6)
    assert 60 < (day.rh_mean or 0) <= 100  # odd hours from the dew point
    assert day.rain_probability == 40


async def test_fetch_errors(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    session = MagicMock()
    aioclient_mock.get(open_meteo.URL, status=500)
    aioclient_mock.get(bright_sky.URL, status=404)
    from homeassistant.helpers.aiohttp_client import async_get_clientsession  # noqa: PLC0415

    session = async_get_clientsession(hass)
    with pytest.raises(WeatherError, match="HTTP 500"):
        await open_meteo.async_fetch(session, 52.5, 13.4, "UTC", past_days=1, forecast_days=1)
    with pytest.raises(WeatherError, match="Germany only"):
        await bright_sky.async_fetch(session, 40.0, -3.7, "UTC", start=TODAY, end=TODAY)
    aioclient_mock.clear_requests()
    aioclient_mock.get(bright_sky.URL, json={"weather": None})
    with pytest.raises(WeatherError):
        await bright_sky.async_fetch(session, 52.5, 13.4, "UTC", start=TODAY, end=TODAY)
    aioclient_mock.clear_requests()
    aioclient_mock.get(bright_sky.URL, status=503)
    with pytest.raises(WeatherError, match="503"):
        await bright_sky.async_fetch(session, 52.5, 13.4, "UTC", start=TODAY, end=TODAY)
    aioclient_mock.clear_requests()
    aioclient_mock.get(open_meteo.URL, exc=TimeoutError())
    aioclient_mock.get(bright_sky.URL, exc=TimeoutError())
    with pytest.raises(WeatherError, match="not reachable"):
        await open_meteo.async_fetch(session, 52.5, 13.4, "UTC", past_days=1, forecast_days=1)
    with pytest.raises(WeatherError, match="not reachable"):
        await bright_sky.async_fetch(session, 52.5, 13.4, "UTC", start=TODAY, end=TODAY)


async def test_own_sensors_from_statistics_and_forecast(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(NOW)
    yesterday = dt_util.start_of_local_day(TODAY - timedelta(days=1)).timestamp()
    rows = {
        "sensor.rain": [{"start": yesterday, "change": 4.0, "max": 9.0}],
        "sensor.et0": [{"start": yesterday, "change": None, "max": 3.5}],  # resets daily
        "sensor.temp": [{"start": yesterday, "min": 11.0, "max": 24.0, "mean": 17.0}],
        "sensor.sun": [{"start": yesterday, "mean": 200.0}],
    }
    config = {
        home_assistant.RAIN: "sensor.rain",
        home_assistant.ET0: "sensor.et0",
        home_assistant.TEMPERATURE: "sensor.temp",
        home_assistant.RADIATION: "sensor.sun",
    }
    recorder = MagicMock()
    recorder.async_add_executor_job = hass.async_add_executor_job
    hass.config.components.add("recorder")
    with (
        patch.object(home_assistant, "get_instance", return_value=recorder),
        patch.object(home_assistant.statistics, "statistics_during_period", return_value=rows),
    ):
        [day] = await home_assistant.async_fetch_history(
            hass, config, TODAY - timedelta(days=3), TODAY
        )
    assert (day.day, day.precip_mm, day.et0_mm, day.t_min, day.t_max) == (
        TODAY - timedelta(days=1),
        4,
        3.5,
        11,
        24,
    )
    assert day.solar_mj == pytest.approx(17.28)
    assert await home_assistant.async_fetch_history(hass, {}, TODAY, TODAY) == []

    async def forecasts(call: ServiceCall) -> dict[str, Any]:
        return {
            "weather.home": {
                "forecast": [
                    {
                        "datetime": f"{TODAY + timedelta(1)}T12:00:00+00:00",
                        "temperature": 20,
                        "templow": 9,
                        "precipitation": 6.5,
                        "precipitation_probability": 70,
                    },
                    {"datetime": "nonsense"},
                    "not a dict",
                ]
            }
        }

    hass.services.async_register(
        "weather", "get_forecasts", forecasts, supports_response=SupportsResponse.ONLY
    )
    [tomorrow] = await home_assistant.async_fetch_forecast(hass, "weather.home")
    assert (tomorrow.t_max, tomorrow.t_min, tomorrow.precip_mm) == (20, 9, 6.5)
    assert await home_assistant.async_fetch_forecast(hass, "weather.missing") == []
    hass.services.async_remove("weather", "get_forecasts")
    with pytest.raises(WeatherError):
        await home_assistant.async_fetch_forecast(hass, "weather.home")


# ---------------------------------------------------------------- coordinator and sensors
def _entry(*sources: dict[str, Any]) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
        subentries_data=[
            ConfigSubentryData(
                data=source,
                subentry_type="weather",
                title=source["source"],
                unique_id=source["source"],
            )
            for source in sources
        ],
    )


async def test_weather_drives_the_water_balance(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    hass_ws_client: WebSocketGenerator,
) -> None:
    today = dt_util.now().date()  # real time: the WebSocket token must stay valid
    payload = open_meteo_payload(
        today - timedelta(days=30),
        34,
        {today - timedelta(days=20): 12.0, today + timedelta(1): 2.0},
    )
    aioclient_mock.get(open_meteo.URL, json=payload)
    entry = _entry({"source": "open_meteo"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    manager = entry.runtime_data.manager
    shrub = await manager.async_create_plant(
        {"name": "Rose", "category": "shrub", "position": {"x": 0, "y": 0}, "min_temperature_c": 15}
    )
    hass.states.async_set(VALVE, "off")
    zone = await manager.async_save_shape(
        {
            "kind": "zone",
            "label": "Beet",
            "geometry": {"type": "rect", "cx": 0, "cy": 0, "w": 4, "h": 4, "rotation": 0},
            "irrigation": {"entity_id": VALVE, "emitter": "rotor", "rate_mm_h": 10},
        }
    )
    await hass.services.async_call(DOMAIN, "refresh_weather", blocking=True)
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "plant_garden/water/summary"})
    summary = (await client.receive_json())["result"]
    assert summary["configured"] is True
    assert summary["sources"] == [
        {"source": "open_meteo", "title": "open_meteo", "ok": True, "error": None, "days": 34}
    ]
    forecast = [w["day"] for w in summary["weather"] if w["forecast"]]
    assert forecast == [(today + timedelta(d)).isoformat() for d in (1, 2, 3)]
    rose = summary["plants"][shrub.id]
    # shrub on loam: 0.6 m x 130 mm/m = 78 mm, needs water beyond 39 mm.
    # 31 days x 2.5 mm ETc minus 8 mm effective rain, capped at 78 mm
    assert (rose["taw"], rose["raw"]) == (78, 39)
    assert rose["depletion"] == 69.5
    assert rose["needs_water"] is True
    assert rose["frost"] == 14  # nights of 14 °C, the plant wants 15 °C
    assert len(rose["days"]) == 14
    # the outlook: water today, then 2.5 mm a day from field capacity
    assert [(d["depletion"], d["water"]) for d in rose["outlook"]] == [
        (69.5, True),
        (2.5, False),
        (5, False),
        (7.5, False),
    ]
    assert rose["outlook"][0]["day"] == today.isoformat()
    advice = summary["zones"][zone.id]
    assert advice["recommended"] is True
    # 69.5 mm minus 0 mm expected (2 mm tomorrow is intercepted) at 7.5 mm/h, capped
    assert (advice["minutes"], advice["reason"]) == (240, "dry")

    assert hass.states.get("binary_sensor.rose_needs_water").state == "on"
    assert hass.states.get("sensor.rose_soil_water_deficit").state == "69.5"
    assert hass.states.get("binary_sensor.beet_irrigation_recommended").state == "on"
    assert hass.states.get("sensor.beet_recommended_run_time").state == "240"
    assert hass.states.get("sensor.garten_evaporation_et0_today").state == "5.0"
    assert hass.states.get("sensor.garten_rain_tomorrow").state == "2.0"

    # watering refills the bucket (recomputed without fetching)
    tracker = entry.runtime_data.irrigation
    await tracker.async_log_watering({shrub.id: 60 * 0.785})

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=5))
    await hass.async_block_till_done()
    # 47.1 L over the 1.2 m crown of a shrub (1.13 m²) refill 41.6 mm
    deficit = float(hass.states.get("sensor.rose_soil_water_deficit").state)
    assert deficit == pytest.approx(69.5 - 60 * 0.785 / (3.14159 * 0.36), abs=0.05)
    assert hass.states.get("binary_sensor.rose_needs_water").state == "off"

    # a failing service keeps the stored days and reports its error
    aioclient_mock.clear_requests()
    aioclient_mock.get(open_meteo.URL, status=500)
    await client.send_json_auto_id({"type": "plant_garden/water/refresh"})
    after = (await client.receive_json())["result"]
    assert after["sources"][0]["ok"] is False
    assert after["plants"][shrub.id]["days"][-1]["et0"] == 5


async def test_no_weather_source(hass: HomeAssistant, hass_ws_client: WebSocketGenerator) -> None:
    entry = _entry()
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    await entry.runtime_data.manager.async_create_plant({"name": "Minze"})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "plant_garden/water/summary"})
    summary = (await client.receive_json())["result"]
    assert summary["configured"] is False
    assert summary["weather"] == []
    assert hass.states.get("sensor.garten_rain_today").state == "unknown"
    # the new plant is computed after a short pause that batches edits
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=5))
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.minze_needs_water").state == "off"


async def test_refresh_action_without_garden(hass: HomeAssistant) -> None:
    entry = _entry()
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_unload(entry.entry_id)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "refresh_weather", blocking=True)


async def test_bright_sky_and_own_sensors_in_the_coordinator(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, aioclient_mock: AiohttpClientMocker
) -> None:
    freezer.move_to(NOW)
    hours = [h for i in range(-2, 2) for h in bright_sky_hours(TODAY + timedelta(days=i))]
    aioclient_mock.get(bright_sky.URL, json={"weather": hours})
    entry = _entry(
        {"source": "bright_sky"}, {"source": "home_assistant", "weather_entity": "weather.x"}
    )
    entry.add_to_hass(hass)
    with (
        patch.object(home_assistant, "async_fetch_forecast", return_value=[]) as forecast,
        patch.object(home_assistant, "async_fetch_history", return_value=[]),
    ):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    assert forecast.called
    data = entry.runtime_data.water.data
    assert [s.source for s in data.sources] == ["home_assistant", "bright_sky"]
    assert data.day(TODAY) is not None
    assert data.et0_method[TODAY.isoformat()] == "penman_monteith"


# ---------------------------------------------------------------- subentry flow
async def _start(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, Any]:
    return await hass.config_entries.subentries.async_init(
        (entry.entry_id, "weather"), context={"source": "user"}
    )


async def test_add_a_weather_service(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, aioclient_mock: AiohttpClientMocker
) -> None:
    result = await _start(hass, loaded_entry)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"source": "open_meteo"}
    )
    assert result["step_id"] == "service"
    assert result["description_placeholders"]["service"] == "Open-Meteo"
    aioclient_mock.get(open_meteo.URL, status=500)
    result = await hass.config_entries.subentries.async_configure(result["flow_id"], {})
    assert result["errors"] == {"base": "cannot_connect"}
    aioclient_mock.clear_requests()
    aioclient_mock.get(open_meteo.URL, json=open_meteo_payload(TODAY, 2))
    result = await hass.config_entries.subentries.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"source": "open_meteo"}

    # the same service twice is refused; services have nothing to reconfigure
    result = await _start(hass, loaded_entry)
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"source": "open_meteo"}
    )
    assert result["reason"] == "already_configured"
    [subentry] = loaded_entry.subentries.values()
    result = await hass.config_entries.subentries.async_init(
        (loaded_entry.entry_id, "weather"),
        context={"source": "reconfigure", "subentry_id": subentry.subentry_id},
    )
    assert result["reason"] == "nothing_to_configure"


async def test_add_bright_sky(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, aioclient_mock: AiohttpClientMocker
) -> None:
    result = await _start(hass, loaded_entry)
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"source": "bright_sky"}
    )
    aioclient_mock.get(bright_sky.URL, json={"weather": []})
    result = await hass.config_entries.subentries.async_configure(result["flow_id"], {})
    assert result["errors"] == {"base": "cannot_connect"}  # no data for this place
    aioclient_mock.clear_requests()
    today = dt_util.now().date()
    aioclient_mock.get(bright_sky.URL, json={"weather": bright_sky_hours(today)})
    result = await hass.config_entries.subentries.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Bright Sky (DWD)"


async def test_own_sensors_flow(hass: HomeAssistant, loaded_entry: MockConfigEntry) -> None:
    hass.config.language = "de"
    result = await _start(hass, loaded_entry)
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"source": "home_assistant"}
    )
    assert result["step_id"] == "sensors"
    result = await hass.config_entries.subentries.async_configure(result["flow_id"], {})
    assert result["errors"] == {"base": "no_sensor"}
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"et0_entity": "sensor.et0"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Eigene Sensoren"
    [subentry] = loaded_entry.subentries.values()

    result = await hass.config_entries.subentries.async_init(
        (loaded_entry.entry_id, "weather"),
        context={"source": "reconfigure", "subentry_id": subentry.subentry_id},
    )
    assert result["step_id"] == "sensors"
    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"], {"et0_entity": "sensor.et0", "rain_entity": "sensor.rain"}
    )
    assert result["reason"] == "reconfigure_successful"
    assert loaded_entry.subentries[subentry.subentry_id].data == {
        "source": "home_assistant",
        "et0_entity": "sensor.et0",
        "rain_entity": "sensor.rain",
    }


def test_rounding_keeps_the_house_private() -> None:
    from custom_components.plant_garden.weather.base import round_coordinate  # noqa: PLC0415

    assert round_coordinate(48.13743) == 48.14  # Munich, about 1 km
