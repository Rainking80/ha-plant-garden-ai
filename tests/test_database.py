"""Tests for the SQLite layer."""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
import sqlite3

import pytest

from custom_components.plant_garden.database import (
    SCHEMA_VERSION,
    DatabaseError,
    GardenDatabase,
)
from custom_components.plant_garden.models import Measurement, Photo

T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


def _photo(photo_id: str, plant_id: str = "PLANT_A", day: int = 1) -> Photo:
    taken = T0.replace(day=day)
    return Photo(
        id=photo_id,
        plant_id=plant_id,
        taken_at=taken,
        uploaded_at=taken,
        width=10,
        height=10,
        size_bytes=100,
        tags=["entwicklung"],
    )


@pytest.fixture
def db(tmp_path: Path) -> GardenDatabase:
    database = GardenDatabase(tmp_path / "sub" / "garden.db")
    database.open()
    yield database
    database.close()


def test_migrates_new_database(db: GardenDatabase) -> None:
    assert db.schema_version == SCHEMA_VERSION
    assert db.path.exists()


def test_reopen_keeps_data_and_version(tmp_path: Path) -> None:
    first = GardenDatabase(tmp_path / "garden.db")
    first.open()
    first.insert_photo(_photo("A"))
    first.close()

    second = GardenDatabase(tmp_path / "garden.db")
    second.open()
    assert second.schema_version == SCHEMA_VERSION
    assert second.get_photo("A") is not None
    second.close()


def test_refuses_newer_schema(tmp_path: Path) -> None:
    path = tmp_path / "garden.db"
    conn = sqlite3.connect(path)
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION + 1}")
    conn.close()
    with pytest.raises(DatabaseError, match="newer"):
        GardenDatabase(path).open()


def test_closed_database_raises(tmp_path: Path) -> None:
    database = GardenDatabase(tmp_path / "garden.db")
    with pytest.raises(DatabaseError):
        database.get_photo("X")


def test_photos(db: GardenDatabase) -> None:
    db.insert_photo(_photo("A", day=1))
    db.insert_photo(_photo("B", day=3))
    db.insert_photo(_photo("C", plant_id="PLANT_B", day=2))

    assert [p.id for p in db.photos_for_plant("PLANT_A")] == ["B", "A"]
    assert db.photo_stats() == {"PLANT_A": (2, "B"), "PLANT_B": (1, "C")}

    photo = db.get_photo("A")
    assert photo is not None
    photo.tags = ["problem"]
    photo.note = "gelbe Blätter"
    db.update_photo(photo)
    assert db.get_photo("A") == photo

    db.delete_photo("A")
    assert db.get_photo("A") is None


def test_measurements_and_latest_sizes(db: GardenDatabase) -> None:
    db.insert_photo(_photo("PHOTO"))
    rows = [
        Measurement(
            id="M1", plant_id="PLANT_A", measured_on=date(2026, 4, 1), height_cm=40, width_cm=30
        ),
        Measurement(
            id="M2",
            plant_id="PLANT_A",
            measured_on=date(2026, 6, 1),
            height_cm=55,
            width_cm=None,
            photo_id="PHOTO",
        ),
        Measurement(
            id="M3", plant_id="PLANT_B", measured_on=date(2026, 5, 1), height_cm=None, width_cm=80
        ),
    ]
    for row in rows:
        db.insert_measurement(row)

    assert [m.id for m in db.measurements_for_plant("PLANT_A")] == ["M1", "M2"]
    assert db.latest_sizes() == {
        "PLANT_A": {
            "height_cm": 55,
            "height_cm_on": "2026-06-01",
            "width_cm": 30,
            "width_cm_on": "2026-04-01",
        },
        "PLANT_B": {"width_cm": 80, "width_cm_on": "2026-05-01"},
    }

    m1 = db.get_measurement("M1")
    assert m1 is not None
    m1.height_cm = 42
    db.update_measurement(m1)
    assert db.get_measurement("M1") == m1

    # deleting a photo unlinks it from measurements
    db.delete_photo("PHOTO")
    m2 = db.get_measurement("M2")
    assert m2 is not None
    assert m2.photo_id is None

    db.delete_measurement("M1")
    assert db.get_measurement("M1") is None


def test_delete_plant_records(db: GardenDatabase) -> None:
    db.insert_photo(_photo("A"))
    db.insert_measurement(
        Measurement(
            id="M", plant_id="PLANT_A", measured_on=date(2026, 1, 1), height_cm=1, width_cm=None
        )
    )
    db.insert_photo(_photo("B", plant_id="PLANT_B"))
    db.delete_plant_records("PLANT_A")
    assert db.photos_for_plant("PLANT_A") == []
    assert db.measurements_for_plant("PLANT_A") == []
    assert db.get_photo("B") is not None


def test_checkpoint(db: GardenDatabase) -> None:
    db.insert_photo(_photo("A"))
    db.checkpoint()
