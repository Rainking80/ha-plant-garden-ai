"""Irrigation tracking: zone runs from entity states, water per plant, statistics.

The integration never switches anything (spec 4.5): it watches the entity linked
to each zone, turns every run into an IrrigationEvent and shares the water out
to the plants the zone reaches. Open runs are persisted, gaps are filled from
the recorder history when the integration starts.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from functools import partial
import logging
import math
from typing import Any

from homeassistant.components.recorder import get_instance, history
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN, UnitOfVolume
from homeassistant.core import CALLBACK_TYPE, Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_change,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now
from homeassistant.util.unit_conversion import VolumeConverter

from .const import DOMAIN, EVENT_IRRIGATION_FINISHED
from .geometry import Footprint, area, crown_diameter, footprints, zone_coverage
from .models import Emitter, IrrigationEvent, PlantWater, Shape, WaterSource

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "plant_garden.irrigation"
STORAGE_VERSION = 1

RUNNING_STATES = frozenset({"on", "open", "opening"})
GONE_STATES = frozenset({STATE_UNAVAILABLE, STATE_UNKNOWN})
MIN_RUN_S = 5  # shorter switching is a glitch or a test click, not irrigation
TICK = timedelta(minutes=1)
HISTORY_DAYS = 14


def is_running(state: str | None) -> bool:
    return state in RUNNING_STATES


def _volume_liters(value: str | None, unit: str | None) -> float | None:
    """A meter reading in litres, or None if it is not a number in a volume unit."""
    try:
        number = float(value) if value is not None else None
    except ValueError:
        return None
    if number is None or unit not in VolumeConverter.VALID_UNITS:
        return None
    return VolumeConverter.convert(number, unit, UnitOfVolume.LITERS)


def distribute(
    zone: Shape,
    hours: float,
    prints: dict[str, Footprint],
    meter_liters: float | None = None,
) -> tuple[WaterSource, float | None, float | None, list[PlantWater]]:
    """Water of one zone run: (source, litres delivered, depth in mm, per plant).

    Area zones spread the water evenly: depth = litres x efficiency / zone area,
    a plant gets depth x the share of it inside the zone. Drip zones give each
    reached plant its drippers' litres instead.
    """
    settings = zone.irrigation
    if settings is None:
        return WaterSource.UNKNOWN, None, None, []
    coverage = zone_coverage(zone, prints)
    efficiency = settings.effective_efficiency
    zone_area = area(zone.geometry)

    if settings.emitter is Emitter.DRIP:
        count = len(coverage)
        if meter_liters is not None:
            source, delivered = WaterSource.METER, meter_liters
        elif settings.drip_l_h is not None:
            source, delivered = WaterSource.ESTIMATE, settings.drip_l_h * hours * count
        elif settings.flow_l_min is not None:
            source, delivered = WaterSource.ESTIMATE, settings.flow_l_min * 60 * hours
        else:
            return WaterSource.UNKNOWN, None, None, []
        per_plant = delivered * efficiency / count if count else 0.0
        plants = [
            PlantWater(
                plant_id=plant_id,
                liters=round(per_plant, 3),
                mm=round(per_plant / prints[plant_id].area, 3) if prints[plant_id].area else 0.0,
            )
            for plant_id in coverage
        ]
        return source, round(delivered, 3), None, plants

    if meter_liters is not None:
        source, delivered = WaterSource.METER, meter_liters
    elif settings.rate_mm_h is not None:
        source, delivered = WaterSource.ESTIMATE, settings.rate_mm_h * hours * zone_area
    elif settings.flow_l_min is not None:
        source, delivered = WaterSource.ESTIMATE, settings.flow_l_min * 60 * hours
    else:
        return WaterSource.UNKNOWN, None, None, []
    depth = delivered * efficiency / zone_area if zone_area > 0 else 0.0
    plants = []
    for plant_id, share in coverage.items():
        mm = depth * share
        plants.append(
            PlantWater(
                plant_id=plant_id,
                liters=round(mm * prints[plant_id].area, 3),
                mm=round(mm, 3),
            )
        )
    return source, round(delivered, 3), round(depth, 3), plants


@dataclass(slots=True)
class OpenRun:
    """A zone that is running right now (persisted across restarts)."""

    zone_id: str
    entity_id: str
    started_at: datetime
    meter_start: float | None = None  # litres
    reconstructed: bool = False

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["started_at"] = self.started_at.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> OpenRun:
        return cls(
            zone_id=data["zone_id"],
            entity_id=data["entity_id"],
            started_at=datetime.fromisoformat(data["started_at"]),
            meter_start=data.get("meter_start"),
            reconstructed=bool(data.get("reconstructed", False)),
        )


class IrrigationTracker:
    """Turns state changes of zone entities into irrigation events."""

    def __init__(
        self,
        hass: HomeAssistant,
        manager: Any,  # GardenManager (import cycle)
        max_runtime_hours: Callable[[], float],
    ) -> None:
        self.hass = hass
        self._manager = manager
        self._max_runtime_hours = max_runtime_hours
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._open: dict[str, OpenRun] = {}
        self._checked: dict[str, datetime] = {}  # zone -> history handled up to here
        self._unsubs: list[CALLBACK_TYPE] = []
        self._unsub_states: CALLBACK_TYPE | None = None
        self._watched: dict[str, str] = {}  # zone id -> entity id currently tracked
        self._summary: dict[str, Any] = {"plants": {}, "zones": {}}

    # ------------------------------------------------------------ lifecycle
    async def async_start(self) -> None:
        stored = await self._store.async_load() or {}
        self._open = {
            zone_id: OpenRun.from_dict(data) for zone_id, data in stored.get("open", {}).items()
        }
        self._checked = {
            zone_id: datetime.fromisoformat(value)
            for zone_id, value in stored.get("checked", {}).items()
        }
        await self._async_reconcile()
        self._subscribe_states()
        self._unsubs.append(self._manager.async_subscribe(self._on_garden_change))
        self._unsubs.append(async_track_time_interval(self.hass, self._async_tick, TICK))
        self._unsubs.append(
            async_track_time_change(self.hass, self._async_midnight, hour=0, minute=0, second=5)
        )
        await self.async_refresh_summary()

    async def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        now = dt_util.utcnow()
        for zone_id in self._watched:
            self._checked[zone_id] = now
        await self._store.async_save(self._data_to_save())

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "open": {zone_id: run.as_dict() for zone_id, run in self._open.items()},
            "checked": {zone_id: at.isoformat() for zone_id, at in self._checked.items()},
        }

    def _schedule_save(self) -> None:
        self._store.async_delay_save(self._data_to_save, 1)

    # ------------------------------------------------------------ zones
    def _zones(self) -> dict[str, Shape]:
        return {zone.id: zone for zone in self._manager.zones()}

    def _zone_entities(self) -> dict[str, str]:
        return {
            zone.id: zone.irrigation.entity_id
            for zone in self._manager.zones()
            if zone.irrigation and zone.irrigation.entity_id
        }

    @callback
    def _on_garden_change(self, change: Any) -> None:
        if change.kind != "layout":
            return
        entities = self._zone_entities()
        changed = {
            zone_id
            for zone_id in entities.keys() | self._watched.keys()
            if entities.get(zone_id) != self._watched.get(zone_id)
        }
        if not changed:
            return
        now = dt_util.utcnow()
        for zone_id in changed:
            # a zone that was removed or relinked ends its run now
            if zone_id in self._open:
                self._finish(zone_id, now, uncertain=False, reconstructed=False)
            self._checked.pop(zone_id, None)
        self._subscribe_states()
        # newly linked entities that are running already count from now
        for zone_id in changed & entities.keys():
            self._checked[zone_id] = now
            if (state := self.hass.states.get(entities[zone_id])) is not None:
                self._apply(zone_id, state.state, now, reconstructed=False)
        self._schedule_save()

    def _subscribe_states(self) -> None:
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        self._watched = self._zone_entities()
        if self._watched:
            self._unsub_states = async_track_state_change_event(
                self.hass, set(self._watched.values()), self._on_state_event
            )

    # ------------------------------------------------------------ state machine
    @callback
    def _on_state_event(self, event: Event[EventStateChangedData]) -> None:
        new_state = event.data["new_state"]
        old_state = event.data["old_state"]
        if new_state is None or (old_state is not None and old_state.state == new_state.state):
            return
        for zone_id, entity_id in self._watched.items():
            if entity_id == event.data["entity_id"]:
                self._apply(zone_id, new_state.state, new_state.last_changed, reconstructed=False)
        self._schedule_save()

    @callback
    def _apply(self, zone_id: str, state: str, at: datetime, *, reconstructed: bool) -> None:
        """Advance one zone to a new entity state observed at `at`."""
        self._checked[zone_id] = max(at, self._checked.get(zone_id, at))
        run = self._open.get(zone_id)
        if is_running(state):
            if run is None:
                entity_id = self._watched.get(zone_id) or self._zone_entities().get(zone_id, "")
                self._open[zone_id] = OpenRun(
                    zone_id=zone_id,
                    entity_id=entity_id,
                    started_at=at,
                    meter_start=None if reconstructed else self._meter(zone_id),
                    reconstructed=reconstructed,
                )
                self._manager.notify_irrigation()
            return
        if run is not None:
            self._finish(zone_id, at, uncertain=state in GONE_STATES, reconstructed=reconstructed)

    @callback
    def _finish(self, zone_id: str, end: datetime, *, uncertain: bool, reconstructed: bool) -> None:
        run = self._open.pop(zone_id)
        ir.async_delete_issue(self.hass, DOMAIN, f"long_run_{zone_id}")
        meter_end = None if reconstructed else self._meter(zone_id)
        meter_liters = (
            meter_end - run.meter_start
            if meter_end is not None and run.meter_start is not None
            else None
        )
        if meter_liters is not None and meter_liters < 0:
            meter_liters = None  # the meter was reset during the run
        self.hass.async_create_task(
            self._async_store_run(
                run, end, uncertain, reconstructed or run.reconstructed, meter_liters
            ),
            eager_start=True,
        )

    def _meter(self, zone_id: str) -> float | None:
        zone = self._zones().get(zone_id)
        meter = zone.irrigation.meter_entity_id if zone and zone.irrigation else None
        state = self.hass.states.get(meter) if meter else None
        if state is None:
            return None
        return _volume_liters(state.state, state.attributes.get("unit_of_measurement"))

    async def _async_store_run(
        self,
        run: OpenRun,
        end: datetime,
        uncertain: bool,
        reconstructed: bool,
        meter_liters: float | None,
    ) -> None:
        if (end - run.started_at).total_seconds() < MIN_RUN_S:
            self._manager.notify_irrigation()
            return
        zone = self._zones().get(run.zone_id)
        if zone is None:
            return
        event = await self._async_zone_event(
            zone,
            run.started_at,
            end,
            meter_liters,
            uncertain=uncertain,
            reconstructed=reconstructed,
        )
        if await self._manager.async_insert_event(event):
            self.hass.bus.async_fire(
                EVENT_IRRIGATION_FINISHED,
                {
                    "zone_id": zone.id,
                    "zone": zone.label,
                    "entity_id": run.entity_id,
                    "started_at": event.started_at.isoformat(),
                    "ended_at": event.ended_at.isoformat(),
                    "duration_s": round(event.duration_s),
                    "liters": event.liters,
                    "uncertain": event.uncertain,
                },
            )
        await self.async_refresh_summary()

    async def _async_zone_event(
        self,
        zone: Shape,
        start: datetime,
        end: datetime,
        meter_liters: float | None,
        *,
        uncertain: bool = False,
        reconstructed: bool = False,
        note: str = "",
    ) -> IrrigationEvent:
        prints = await self._async_footprints()
        hours = (end - start).total_seconds() / 3600
        source, liters, depth, plants = distribute(zone, hours, prints, meter_liters)
        return IrrigationEvent(
            id=ulid_now(),
            zone_id=zone.id,
            started_at=start,
            ended_at=end,
            day=dt_util.as_local(start).date(),
            source=source,
            liters=liters,
            depth_mm=depth,
            uncertain=uncertain,
            reconstructed=reconstructed,
            note=note,
            plants=plants,
        )

    async def _async_footprints(self) -> dict[str, Footprint]:
        widths = await self._manager.async_latest_widths()
        return footprints(self._manager.watered_plants(), self._manager.shapes(), widths)

    # ------------------------------------------------------------ restart
    async def _async_reconcile(self) -> None:
        """Catch up with what happened while the integration was not running."""
        entities = self._zone_entities()
        self._watched = entities
        now = dt_util.utcnow()
        for zone_id in list(self._open):
            if zone_id not in entities:
                del self._open[zone_id]  # zone deleted or unlinked meanwhile
        for zone_id, entity_id in entities.items():
            run = self._open.get(zone_id)
            if run is not None and run.entity_id != entity_id:
                self._finish(zone_id, now, uncertain=True, reconstructed=True)
                run = None
            since = run.started_at if run else self._checked.get(zone_id)
            if since is None:
                since = now  # never seen: a run in progress counts from now
            for state in await self._async_history(entity_id, since):
                self._apply(
                    zone_id, state.state, max(state.last_changed, since), reconstructed=True
                )
            if (current := self.hass.states.get(entity_id)) is not None:
                self._apply(
                    zone_id, current.state, max(current.last_changed, since), reconstructed=True
                )
            self._checked[zone_id] = now
        self._schedule_save()

    async def _async_history(self, entity_id: str, since: datetime) -> list[Any]:
        if "recorder" not in self.hass.config.components:
            return []
        try:
            changes = await get_instance(self.hass).async_add_executor_job(
                partial(
                    history.state_changes_during_period,
                    self.hass,
                    since,
                    entity_id=entity_id,
                    no_attributes=True,
                )
            )
        except Exception:
            _LOGGER.warning("Could not read the history of %s", entity_id, exc_info=True)
            return []
        return list(changes.get(entity_id, []))

    # ------------------------------------------------------------ timers
    async def _async_tick(self, now: datetime) -> None:
        if not self._open:
            return
        limit = timedelta(hours=self._max_runtime_hours())
        zones = self._zones()
        for zone_id, run in self._open.items():
            running = now - run.started_at
            if running > limit:
                zone = zones.get(zone_id)
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    f"long_run_{zone_id}",
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="long_run",
                    translation_placeholders={
                        "zone": (zone.label if zone else None) or run.entity_id,
                        "entity": run.entity_id,
                        "hours": str(round(running.total_seconds() / 3600, 1)),
                    },
                )
        self._manager.notify_irrigation()  # runtime sensors of running zones

    async def _async_midnight(self, now: datetime) -> None:
        await self.async_refresh_summary()

    # ------------------------------------------------------------ manual entries
    async def async_log_watering(
        self, liters: dict[str, float], *, at: datetime | None = None, note: str = ""
    ) -> IrrigationEvent:
        """Watering by hand: litres per plant."""
        at = dt_util.as_utc(at) if at else dt_util.utcnow()
        plants = [self._manager.get_plant(plant_id) for plant_id in liters]  # validates ids
        prints = await self._async_footprints()
        widths = await self._manager.async_latest_widths()
        shares = []
        for plant in plants:
            footprint = prints.get(plant.id)
            ground = (
                footprint.area
                if footprint
                else math.pi * (crown_diameter(plant, widths.get(plant.id)) / 2) ** 2
            )
            amount = liters[plant.id]
            shares.append(
                PlantWater(
                    plant_id=plant.id,
                    liters=round(amount, 3),
                    mm=round(amount / ground, 3) if ground else 0.0,
                )
            )
        event = IrrigationEvent(
            id=ulid_now(),
            zone_id=None,
            started_at=at,
            ended_at=at,
            day=dt_util.as_local(at).date(),
            source=WaterSource.MANUAL,
            liters=round(sum(liters.values()), 3),
            note=note,
            plants=shares,
        )
        await self._manager.async_insert_event(event)
        await self.async_refresh_summary()
        return event

    async def async_log_zone_run(
        self, zone_id: str, minutes: float, *, end: datetime | None = None, note: str = ""
    ) -> IrrigationEvent:
        """A zone run that was not seen (e.g. watered with the hose over the zone)."""
        zone = self._manager.get_zone(zone_id)
        end = dt_util.as_utc(end) if end else dt_util.utcnow()
        start = end - timedelta(minutes=minutes)
        event = await self._async_zone_event(zone, start, end, None, note=note)
        if not await self._manager.async_insert_event(event):
            raise ValueError("a run of this zone starting at that time is already recorded")
        await self.async_refresh_summary()
        return event

    async def async_delete_event(self, event_id: str) -> None:
        await self._manager.async_delete_event(event_id)
        await self.async_refresh_summary()

    # ------------------------------------------------------------ statistics
    async def async_refresh_summary(self) -> None:
        today = dt_util.now().date()
        self._summary = await self._manager.async_water_summary(today, HISTORY_DAYS)
        self._manager.notify_irrigation()

    def running_since(self, zone_id: str) -> datetime | None:
        run = self._open.get(zone_id)
        return run.started_at if run else None

    def summary(self) -> dict[str, Any]:
        """Water per plant and run time per zone, including runs in progress."""
        now = dt_util.utcnow()
        midnight = dt_util.start_of_local_day()
        zones: dict[str, dict[str, Any]] = {}
        for zone_id in self._zones():
            stats = dict(self._summary["zones"].get(zone_id, {}))
            stats.setdefault("runtime_today_s", 0.0)
            stats.setdefault("liters_today", 0.0)
            stats.setdefault("last_run", None)
            run = self._open.get(zone_id)
            stats["running_since"] = run.started_at.isoformat() if run else None
            if run:
                stats["runtime_today_s"] += (now - max(run.started_at, midnight)).total_seconds()
            zones[zone_id] = stats
        return {"plants": self._summary["plants"], "zones": zones}


def water_summary(
    *,
    by_day: dict[str, dict[str, tuple[float, float]]],
    totals: dict[str, tuple[float, str]],
    zone_today: dict[str, tuple[float, float]],
    zone_last: dict[str, str],
    today: date,
    days: int,
) -> dict[str, Any]:
    """Shape the database aggregates for the panel and the sensors."""
    day_keys = [(today - timedelta(days=offset)).isoformat() for offset in range(days - 1, -1, -1)]
    plants: dict[str, dict[str, Any]] = {}
    for plant_id in by_day.keys() | totals.keys():
        daily = by_day.get(plant_id, {})
        total, last = totals.get(plant_id, (0.0, None))
        today_l, today_mm = daily.get(today.isoformat(), (0.0, 0.0))
        plants[plant_id] = {
            "today_l": round(today_l, 2),
            "today_mm": round(today_mm, 2),
            "total_l": round(total, 2),
            "last_watering": last,
            "days": [
                {"day": key, "liters": round(daily[key][0], 2), "mm": round(daily[key][1], 2)}
                if key in daily
                else {"day": key, "liters": 0.0, "mm": 0.0}
                for key in day_keys
            ],
        }
    zones: dict[str, dict[str, Any]] = {}
    for zone_id in zone_today.keys() | zone_last.keys():
        seconds, liters = zone_today.get(zone_id, (0.0, 0.0))
        zones[zone_id] = {
            "runtime_today_s": round(seconds),
            "liters_today": round(liters, 2),
            "last_run": zone_last.get(zone_id),
        }
    return {"plants": plants, "zones": zones}
