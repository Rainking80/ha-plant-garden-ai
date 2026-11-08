"""Tests for the domain model."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from custom_components.plant_garden.models import (
    AgeReference,
    FieldSource,
    Light,
    Plant,
    PlantCategory,
    Source,
    months_between,
)

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (date(2026, 1, 15), date(2026, 1, 15), 0),
        (date(2026, 1, 15), date(2026, 2, 14), 0),
        (date(2026, 1, 15), date(2026, 2, 15), 1),
        (date(2023, 5, 1), date(2026, 11, 8), 42),
        (date(2026, 3, 31), date(2026, 4, 30), 0),
        (date(2026, 5, 1), date(2026, 1, 1), -4),
    ],
)
def test_months_between(start: date, end: date, expected: int) -> None:
    assert months_between(start, end) == expected


def test_age_from_reference_wins_over_planting_date() -> None:
    plant = Plant(id="P", name="Rose", created_at=NOW, updated_at=NOW)
    assert plant.age_months(date(2026, 11, 8)) is None

    plant.planted_on = date(2025, 11, 8)
    assert plant.age_months(date(2026, 11, 8)) == 12

    # "about 3 years old on 2026-05-01"
    plant.age = AgeReference(age_months=36, on=date(2026, 5, 1))
    assert plant.age_months(date(2026, 11, 8)) == 42


def test_age_never_negative() -> None:
    plant = Plant(id="P", name="Rose", created_at=NOW, updated_at=NOW)
    plant.planted_on = date(2027, 1, 1)
    assert plant.age_months(date(2026, 11, 8)) == 0
    plant.age = AgeReference(age_months=2, on=date(2027, 1, 1))
    assert plant.age_months(date(2026, 11, 8)) == 0


def test_plant_round_trip() -> None:
    plant = Plant(
        id="01JABCDEFGHJKMNPQRSTVWXYZ0",
        name="Hortensie",
        created_at=NOW,
        updated_at=NOW,
        scientific_name="Hydrangea macrophylla",
        category=PlantCategory.SHRUB,
        light=Light.PARTIAL_SHADE,
        min_temperature_c=-15.0,
        planted_on=date(2024, 4, 20),
        age=AgeReference(age_months=24, on=date(2024, 4, 20)),
        tags=["Beet Süd"],
        sources={"name": FieldSource(source=Source.USER, updated_at=NOW)},
    )
    data = plant.as_dict()
    assert data["category"] == "shrub"
    assert data["water_need"] is None
    assert data["age"] == {"age_months": 24, "on": "2024-04-20"}
    assert Plant.from_dict(data) == plant
