"""SQLite storage for records that keep growing (photos, measurements, later time series).

All methods are blocking and must run in the executor. A lock serialises access,
so the connection can be shared between executor threads.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from datetime import date, datetime
import json
import logging
from pathlib import Path
import sqlite3
import threading
from typing import Any

from .models import (
    IrrigationEvent,
    Measurement,
    Photo,
    PhotoEdit,
    PlantWater,
    Source,
    WaterSource,
)

_LOGGER = logging.getLogger(__name__)

# Index i holds the script that upgrades the schema from version i to i + 1.
# Never edit a released migration; append a new one instead.
MIGRATIONS: tuple[str, ...] = (
    """
    CREATE TABLE photos (
        id TEXT PRIMARY KEY,
        plant_id TEXT NOT NULL,
        taken_at TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX photos_by_plant ON photos (plant_id, taken_at);

    CREATE TABLE measurements (
        id TEXT PRIMARY KEY,
        plant_id TEXT NOT NULL,
        measured_on TEXT NOT NULL,
        height_cm REAL,
        width_cm REAL,
        source TEXT NOT NULL,
        confidence REAL,
        photo_id TEXT,
        note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX measurements_by_plant ON measurements (plant_id, measured_on);
    """,
    """
    CREATE TABLE irrigation_events (
        id TEXT PRIMARY KEY,
        zone_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        day TEXT NOT NULL,
        source TEXT NOT NULL,
        liters REAL,
        depth_mm REAL,
        uncertain INTEGER NOT NULL DEFAULT 0,
        reconstructed INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX irrigation_once_per_start
        ON irrigation_events (zone_id, started_at) WHERE zone_id IS NOT NULL;
    CREATE INDEX irrigation_by_day ON irrigation_events (day);

    CREATE TABLE plant_water (
        event_id TEXT NOT NULL REFERENCES irrigation_events (id) ON DELETE CASCADE,
        plant_id TEXT NOT NULL,
        day TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        liters REAL NOT NULL,
        mm REAL NOT NULL,
        PRIMARY KEY (event_id, plant_id)
    );
    CREATE INDEX plant_water_by_plant ON plant_water (plant_id, day);
    """,
    """
    CREATE TABLE weather_daily (
        day TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        fetched_at TEXT NOT NULL
    );
    """,
    """
    CREATE TABLE ai_usage (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        day TEXT NOT NULL,
        feature TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_title TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        plant_id TEXT,
        status TEXT NOT NULL,
        error TEXT,
        input INTEGER NOT NULL DEFAULT 0,
        cached_input INTEGER NOT NULL DEFAULT 0,
        cache_write INTEGER NOT NULL DEFAULT 0,
        output INTEGER NOT NULL DEFAULT 0,
        reasoning INTEGER NOT NULL DEFAULT 0,
        images INTEGER NOT NULL DEFAULT 0,
        cost REAL,
        cost_source TEXT NOT NULL DEFAULT 'unknown',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        request_id TEXT,
        prompt_version TEXT NOT NULL DEFAULT '',
        prompt TEXT,
        response TEXT
    );
    CREATE INDEX ai_usage_by_day ON ai_usage (day);

    CREATE TABLE ai_usage_daily (
        day TEXT NOT NULL,
        feature TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        requests INTEGER NOT NULL,
        errors INTEGER NOT NULL,
        input INTEGER NOT NULL,
        cached_input INTEGER NOT NULL,
        cache_write INTEGER NOT NULL,
        output INTEGER NOT NULL,
        reasoning INTEGER NOT NULL,
        images INTEGER NOT NULL,
        cost REAL,
        unknown_cost INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        PRIMARY KEY (day, feature, provider, model)
    );
    """,
    # 5: assistant - tasks, problems with their log, questions to the user, chat
    """
    CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        plant_id TEXT,
        problem_id TEXT,
        due TEXT,
        repeat_every INTEGER,
        repeat_unit TEXT,
        months TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open',
        source TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        done_at TEXT,
        due_notified TEXT
    );
    CREATE INDEX tasks_by_status ON tasks (status, due);
    CREATE INDEX tasks_by_plant ON tasks (plant_id);

    CREATE TABLE problems (
        id TEXT PRIMARY KEY,
        plant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        observed_on TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        photo_ids TEXT NOT NULL DEFAULT '[]',
        diagnosis TEXT
    );
    CREATE INDEX problems_by_plant ON problems (plant_id, status);

    CREATE TABLE problem_log (
        id TEXT PRIMARY KEY,
        problem_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX problem_log_by_problem ON problem_log (problem_id, ts);

    CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        plant_id TEXT,
        field TEXT,
        question TEXT NOT NULL,
        answer TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        answered_at TEXT
    );
    CREATE INDEX questions_by_status ON questions (status, plant_id);

    CREATE TABLE chat (
        id TEXT PRIMARY KEY,
        plant_id TEXT,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        ts TEXT NOT NULL,
        model TEXT
    );
    CREATE INDEX chat_by_plant ON chat (plant_id, ts);
    """,
    """
    ALTER TABLE photos ADD COLUMN edit TEXT;
    """,
)
SCHEMA_VERSION = len(MIGRATIONS)


class DatabaseError(Exception):
    """The database could not be opened or migrated."""


def _edit_json(edit: PhotoEdit | None) -> str | None:
    return json.dumps(edit.as_dict()) if edit is not None else None


def _photo_from_row(row: sqlite3.Row) -> Photo:
    return Photo(
        id=row["id"],
        plant_id=row["plant_id"],
        taken_at=datetime.fromisoformat(row["taken_at"]),
        uploaded_at=datetime.fromisoformat(row["uploaded_at"]),
        width=row["width"],
        height=row["height"],
        size_bytes=row["size_bytes"],
        tags=json.loads(row["tags"]),
        note=row["note"],
        edit=PhotoEdit.from_dict(json.loads(row["edit"])) if row["edit"] else None,
    )


def _measurement_from_row(row: sqlite3.Row) -> Measurement:
    return Measurement(
        id=row["id"],
        plant_id=row["plant_id"],
        measured_on=date.fromisoformat(row["measured_on"]),
        height_cm=row["height_cm"],
        width_cm=row["width_cm"],
        source=Source(row["source"]),
        confidence=row["confidence"],
        photo_id=row["photo_id"],
        note=row["note"],
    )


def _event_from_row(row: sqlite3.Row) -> IrrigationEvent:
    return IrrigationEvent(
        id=row["id"],
        zone_id=row["zone_id"],
        started_at=datetime.fromisoformat(row["started_at"]),
        ended_at=datetime.fromisoformat(row["ended_at"]),
        day=date.fromisoformat(row["day"]),
        source=WaterSource(row["source"]),
        liters=row["liters"],
        depth_mm=row["depth_mm"],
        uncertain=bool(row["uncertain"]),
        reconstructed=bool(row["reconstructed"]),
        note=row["note"],
    )


class GardenDatabase:
    """Thin, synchronous wrapper around the SQLite file."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._conn: sqlite3.Connection | None = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------ lifecycle
    def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            conn = sqlite3.connect(self.path, check_same_thread=False)
        except sqlite3.Error as err:
            raise DatabaseError(f"Cannot open {self.path}: {err}") from err
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            self._migrate(conn)
        except (sqlite3.Error, DatabaseError) as err:
            conn.close()
            if isinstance(err, DatabaseError):
                raise
            raise DatabaseError(f"Cannot open {self.path}: {err}") from err
        self._conn = conn

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def checkpoint(self) -> None:
        """Write the WAL into the main file (before a backup)."""
        with self._cursor() as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        current = conn.execute("PRAGMA user_version").fetchone()[0]
        if current > SCHEMA_VERSION:
            raise DatabaseError(
                f"Database schema {current} is newer than this version supports "
                f"({SCHEMA_VERSION}); downgrade is not possible"
            )
        for version in range(current, SCHEMA_VERSION):
            _LOGGER.info("Migrating database schema to version %s", version + 1)
            try:
                conn.executescript(
                    f"BEGIN;\n{MIGRATIONS[version]}\nPRAGMA user_version = {version + 1};\nCOMMIT;"
                )
            except sqlite3.Error:
                conn.rollback()
                raise

    @contextmanager
    def _cursor(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            if self._conn is None:
                raise DatabaseError("Database is closed")
            with self._conn:  # commits on success, rolls back on error
                yield self._conn

    def cursor(self) -> AbstractContextManager[sqlite3.Connection]:
        """A locked connection in a transaction, for the tables other modules own."""
        return self._cursor()

    @property
    def schema_version(self) -> int:
        with self._cursor() as conn:
            return int(conn.execute("PRAGMA user_version").fetchone()[0])

    # ------------------------------------------------------------ photos
    def insert_photo(self, photo: Photo) -> None:
        with self._cursor() as conn:
            conn.execute(
                "INSERT INTO photos (id, plant_id, taken_at, uploaded_at, width, height,"
                " size_bytes, tags, note, edit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    photo.id,
                    photo.plant_id,
                    photo.taken_at.isoformat(),
                    photo.uploaded_at.isoformat(),
                    photo.width,
                    photo.height,
                    photo.size_bytes,
                    json.dumps(photo.tags),
                    photo.note,
                    _edit_json(photo.edit),
                ),
            )

    def update_photo(self, photo: Photo) -> None:
        with self._cursor() as conn:
            conn.execute(
                "UPDATE photos SET taken_at = ?, tags = ?, note = ? WHERE id = ?",
                (photo.taken_at.isoformat(), json.dumps(photo.tags), photo.note, photo.id),
            )

    def update_photo_image(self, photo: Photo) -> None:
        """Store a new crop or turn together with the size it gave."""
        with self._cursor() as conn:
            conn.execute(
                "UPDATE photos SET width = ?, height = ?, size_bytes = ?, edit = ? WHERE id = ?",
                (photo.width, photo.height, photo.size_bytes, _edit_json(photo.edit), photo.id),
            )

    def photo_versions(self) -> dict[str, str]:
        """photo_id -> version stamp, for edited photos only (usually few)."""
        with self._cursor() as conn:
            rows = conn.execute("SELECT id, edit FROM photos WHERE edit IS NOT NULL").fetchall()
        return {row["id"]: PhotoEdit.from_dict(json.loads(row["edit"])).version for row in rows}

    def get_photo(self, photo_id: str) -> Photo | None:
        with self._cursor() as conn:
            row = conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
        return _photo_from_row(row) if row else None

    def photos_for_plant(self, plant_id: str) -> list[Photo]:
        """Newest first."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT * FROM photos WHERE plant_id = ? ORDER BY taken_at DESC, id DESC",
                (plant_id,),
            ).fetchall()
        return [_photo_from_row(row) for row in rows]

    def delete_photo(self, photo_id: str) -> None:
        with self._cursor() as conn:
            conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
            conn.execute("UPDATE measurements SET photo_id = NULL WHERE photo_id = ?", (photo_id,))

    def photo_stats(self) -> dict[str, tuple[int, str]]:
        """plant_id -> (number of photos, id of the newest photo)."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT plant_id, COUNT(*) AS n,"
                " (SELECT p2.id FROM photos p2 WHERE p2.plant_id = p.plant_id"
                "  ORDER BY p2.taken_at DESC, p2.id DESC LIMIT 1) AS newest"
                " FROM photos p GROUP BY plant_id"
            ).fetchall()
        return {row["plant_id"]: (row["n"], row["newest"]) for row in rows}

    # ------------------------------------------------------------ measurements
    def insert_measurement(self, measurement: Measurement) -> None:
        with self._cursor() as conn:
            conn.execute(
                "INSERT INTO measurements (id, plant_id, measured_on, height_cm, width_cm,"
                " source, confidence, photo_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                self._measurement_values(measurement),
            )

    def update_measurement(self, measurement: Measurement) -> None:
        with self._cursor() as conn:
            conn.execute(
                "UPDATE measurements SET plant_id = ?, measured_on = ?, height_cm = ?,"
                " width_cm = ?, source = ?, confidence = ?, photo_id = ?, note = ?"
                " WHERE id = ?",
                (*self._measurement_values(measurement)[1:], measurement.id),
            )

    @staticmethod
    def _measurement_values(m: Measurement) -> tuple[Any, ...]:
        return (
            m.id,
            m.plant_id,
            m.measured_on.isoformat(),
            m.height_cm,
            m.width_cm,
            m.source.value,
            m.confidence,
            m.photo_id,
            m.note,
        )

    def get_measurement(self, measurement_id: str) -> Measurement | None:
        with self._cursor() as conn:
            row = conn.execute(
                "SELECT * FROM measurements WHERE id = ?", (measurement_id,)
            ).fetchone()
        return _measurement_from_row(row) if row else None

    def measurements_for_plant(self, plant_id: str) -> list[Measurement]:
        """Oldest first, as needed for charts."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT * FROM measurements WHERE plant_id = ? ORDER BY measured_on, id",
                (plant_id,),
            ).fetchall()
        return [_measurement_from_row(row) for row in rows]

    def delete_measurement(self, measurement_id: str) -> None:
        with self._cursor() as conn:
            conn.execute("DELETE FROM measurements WHERE id = ?", (measurement_id,))

    def latest_sizes(self) -> dict[str, dict[str, Any]]:
        """plant_id -> newest known height and width (each from its own newest row)."""
        result: dict[str, dict[str, Any]] = {}
        with self._cursor() as conn:
            for column in ("height_cm", "width_cm"):
                rows = conn.execute(
                    f"SELECT plant_id, {column} AS value, measured_on FROM ("  # noqa: S608
                    f"  SELECT plant_id, {column}, measured_on, ROW_NUMBER() OVER ("
                    f"    PARTITION BY plant_id ORDER BY measured_on DESC, id DESC) AS rn"
                    f"  FROM measurements WHERE {column} IS NOT NULL"
                    ") WHERE rn = 1"
                ).fetchall()
                for row in rows:
                    entry = result.setdefault(row["plant_id"], {})
                    entry[column] = row["value"]
                    entry[f"{column}_on"] = row["measured_on"]
        return result

    # ------------------------------------------------------------ irrigation
    def insert_event(self, event: IrrigationEvent) -> bool:
        """Store an event with its plant shares. False if the zone run is already known."""
        with self._cursor() as conn:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO irrigation_events (id, zone_id, started_at, ended_at, day,"
                " source, liters, depth_mm, uncertain, reconstructed, note)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    event.id,
                    event.zone_id,
                    event.started_at.isoformat(),
                    event.ended_at.isoformat(),
                    event.day.isoformat(),
                    event.source.value,
                    event.liters,
                    event.depth_mm,
                    int(event.uncertain),
                    int(event.reconstructed),
                    event.note,
                ),
            )
            if cursor.rowcount == 0:
                return False
            conn.executemany(
                "INSERT INTO plant_water (event_id, plant_id, day, ended_at, liters, mm)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (
                        event.id,
                        share.plant_id,
                        event.day.isoformat(),
                        event.ended_at.isoformat(),
                        share.liters,
                        share.mm,
                    )
                    for share in event.plants
                ],
            )
        return True

    def get_event(self, event_id: str) -> IrrigationEvent | None:
        events = self._events("WHERE e.id = ?", (event_id,), 1)
        return events[0] if events else None

    def delete_event(self, event_id: str) -> None:
        with self._cursor() as conn:
            conn.execute("DELETE FROM irrigation_events WHERE id = ?", (event_id,))

    def recent_events(
        self, *, zone_id: str | None = None, plant_id: str | None = None, limit: int = 50
    ) -> list[IrrigationEvent]:
        """Newest first, optionally only one zone's runs or what reached one plant."""
        if zone_id is not None:
            return self._events("WHERE e.zone_id = ?", (zone_id,), limit)
        if plant_id is not None:
            return self._events(
                "WHERE e.id IN (SELECT event_id FROM plant_water WHERE plant_id = ?)",
                (plant_id,),
                limit,
            )
        return self._events("", (), limit)

    def _events(self, where: str, params: tuple[Any, ...], limit: int) -> list[IrrigationEvent]:
        with self._cursor() as conn:
            rows = conn.execute(
                f"SELECT * FROM irrigation_events e {where}"  # noqa: S608 - fixed fragments
                " ORDER BY e.ended_at DESC, e.id DESC LIMIT ?",
                (*params, limit),
            ).fetchall()
            events = [_event_from_row(row) for row in rows]
            if events:
                marks = ",".join("?" * len(events))
                shares = conn.execute(
                    f"SELECT * FROM plant_water WHERE event_id IN ({marks})"  # noqa: S608
                    " ORDER BY plant_id",
                    [event.id for event in events],
                ).fetchall()
                by_id = {event.id: event for event in events}
                for row in shares:
                    by_id[row["event_id"]].plants.append(
                        PlantWater(plant_id=row["plant_id"], liters=row["liters"], mm=row["mm"])
                    )
        return events

    def plant_water_by_day(self, since: date) -> dict[str, dict[str, tuple[float, float]]]:
        """plant_id -> day (ISO) -> (litres, mm) from `since` on."""
        result: dict[str, dict[str, tuple[float, float]]] = {}
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT plant_id, day, SUM(liters) AS liters, SUM(mm) AS mm FROM plant_water"
                " WHERE day >= ? GROUP BY plant_id, day",
                (since.isoformat(),),
            ).fetchall()
        for row in rows:
            result.setdefault(row["plant_id"], {})[row["day"]] = (row["liters"], row["mm"])
        return result

    def plant_totals(self) -> dict[str, tuple[float, str]]:
        """plant_id -> (all litres ever received, end of the latest watering)."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT plant_id, SUM(liters) AS liters, MAX(ended_at) AS last FROM plant_water"
                " GROUP BY plant_id"
            ).fetchall()
        return {row["plant_id"]: (row["liters"], row["last"]) for row in rows}

    def zone_day_totals(self, day: date) -> dict[str, tuple[float, float]]:
        """zone_id -> (seconds run, litres delivered) for runs that started on `day`."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT zone_id, started_at, ended_at, liters FROM irrigation_events"
                " WHERE day = ? AND zone_id IS NOT NULL",
                (day.isoformat(),),
            ).fetchall()
        result: dict[str, tuple[float, float]] = {}
        for row in rows:
            seconds = (
                datetime.fromisoformat(row["ended_at"]) - datetime.fromisoformat(row["started_at"])
            ).total_seconds()
            run, liters = result.get(row["zone_id"], (0.0, 0.0))
            result[row["zone_id"]] = (run + seconds, liters + (row["liters"] or 0.0))
        return result

    def zone_last_runs(self) -> dict[str, str]:
        """zone_id -> end of its latest run."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT zone_id, MAX(ended_at) AS last FROM irrigation_events"
                " WHERE zone_id IS NOT NULL GROUP BY zone_id"
            ).fetchall()
        return {row["zone_id"]: row["last"] for row in rows}

    # ------------------------------------------------------------ weather
    def upsert_weather(self, days: list[dict[str, Any]], fetched_at: str) -> None:
        """Store merged daily weather (one JSON row per day; newer data replaces)."""
        with self._cursor() as conn:
            conn.executemany(
                "INSERT INTO weather_daily (day, data, fetched_at) VALUES (?, ?, ?)"
                " ON CONFLICT (day) DO UPDATE SET data = excluded.data,"
                " fetched_at = excluded.fetched_at",
                [(day["day"], json.dumps(day), fetched_at) for day in days],
            )

    def weather_since(self, since: date) -> list[dict[str, Any]]:
        """Stored daily weather from `since` on, oldest first."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT data FROM weather_daily WHERE day >= ? ORDER BY day",
                (since.isoformat(),),
            ).fetchall()
        return [json.loads(row["data"]) for row in rows]

    # ------------------------------------------------------------ AI usage
    USAGE_COLUMNS = (
        "id", "ts", "day", "feature", "provider", "provider_title", "model", "plant_id",
        "status", "error", "input", "cached_input", "cache_write", "output", "reasoning",
        "images", "cost", "cost_source", "latency_ms", "request_id", "prompt_version",
        "prompt", "response",
    )  # fmt: skip
    # single calls plus the daily sums older calls were folded into (purge_usage)
    _ALL_USAGE = (
        "SELECT day, feature, provider, model, NULL AS plant_id, requests, errors, input,"
        " cached_input, cache_write, output, reasoning, images, cost, unknown_cost, latency_ms"
        " FROM ai_usage_daily UNION ALL"
        " SELECT day, feature, provider, model, plant_id, 1, status != 'ok', input,"
        " cached_input, cache_write, output, reasoning, images, cost, cost IS NULL, latency_ms"
        " FROM ai_usage"
    )
    _SUMS = (
        "COALESCE(SUM(requests), 0) AS requests, COALESCE(SUM(errors), 0) AS errors,"
        " COALESCE(SUM(input), 0) AS input, COALESCE(SUM(cached_input), 0) AS cached_input,"
        " COALESCE(SUM(cache_write), 0) AS cache_write, COALESCE(SUM(output), 0) AS output,"
        " COALESCE(SUM(reasoning), 0) AS reasoning, COALESCE(SUM(images), 0) AS images,"
        " SUM(cost) AS cost, COALESCE(SUM(unknown_cost), 0) AS unknown_cost,"
        " COALESCE(SUM(latency_ms), 0) AS latency_ms"
    )

    def insert_usage(self, row: dict[str, Any]) -> None:
        marks = ", ".join("?" * len(self.USAGE_COLUMNS))
        with self._cursor() as conn:
            conn.execute(
                f"INSERT INTO ai_usage ({', '.join(self.USAGE_COLUMNS)}) VALUES ({marks})",  # noqa: S608
                [row.get(column) for column in self.USAGE_COLUMNS],
            )

    def usage_totals(self, since: date | None) -> dict[str, Any]:
        """Sums over all calls from `since` on (None: everything ever)."""
        where = "WHERE day >= ?" if since else ""
        params = (since.isoformat(),) if since else ()
        with self._cursor() as conn:
            row = conn.execute(
                f"SELECT {self._SUMS} FROM ({self._ALL_USAGE}) {where}",  # noqa: S608
                params,
            ).fetchone()
        return dict(row)

    def usage_breakdown(self, since: date, column: str) -> list[dict[str, Any]]:
        """Sums per feature, provider, model or plant from `since` on."""
        if column not in ("feature", "provider", "model", "plant_id"):
            raise ValueError(column)
        with self._cursor() as conn:
            rows = conn.execute(
                f"SELECT {column} AS key, {self._SUMS} FROM ({self._ALL_USAGE})"  # noqa: S608
                f" WHERE day >= ? AND {column} IS NOT NULL GROUP BY {column}"
                " ORDER BY SUM(cost) DESC, requests DESC",
                (since.isoformat(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def usage_daily_cost(self, since: date) -> list[dict[str, Any]]:
        """Cost and requests per day and model (for the stacked chart)."""
        with self._cursor() as conn:
            rows = conn.execute(
                "SELECT day, model, SUM(cost) AS cost, SUM(requests) AS requests"  # noqa: S608
                f" FROM ({self._ALL_USAGE}) WHERE day >= ? GROUP BY day, model ORDER BY day",
                (since.isoformat(),),
            ).fetchall()
        return [dict(row) for row in rows]

    def usage_log(
        self,
        *,
        limit: int,
        offset: int = 0,
        feature: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        """Single calls, newest first (kept for the retention period)."""
        clauses: list[str] = []
        params: list[Any] = []
        if feature:
            clauses.append("feature = ?")
            params.append(feature)
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._cursor() as conn:
            rows = conn.execute(
                f"SELECT * FROM ai_usage {where} ORDER BY ts DESC LIMIT ? OFFSET ?",  # noqa: S608
                (*params, limit, offset),
            ).fetchall()
        return [dict(row) for row in rows]

    def purge_usage(self, before: date) -> int:
        """Fold single calls older than `before` into daily sums and delete them."""
        with self._cursor() as conn:
            conn.execute(
                "INSERT INTO ai_usage_daily SELECT day, feature, provider, model, COUNT(*),"
                " SUM(status != 'ok'), SUM(input), SUM(cached_input), SUM(cache_write),"
                " SUM(output), SUM(reasoning), SUM(images), SUM(cost), SUM(cost IS NULL),"
                " SUM(latency_ms) FROM ai_usage WHERE day < ?"
                " GROUP BY day, feature, provider, model"
                " ON CONFLICT (day, feature, provider, model) DO UPDATE SET"
                " requests = requests + excluded.requests, errors = errors + excluded.errors,"
                " input = input + excluded.input,"
                " cached_input = cached_input + excluded.cached_input,"
                " cache_write = cache_write + excluded.cache_write,"
                " output = output + excluded.output, reasoning = reasoning + excluded.reasoning,"
                " images = images + excluded.images,"
                " cost = COALESCE(cost, 0) + COALESCE(excluded.cost, 0),"
                " unknown_cost = unknown_cost + excluded.unknown_cost,"
                " latency_ms = latency_ms + excluded.latency_ms",
                (before.isoformat(),),
            )
            deleted = conn.execute("DELETE FROM ai_usage WHERE day < ?", (before.isoformat(),))
        return int(deleted.rowcount)

    def storage_stats(self) -> dict[str, int]:
        """Size of the database file and its write-ahead log in bytes."""
        sizes = {"database": 0}
        for path in (self.path, self.path.with_name(self.path.name + "-wal")):
            if path.exists():
                sizes["database"] += path.stat().st_size
        return sizes

    # ------------------------------------------------------------ plants
    def delete_plant_records(self, plant_id: str) -> None:
        with self._cursor() as conn:
            conn.execute("DELETE FROM photos WHERE plant_id = ?", (plant_id,))
            conn.execute("DELETE FROM measurements WHERE plant_id = ?", (plant_id,))
            conn.execute("DELETE FROM plant_water WHERE plant_id = ?", (plant_id,))
