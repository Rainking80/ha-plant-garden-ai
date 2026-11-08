"""Tests for the garden manager."""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
import pytest

from custom_components.plant_garden.garden import GardenChange, GardenManager, NotFoundError
from custom_components.plant_garden.models import (
    AgeReference,
    PlantCategory,
    PlantStatus,
    Source,
)
from custom_components.plant_garden.photos import InvalidImageError, PhotoVariant

from .images import make_image


async def test_create_update_delete_plant(hass: HomeAssistant, manager: GardenManager) -> None:
    changes: list[GardenChange] = []
    unsubscribe = manager.async_subscribe(changes.append)

    plant = await manager.async_create_plant(
        {
            "name": "  Hortensie ",
            "category": "shrub",
            "scientific_name": "  ",
            "tags": ["a", "a", " "],
        }
    )
    assert plant.name == "Hortensie"
    assert plant.category is PlantCategory.SHRUB
    assert plant.scientific_name is None
    assert plant.tags == ["a"]
    assert plant.sources["name"].source is Source.USER
    assert manager.get_plant(plant.id) is plant

    updated = await manager.async_update_plant(
        plant.id,
        {"status": "problem", "age": {"age_months": 24, "on": date(2026, 4, 1)}, "notes": "x"},
    )
    assert updated.status is PlantStatus.PROBLEM
    assert updated.age == AgeReference(age_months=24, on=date(2026, 4, 1))
    assert set(updated.sources) >= {"status", "age", "notes"}

    # category/status/location_type cannot be cleared
    await manager.async_update_plant(plant.id, {"category": None})
    assert plant.category is PlantCategory.SHRUB

    with pytest.raises(ValueError, match="name"):
        await manager.async_update_plant(plant.id, {"name": "   "})
    with pytest.raises(ValueError, match="unknown field"):
        await manager.async_update_plant(plant.id, {"cover_photo_id": "x"})

    await manager.async_delete_plant(plant.id)
    with pytest.raises(NotFoundError):
        manager.get_plant(plant.id)
    with pytest.raises(NotFoundError):
        await manager.async_delete_plant(plant.id)

    unsubscribe()
    assert [c.kind for c in changes] == ["plant", "plant", "plant", "plant_removed"]


async def test_plants_sorted_by_name(manager: GardenManager) -> None:
    for name in ("rose", "Apfel", "Zitrone"):
        await manager.async_create_plant({"name": name})
    assert [p.name for p in manager.plants] == ["Apfel", "rose", "Zitrone"]


async def test_photos_lifecycle(hass: HomeAssistant, manager: GardenManager) -> None:
    plant = await manager.async_create_plant({"name": "Tomate"})
    await hass.config.async_set_time_zone("Europe/Berlin")

    with_exif = await manager.async_add_photo(
        plant.id, make_image(taken="2026:06:01 08:30:00"), tags=["blüte", " "], note=" erste "
    )
    # EXIF local time (Berlin, summer) -> UTC
    assert with_exif.taken_at == datetime(2026, 6, 1, 6, 30, tzinfo=UTC)
    assert with_exif.tags == ["blüte"]
    assert with_exif.note == "erste"
    for variant in PhotoVariant:
        assert manager.photo_path(with_exif, variant).is_file()

    hinted = await manager.async_add_photo(
        plant.id, make_image(), taken_at=datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    )
    assert hinted.taken_at == datetime(2026, 7, 1, 12, 0, tzinfo=UTC)

    photos = await manager.async_list_photos(plant.id)
    assert [p.id for p in photos] == [hinted.id, with_exif.id]

    summaries = {p.id: extra for p, extra in await manager.async_plant_summaries()}
    assert summaries[plant.id]["photo_count"] == 2
    assert summaries[plant.id]["cover_photo_id"] == hinted.id  # newest by default

    await manager.async_set_cover(plant.id, with_exif.id)
    summaries = {p.id: extra for p, extra in await manager.async_plant_summaries()}
    assert summaries[plant.id]["cover_photo_id"] == with_exif.id

    edited = await manager.async_update_photo(
        with_exif.id,
        {"tags": ["problem"], "note": "gelb ", "taken_at": datetime(2026, 5, 1, tzinfo=UTC)},
    )
    assert (edited.tags, edited.note) == (["problem"], "gelb")
    assert (await manager.async_get_photo(with_exif.id)).taken_at == datetime(
        2026, 5, 1, tzinfo=UTC
    )

    # deleting the cover photo falls back to the newest photo
    await manager.async_delete_photo(with_exif.id)
    assert plant.cover_photo_id is None
    assert not manager.photo_path(with_exif, PhotoVariant.THUMB).exists()
    with pytest.raises(NotFoundError):
        await manager.async_get_photo(with_exif.id)


async def test_photo_errors(manager: GardenManager) -> None:
    plant = await manager.async_create_plant({"name": "Tomate"})
    other = await manager.async_create_plant({"name": "Gurke"})
    with pytest.raises(NotFoundError):
        await manager.async_add_photo("01JNOPENOPENOPENOPENOPENOP", make_image())
    with pytest.raises(InvalidImageError):
        await manager.async_add_photo(plant.id, b"nope")
    assert await manager.async_list_photos(plant.id) == []

    photo = await manager.async_add_photo(other.id, make_image())
    with pytest.raises(NotFoundError):
        await manager.async_set_cover(plant.id, photo.id)  # photo of another plant
    await manager.async_set_cover(plant.id, None)


async def test_delete_plant_removes_photos(manager: GardenManager) -> None:
    plant = await manager.async_create_plant({"name": "Tomate"})
    photo = await manager.async_add_photo(plant.id, make_image())
    await manager.async_add_measurement(
        plant.id, measured_on=date(2026, 6, 1), height_cm=30, width_cm=None
    )
    plant_dir = manager.photo_path(photo, PhotoVariant.THUMB).parent
    assert plant_dir.is_dir()

    await manager.async_delete_plant(plant.id)
    assert not plant_dir.exists()
    with pytest.raises(NotFoundError):
        await manager.async_get_photo(photo.id)


async def test_measurements(manager: GardenManager) -> None:
    plant = await manager.async_create_plant({"name": "Tomate"})
    with pytest.raises(ValueError, match="height or width"):
        await manager.async_add_measurement(
            plant.id, measured_on=date(2026, 6, 1), height_cm=None, width_cm=None
        )

    later = await manager.async_add_measurement(
        plant.id, measured_on=date(2026, 7, 1), height_cm=80, width_cm=40, note=" Stütze "
    )
    earlier = await manager.async_add_measurement(
        plant.id,
        measured_on=date(2026, 6, 1),
        height_cm=30,
        width_cm=None,
        source=Source.AI,
        confidence=0.6,
    )
    assert later.note == "Stütze"
    assert [m.id for m in await manager.async_list_measurements(plant.id)] == [earlier.id, later.id]

    # editing an AI estimate makes it a user value
    edited = await manager.async_update_measurement(earlier.id, {"height_cm": 35, "note": "ok"})
    assert (edited.height_cm, edited.source, edited.confidence) == (35, Source.USER, None)
    with pytest.raises(ValueError, match="height or width"):
        await manager.async_update_measurement(earlier.id, {"height_cm": None})

    summaries = {p.id: extra for p, extra in await manager.async_plant_summaries()}
    assert summaries[plant.id]["height_cm"] == 80

    await manager.async_delete_measurement(earlier.id)
    with pytest.raises(NotFoundError):
        await manager.async_delete_measurement(earlier.id)
    with pytest.raises(NotFoundError):
        await manager.async_update_measurement(earlier.id, {"height_cm": 1})


async def test_data_survives_restart(
    hass: HomeAssistant, tmp_path: Path, freezer: FrozenDateTimeFactory
) -> None:
    first = GardenManager(hass, tmp_path / "garden")
    await first.async_setup()
    plant = await first.async_create_plant({"name": "Olive", "planted_on": date(2020, 5, 1)})
    photo = await first.async_add_photo(plant.id, make_image())
    await first.async_add_measurement(
        plant.id, measured_on=date(2026, 6, 1), height_cm=120, width_cm=60
    )
    await first.async_shutdown()

    second = GardenManager(hass, tmp_path / "garden")
    await second.async_setup()
    restored = second.get_plant(plant.id)
    assert restored == plant
    assert [p.id for p in await second.async_list_photos(plant.id)] == [photo.id]
    assert len(await second.async_list_measurements(plant.id)) == 1
    await second.async_shutdown()


async def test_delayed_save(
    hass: HomeAssistant, manager: GardenManager, hass_storage: dict
) -> None:
    await manager.async_create_plant({"name": "Basilikum"})
    await manager.async_checkpoint()
    stored = hass_storage["plant_garden.garden"]["data"]["plants"]
    assert [p["name"] for p in stored] == ["Basilikum"]
