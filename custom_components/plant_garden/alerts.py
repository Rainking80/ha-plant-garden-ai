"""Warnings from the weather, with what to do (D-039).

Frost below a plant's limit, heat, storm and heavy rain in the next days; and
weather that plant diseases (mildew, blight, rust …) and slugs like. Rules only:
no AI call, no costs. Which plants are at risk comes from their category, pot,
planting date and - for diseases and slugs - what the assistant found out about
them (plant knowledge, D-038).

New warnings become a Home Assistant notification and the event
`plant_garden_weather_alert` (option `weather_alerts`, on by default); the panel
shows the current ones on the Water & weather and the Assistant tab.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import CONF_WEATHER_ALERTS, DOMAIN, EVENT_WEATHER_ALERT
from .models import LocationType, Plant, PlantCategory, PlantStatus
from .weather.base import DailyWeather

AHEAD_DAYS = 3  # warnings look this far ahead
HEAT_C = 30.0  # hot day (Tmax)
STORM_KMH = 60.0  # strong gusts (Beaufort 8)
HEAVY_RAIN_MM = 25.0  # a day's rain
LIKELY = 50  # % chance of rain that counts for a forecast day
NEW_PLANT_DAYS = 60  # recently planted: sensitive to heat
YOUNG_PLANT_DAYS = 365  # young trees and shrubs: sensitive to storm
QUIET_DAYS = 2  # no second notification of the same kind within this time

TENDER = frozenset(
    {PlantCategory.VEGETABLE, PlantCategory.ANNUAL, PlantCategory.SUCCULENT, PlantCategory.POTTED}
)
TALL = frozenset({PlantCategory.TREE, PlantCategory.CLIMBER})
# words in the plant knowledge (D-038), German and English
FUNGAL_WORDS = (
    "mehltau", "pilz", "rost", "krautfäule", "braunfäule", "sternrußtau", "grauschimmel",
    "schorf", "monilia", "botrytis", "mildew", "fung", "blight", "rust", "scab", "mould", "mold",
)  # fmt: skip
SLUG_WORDS = ("schnecke", "slug", "snail")
# plants known to suffer from both even before anything was researched
FUNGAL_NAMES = (
    "rose", "rosa", "tomat", "kartoffel", "potato", "gurke", "cucumber", "zucchini",
    "apfel", "apple", "malus", "wein", "vitis", "phlox", "stachelbeer", "gooseberry",
)  # fmt: skip
SLUG_NAMES = (
    "salat", "lettuce", "funkie", "hosta", "dahlie", "dahlia", "tagetes", "rittersporn",
    "delphinium", "lupine", "basilikum", "basil", "kohl", "cabbage",
)  # fmt: skip

TITLES = {
    "de": {
        "frost": "Frost",
        "heat": "Hitze",
        "storm": "Sturm",
        "heavy_rain": "Starkregen",
        "fungal": "Pilzwetter",
        "slugs": "Schneckenwetter",
    },
    "en": {
        "frost": "Frost",
        "heat": "Heat",
        "storm": "Storm",
        "heavy_rain": "Heavy rain",
        "fungal": "Weather for fungal diseases",
        "slugs": "Slug weather",
    },
}
MESSAGES = {
    "de": {
        "frost": "Bis {value} °C ab {day} - Kübel ins Haus oder an die Hauswand stellen, "
        "Empfindliches mit Vlies abdecken, abends nicht mehr gießen.",
        "heat": "Bis {value} °C ab {day} - morgens durchdringend gießen - vor allem Kübel und "
        "frisch Gepflanztes -, mittags schattieren, nicht düngen.",
        "storm": "Böen bis {value} km/h ab {day} - Kübel und Töpfe sichern oder hinlegen, "
        "junge Bäume anbinden, Rankhilfen prüfen.",
        "heavy_rain": "{value} mm Regen am {day} - Bewässerung aussetzen, Untersetzer der "
        "Kübel leeren, Abflüsse freihalten.",
        "fungal": "Mehrere feucht-warme Tage bis {day} - morgens und nur an den Boden "
        "gießen, Blätter trocken halten, befallene Blätter entfernen, nicht über Nacht "
        "nass lassen.",
        "slugs": "Mild und nass bis {day} - abends Schnecken absammeln, Jungpflanzen "
        "schützen (Kragen, Barrieren), morgens statt abends gießen.",
    },
    "en": {
        "frost": "Down to {value} °C from {day}. Bring pots inside or against the house "
        "wall, cover tender plants with fleece, no watering in the evening.",
        "heat": "Up to {value} °C from {day}. Water deeply in the morning - pots and new "
        "plants first -, shade at midday, do not fertilise.",
        "storm": "Gusts up to {value} km/h from {day}. Secure or lay down pots, tie young "
        "trees, check trellises.",
        "heavy_rain": "{value} mm of rain on {day}. Pause the irrigation, empty the saucers "
        "of pots, keep drains clear.",
        "fungal": "Several humid, warm days until {day}. Water in the morning and only at "
        "the soil, keep leaves dry, remove infected leaves.",
        "slugs": "Mild and wet until {day}. Collect slugs in the evening, protect young "
        "plants (collars, barriers), water in the morning, not in the evening.",
    },
}


@dataclass(slots=True, frozen=True)
class Alert:
    kind: str  # frost | heat | storm | heavy_rain | fungal | slugs
    day: date  # from when it applies (diseases and slugs: until when)
    value: float | None  # °C, km/h or mm
    plants: tuple[str, ...]  # plants at risk (ids)

    @property
    def key(self) -> str:
        return f"{self.kind}-{self.day.isoformat()}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "kind": self.kind,
            "day": self.day.isoformat(),
            "value": self.value,
            "plants": list(self.plants),
        }


def _mean(day: DailyWeather) -> float | None:
    if day.t_mean is not None:
        return day.t_mean
    if day.t_min is not None and day.t_max is not None:
        return (day.t_min + day.t_max) / 2
    return None


def _rain(day: DailyWeather, today: date, minimum: float) -> bool:
    """At least `minimum` mm - on a forecast day only if it is likely."""
    if day.precip_mm is None or day.precip_mm < minimum:
        return False
    return day.day <= today or (day.rain_probability or 100) >= LIKELY


def _potted(plant: Plant) -> bool:
    return plant.location_type is LocationType.POT or plant.category is PlantCategory.POTTED


def _planted_within(plant: Plant, today: date, days: int) -> bool:
    return plant.planted_on is not None and 0 <= (today - plant.planted_on).days <= days


def _knowledge_text(info: Mapping[str, Any] | None) -> str:
    if not info:
        return ""
    sections = " ".join(str(s.get("text", "")) for s in info.get("sections") or [])
    return f"{sections} {' '.join(info.get('warnings') or [])}".lower()


def _susceptible(
    plant: Plant, info: Mapping[str, Any] | None, words: Iterable[str], names: Iterable[str]
) -> bool:
    """Known from its knowledge, else from its name or botanical name."""
    text = _knowledge_text(info)
    if text:
        return any(word in text for word in words)
    name = f"{plant.name} {plant.scientific_name or ''}".lower()
    return any(part in name for part in names)


def _days(
    by_day: Mapping[date, DailyWeather], today: date, first: int, last: int
) -> list[DailyWeather]:
    """The weather of today + first ... today + last (days without data left out)."""
    days = (today + timedelta(days=i) for i in range(first, last + 1))
    return [by_day[d] for d in days if d in by_day]


def _frost(living: list[Plant], ahead: list[DailyWeather]) -> Alert | None:
    """Below a plant's own limit; tender and potted plants below 0 °C."""
    frozen: dict[str, date] = {}
    for plant in living:
        limit = plant.min_temperature_c
        if limit is None and (plant.category in TENDER or _potted(plant)):
            limit = 0.0
        if limit is None:
            continue
        first = next((d.day for d in ahead if d.t_min is not None and d.t_min < limit), None)
        if first is not None:
            frozen[plant.id] = first
    lows = [d.t_min for d in ahead if d.t_min is not None]
    if not frozen or not lows:
        return None
    return Alert("frost", min(frozen.values()), min(lows), tuple(frozen))


def _heat(living: list[Plant], ahead: list[DailyWeather], today: date) -> Alert | None:
    hot = [d for d in ahead if d.t_max is not None and d.t_max >= HEAT_C]
    if not hot:
        return None
    at_risk = tuple(
        p.id
        for p in living
        if _potted(p)
        or p.category is PlantCategory.VEGETABLE
        or _planted_within(p, today, NEW_PLANT_DAYS)
    )
    return Alert("heat", hot[0].day, max(d.t_max or 0 for d in hot), at_risk)


def _storm(living: list[Plant], ahead: list[DailyWeather], today: date) -> Alert | None:
    windy = [d for d in ahead if d.gust_max is not None and d.gust_max >= STORM_KMH]
    if not windy:
        return None
    at_risk = tuple(
        p.id
        for p in living
        if _potted(p) or p.category in TALL or _planted_within(p, today, YOUNG_PLANT_DAYS)
    )
    return Alert("storm", windy[0].day, max(d.gust_max or 0 for d in windy), at_risk)


def _heavy_rain(living: list[Plant], ahead: list[DailyWeather], today: date) -> Alert | None:
    wet = [d for d in ahead if _rain(d, today, HEAVY_RAIN_MM)]
    if not wet:
        return None
    return Alert(
        "heavy_rain", wet[0].day, wet[0].precip_mm, tuple(p.id for p in living if _potted(p))
    )


def _fungal(
    living: list[Plant], around: list[DailyWeather], today: date, knowledge: Mapping[str, Any]
) -> Alert | None:
    """At least 3 humid, warm days around today (2 back, 3 ahead)."""
    humid = [
        d
        for d in around
        if (mean := _mean(d)) is not None
        and 12 <= mean <= 26
        and (_rain(d, today, 1) or (d.rh_mean or 0) >= 85)
    ]
    if len(humid) < 3:
        return None
    at_risk = tuple(
        p.id for p in living if _susceptible(p, knowledge.get(p.id), FUNGAL_WORDS, FUNGAL_NAMES)
    )
    return Alert("fungal", humid[-1].day, None, at_risk) if at_risk else None


def _slugs(
    living: list[Plant], around: list[DailyWeather], today: date, knowledge: Mapping[str, Any]
) -> Alert | None:
    """At least 2 mild, wet days around today (3 back, 2 ahead)."""
    mild_wet = [
        d
        for d in around
        if _rain(d, today, 2) and (d.t_min if d.t_min is not None else _mean(d) or 0) >= 5
    ]
    if len(mild_wet) < 2:
        return None
    at_risk = tuple(
        p.id
        for p in living
        if _susceptible(p, knowledge.get(p.id), SLUG_WORDS, SLUG_NAMES)
        or p.category is PlantCategory.VEGETABLE
    )
    return Alert("slugs", mild_wet[-1].day, None, at_risk) if at_risk else None


def garden_alerts(
    today: date,
    weather: list[DailyWeather],
    plants: Iterable[Plant],
    knowledge: Mapping[str, Mapping[str, Any]],
) -> list[Alert]:
    """The warnings of the coming days for the plants in the garden."""
    living = [p for p in plants if p.status not in (PlantStatus.REMOVED, PlantStatus.DEAD)]
    if not living:
        return []
    by_day = {w.day: w for w in weather}
    ahead = _days(by_day, today, 0, AHEAD_DAYS)
    found = [
        _frost(living, ahead),
        _heat(living, ahead, today),
        _storm(living, ahead, today),
        _heavy_rain(living, ahead, today),
        _fungal(living, _days(by_day, today, -2, 3), today, knowledge),
        _slugs(living, _days(by_day, today, -3, 2), today, knowledge),
    ]
    return [alert for alert in found if alert is not None]


def alert_text(alert: Alert, language: str, names: list[str]) -> tuple[str, str]:
    """Title and message of a notification in the garden's language."""
    lang = "de" if language == "de" else "en"
    day = alert.day.strftime("%d.%m.") if lang == "de" else alert.day.strftime("%b %d")
    value = "" if alert.value is None else f"{alert.value:.0f}"
    message = MESSAGES[lang][alert.kind].format(day=day, value=value)
    if names:
        shown = ", ".join(names[:8]) + (" …" if len(names) > 8 else "")
        message += ("\n\nBetrifft: " if lang == "de" else "\n\nPlants: ") + shown
    return f"Plant Garden: {TITLES[lang][alert.kind]}", message


class AlertNotifier:
    """Keeps the current warnings and notifies about new ones once."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        *,
        manager: Any,  # GardenManager
        water: Any,  # WaterCoordinator
        knowledge: Callable[[], Mapping[str, Mapping[str, Any]]],
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._manager = manager
        self._water = water
        self._knowledge = knowledge
        self._store: Store[dict[str, Any]] = Store(hass, 1, f"{DOMAIN}.alerts")
        self._sent: dict[str, str] = {}  # kind -> day of the last notification
        self.current: list[Alert] = []
        self._unsub: CALLBACK_TYPE | None = None

    async def async_setup(self) -> None:
        stored = await self._store.async_load()
        self._sent = dict((stored or {}).get("sent") or {})
        self._unsub = self._water.async_add_listener(self.update)
        self.update()

    @callback
    def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    def summary(self) -> list[dict[str, Any]]:
        return [alert.as_dict() for alert in self.current]

    @callback
    def update(self) -> None:
        """Recompute after every weather or water balance update."""
        data = self._water.data
        if data is None:
            return
        today = dt_util.now().date()
        self.current = garden_alerts(today, data.weather, self._manager.plants, self._knowledge())
        if not self._entry.options.get(CONF_WEATHER_ALERTS, True):
            return
        changed = False
        for alert in self.current:
            last = self._sent.get(alert.kind)
            if last and date.fromisoformat(last) + timedelta(days=QUIET_DAYS) >= today:
                continue
            self._notify(alert)
            self._sent[alert.kind] = today.isoformat()
            changed = True
        if changed:
            self._store.async_delay_save(lambda: {"sent": self._sent}, 1)

    def _notify(self, alert: Alert) -> None:
        names = [self._manager.get_plant(pid).name for pid in alert.plants]
        title, message = alert_text(alert, self.hass.config.language, names)
        persistent_notification.async_create(
            self.hass, message, title=title, notification_id=f"{DOMAIN}_{alert.kind}"
        )
        self.hass.bus.async_fire(
            EVENT_WEATHER_ALERT,
            {**alert.as_dict(), "plant_names": names, "title": title, "message": message},
        )
