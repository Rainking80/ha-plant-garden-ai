"""Weather warnings with what to do: frost, heat, storm, heavy rain, diseases, slugs."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from unittest.mock import patch

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_capture_events
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.alerts import alert_text, garden_alerts
from custom_components.plant_garden.const import DOMAIN, EVENT_WEATHER_ALERT
from custom_components.plant_garden.models import (
    LocationType,
    Plant,
    PlantCategory,
    PlantStatus,
)
from custom_components.plant_garden.water import WaterData
from custom_components.plant_garden.weather.base import DailyWeather

TODAY = date(2026, 5, 10)


def _plant(plant_id: str, **fields: Any) -> Plant:
    now = dt_util.utcnow()
    return Plant(
        id=plant_id, name=fields.pop("name", plant_id), created_at=now, updated_at=now, **fields
    )


def _day(offset: int, **values: Any) -> DailyWeather:
    defaults: dict[str, Any] = {"t_min": 8.0, "t_max": 18.0, "precip_mm": 0.0, "rh_mean": 60.0}
    return DailyWeather(day=TODAY + timedelta(days=offset), **{**defaults, **values})


def _by_kind(alerts: list[Any]) -> dict[str, Any]:
    return {alert.kind: alert for alert in alerts}


def test_frost_heat_storm_and_heavy_rain() -> None:
    plants = [
        _plant("rose", min_temperature_c=-5),
        _plant("tomato", name="Tomate", category=PlantCategory.VEGETABLE),
        _plant("fig", location_type=LocationType.POT),
        _plant("oak", category=PlantCategory.TREE, planted_on=date(2010, 4, 1)),
        _plant("new", category=PlantCategory.SHRUB, planted_on=TODAY - timedelta(days=10)),
        _plant("dead", category=PlantCategory.VEGETABLE, status=PlantStatus.DEAD),
    ]
    weather = [
        _day(0),
        _day(1, t_min=-3.0, precip_mm=30.0, rain_probability=80),
        _day(2, t_max=32.0),
        _day(3, gust_max=75.0),
        _day(5, t_min=-12.0),  # too far ahead
    ]
    alerts = _by_kind(garden_alerts(TODAY, weather, plants, {}))
    assert set(alerts) == {"frost", "heat", "storm", "heavy_rain"}
    frost = alerts["frost"]
    # the rose stands -5 °C; tomatoes and pots freeze below 0 °C; the dead plant is ignored
    assert (frost.day, frost.value, set(frost.plants)) == (
        TODAY + timedelta(1),
        -3,
        {"tomato", "fig"},
    )
    assert set(alerts["heat"].plants) == {"tomato", "fig", "new"}
    assert alerts["heat"].value == 32
    assert set(alerts["storm"].plants) == {"fig", "oak", "new"}
    assert alerts["heavy_rain"].plants == ("fig",)
    assert alerts["frost"].key == "frost-2026-05-11"

    # unlikely rain does not count, a calm week gives nothing
    calm = [_day(i) for i in range(4)]
    calm[1] = _day(1, precip_mm=30.0, rain_probability=20)
    assert garden_alerts(TODAY, calm, plants, {}) == []
    assert garden_alerts(TODAY, weather, [], {}) == []


def test_weather_for_fungal_diseases_and_slugs() -> None:
    plants = [
        _plant("phlox", name="Phlox"),
        _plant("lavender", name="Lavendel"),
        _plant("rose", name="Rose"),
        _plant("lettuce", name="Kopfsalat", category=PlantCategory.VEGETABLE),
    ]
    knowledge = {
        # what the assistant found out wins over the name
        "phlox": {"sections": [{"topic": "diseases", "text": "Anfällig für Echten Mehltau."}]},
        "lavender": {"sections": [{"topic": "diseases", "text": "Kaum Krankheiten."}]},
    }
    humid = [_day(i, t_min=14.0, t_max=22.0, rh_mean=90.0) for i in range(-2, 4)]
    alerts = _by_kind(garden_alerts(TODAY, humid, plants, knowledge))
    assert set(alerts) == {"fungal"}
    assert set(alerts["fungal"].plants) == {"phlox", "rose"}
    assert alerts["fungal"].day == TODAY + timedelta(3)

    wet = [_day(-1, precip_mm=6.0, t_min=9.0), _day(0, precip_mm=4.0, t_min=8.0)]
    alerts = _by_kind(garden_alerts(TODAY, wet, plants, knowledge))
    assert set(alerts["slugs"].plants) == {"lettuce"}
    # cold rain is no slug weather
    cold = [_day(-1, precip_mm=6.0, t_min=1.0), _day(0, precip_mm=4.0, t_min=2.0)]
    assert garden_alerts(TODAY, cold, plants, knowledge) == []


def test_alert_texts() -> None:
    alerts = _by_kind(
        garden_alerts(
            TODAY,
            [_day(1, t_min=-4.0)],
            [_plant("fig", name="Feige", location_type=LocationType.POT)],
            {},
        )
    )
    title, message = alert_text(alerts["frost"], "de", ["Feige"])
    assert title == "Plant Garden: Frost"
    assert message.startswith("Bis -4 °C ab 11.05. - Kübel ins Haus")
    assert message.endswith("Betrifft: Feige")
    title, message = alert_text(alerts["frost"], "en", [f"P{i}" for i in range(10)])
    assert "Down to -4 °C from May 11" in message
    assert message.endswith("P7 …")


async def test_notifies_once_and_answers_with_the_water_summary(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    entry = MockConfigEntry(domain=DOMAIN, title="Garten", data={}, options={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()  # the first weather fetch, else it overwrites ours
    await entry.runtime_data.manager.async_create_plant({"name": "Feige", "location_type": "pot"})
    today = dt_util.now().date()
    frost = DailyWeather(day=today + timedelta(days=1), t_min=-4.0, t_max=3.0)
    events = async_capture_events(hass, EVENT_WEATHER_ALERT)
    water = entry.runtime_data.water
    with patch(
        "custom_components.plant_garden.alerts.persistent_notification.async_create"
    ) as notify:
        water.async_set_updated_data(WaterData(weather=[frost]))
        water.async_set_updated_data(WaterData(weather=[frost]))  # the next hour: quiet
        await hass.async_block_till_done()
    assert notify.call_count == 1
    assert notify.call_args.kwargs["notification_id"] == "plant_garden_frost"
    [event] = events
    assert event.data["kind"] == "frost"
    assert event.data["plant_names"] == ["Feige"]

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "plant_garden/water/summary"})
    summary = (await client.receive_json())["result"]
    [alert] = summary["alerts"]
    assert (alert["kind"], alert["value"]) == ("frost", -4)

    # switched off: still shown in the panel, no notification
    hass.config_entries.async_update_entry(entry, options={"weather_alerts": False})
    entry.runtime_data.alerts._sent.clear()
    with patch(
        "custom_components.plant_garden.alerts.persistent_notification.async_create"
    ) as notify:
        water.async_set_updated_data(WaterData(weather=[frost]))
    assert notify.call_count == 0
    assert entry.runtime_data.alerts.summary()[0]["kind"] == "frost"
