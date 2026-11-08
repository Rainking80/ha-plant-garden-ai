"""SQLite storage for records that keep growing (photos, measurements, later time series).

All methods are blocking and must run in the executor. A lock serialises access,
so the connection can be shared between executor threads.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
import json
import logging
from pathlib import Path
import sqlite3
import threading
from typing import Any

from .models import Measurement, Photo, Source

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
)
SCHEMA_VERSION = len(MIGRATIONS)


class DatabaseError(Exception):
    """The database could not be opened or migrated."""


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

    @property
    def schema_version(self) -> int:
        with self._cursor() as conn:
            return int(conn.execute("PRAGMA user_version").fetchone()[0])

    # ------------------------------------------------------------ photos
    def insert_photo(self, photo: Photo) -> None:
        with self._cursor() as conn:
            conn.execute(
                "INSERT INTO photos (id, plant_id, taken_at, uploaded_at, width, height,"
                " size_bytes, tags, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                ),
            )

    def update_photo(self, photo: Photo) -> None:
        with self._cursor() as conn:
            conn.execute(
                "UPDATE photos SET taken_at = ?, tags = ?, note = ? WHERE id = ?",
                (photo.taken_at.isoformat(), json.dumps(photo.tags), photo.note, photo.id),
            )

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

    # ------------------------------------------------------------ plants
    def delete_plant_records(self, plant_id: str) -> None:
        with self._cursor() as conn:
            conn.execute("DELETE FROM photos WHERE plant_id = ?", (plant_id,))
            conn.execute("DELETE FROM measurements WHERE plant_id = ?", (plant_id,))
