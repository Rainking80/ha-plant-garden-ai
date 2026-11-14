"""Tests for photo processing and file storage."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io
from pathlib import Path

from PIL import Image
import pytest

from custom_components.plant_garden.models import PhotoEdit
from custom_components.plant_garden.photos import (
    InvalidImageError,
    PhotoFiles,
    PhotoVariant,
    process_image,
    valid_id,
)

from .images import make_image

PLANT = "01JPLANTAAAAAAAAAAAAAAAAAA"
PHOTO = "01JPHOTOBBBBBBBBBBBBBBBBBB"


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def test_variants_sizes_and_formats() -> None:
    result = process_image(make_image(4000, 3000))
    original = _open(result.variants[PhotoVariant.ORIGINAL])
    medium = _open(result.variants[PhotoVariant.MEDIUM])
    thumb = _open(result.variants[PhotoVariant.THUMB])
    assert (original.format, original.size) == ("JPEG", (2560, 1920))
    assert (medium.format, medium.size) == ("WEBP", (1024, 768))
    assert (thumb.format, thumb.size) == ("WEBP", (360, 270))
    assert (result.width, result.height) == (2560, 1920)


def test_small_images_are_not_upscaled() -> None:
    result = process_image(make_image(300, 200))
    assert _open(result.variants[PhotoVariant.ORIGINAL]).size == (300, 200)
    assert _open(result.variants[PhotoVariant.THUMB]).size == (300, 200)


def test_exif_orientation_applied_and_metadata_removed() -> None:
    data = make_image(400, 200, orientation=6, taken="2025:06:01 08:30:00", gps=True)
    assert _open(data).getexif().get_ifd(0x8825)  # the input really carries GPS data

    result = process_image(data)
    for content in result.variants.values():
        img = _open(content)
        assert len(img.getexif()) == 0
        assert "exif" not in img.info
    original = _open(result.variants[PhotoVariant.ORIGINAL]).convert("RGB")
    # orientation 6 = rotate 90° clockwise: 400x200 becomes 200x400, the green
    # left half ends up on top
    assert original.size == (200, 400)
    top = original.getpixel((100, 20))
    bottom = original.getpixel((100, 380))
    assert isinstance(top, tuple)
    assert isinstance(bottom, tuple)
    assert top[1] > top[0]
    assert bottom[0] > bottom[1]


def test_capture_time_from_exif() -> None:
    naive = process_image(make_image(taken="2025:06:01 08:30:00")).taken_at
    assert naive == datetime(2025, 6, 1, 8, 30)  # noqa: DTZ001

    aware = process_image(make_image(taken="2025:06:01 08:30:00", offset="+02:00")).taken_at
    assert aware == datetime(2025, 6, 1, 8, 30, tzinfo=timezone(timedelta(hours=2)))

    assert process_image(make_image()).taken_at is None
    assert process_image(make_image(taken="garbage")).taken_at is None


def test_png_with_transparency_becomes_rgb_on_white() -> None:
    result = process_image(make_image(fmt="PNG", mode="RGBA"))
    original = _open(result.variants[PhotoVariant.ORIGINAL])
    assert original.mode == "RGB"
    r, g, _b = original.getpixel((350, 100))  # type: ignore[misc]
    assert r > 200
    assert g > 100  # half transparent red over white is pink, not dark red


@pytest.mark.parametrize(
    ("data", "reason"),
    [
        (b"not an image", "invalid_image"),
        (make_image()[:200], "invalid_image"),
    ],
)
def test_rejects_broken_data(data: bytes, reason: str) -> None:
    with pytest.raises(InvalidImageError) as err:
        process_image(data)
    assert err.value.reason == reason


def test_rejects_unsupported_format() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buffer, format="PPM")  # readable, but not accepted
    with pytest.raises(InvalidImageError) as err:
        process_image(buffer.getvalue())
    assert err.value.reason == "unsupported_format"


def test_rejects_huge_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("custom_components.plant_garden.photos.MAX_PIXELS", 100)
    with pytest.raises(InvalidImageError) as err:
        process_image(make_image(20, 20))
    assert err.value.reason == "image_too_large"


def test_valid_id() -> None:
    assert valid_id(PLANT)
    assert not valid_id("../../etc/passwd")
    assert not valid_id("01jplantaaaaaaaaaaaaaaaaaa")
    assert not valid_id("")


def test_files_write_and_delete(tmp_path: Path) -> None:
    files = PhotoFiles(tmp_path / "photos")
    assert files.disk_usage() == 0
    size = files.write(PLANT, PHOTO, process_image(make_image()))
    paths = [files.path(PLANT, PHOTO, variant) for variant in PhotoVariant]
    assert all(path.is_file() for path in paths)
    assert paths[0].stat().st_size == size
    assert files.disk_usage() > size
    assert not list((tmp_path / "photos" / PLANT).glob("*.tmp"))

    files.delete(PLANT, PHOTO)
    assert not any(path.exists() for path in paths)

    files.write(PLANT, PHOTO, process_image(make_image()))
    files.delete_plant(PLANT)
    assert not (tmp_path / "photos" / PLANT).exists()


def test_files_reject_foreign_ids(tmp_path: Path) -> None:
    files = PhotoFiles(tmp_path)
    with pytest.raises(ValueError, match="invalid id"):
        files.path("..", PHOTO, PhotoVariant.THUMB)
    with pytest.raises(ValueError, match="invalid id"):
        files.delete_plant("../x")


def _color(data: bytes, x: int, y: int) -> str:
    red, green, _blue = _open(data).convert("RGB").getpixel((x, y))
    return "green" if green > red else "red"


def test_edit_crops_turns_and_resets(tmp_path: Path) -> None:
    """The upload is kept aside, the variants show the edit, a reset restores it exactly."""
    files = PhotoFiles(tmp_path)
    files.write(PLANT, PHOTO, process_image(make_image(400, 200)))  # left green, right red
    original = files.path(PLANT, PHOTO, PhotoVariant.ORIGINAL)
    medium = files.path(PLANT, PHOTO, PhotoVariant.MEDIUM)
    source = files.source_path(PLANT, PHOTO)
    uploaded = original.read_bytes()
    assert files.upload_path(PLANT, PHOTO) == original

    # the right half: red only
    assert files.apply_edit(PLANT, PHOTO, PhotoEdit.clean(0.5, 0, 0.5, 1))[:2] == (200, 200)
    assert source.read_bytes() == uploaded
    assert files.upload_path(PLANT, PHOTO) == source
    assert _color(original.read_bytes(), 20, 100) == "red"
    assert _open(medium.read_bytes()).size == (200, 200)

    # turned clockwise, the green left half is on top
    assert files.apply_edit(PLANT, PHOTO, PhotoEdit.clean(0, 0, 1, 1, 90))[:2] == (200, 400)
    assert _color(original.read_bytes(), 100, 50) == "green"
    assert _color(original.read_bytes(), 100, 350) == "red"
    assert source.read_bytes() == uploaded  # edits always start from the upload

    # reset: the uploaded bytes come back, the kept copy is gone
    width, height, size = files.apply_edit(PLANT, PHOTO, None)
    assert (width, height, size) == (400, 200, len(uploaded))
    assert original.read_bytes() == uploaded
    assert not source.exists()
    assert _open(medium.read_bytes()).size == (400, 200)
    assert files.apply_edit(PLANT, PHOTO, PhotoEdit())[:2] == (400, 200)  # nothing to undo

    files.apply_edit(PLANT, PHOTO, PhotoEdit.clean(0.1, 0.1, 0.5, 0.5))
    files.delete(PLANT, PHOTO)
    assert not any((tmp_path / PLANT).iterdir())
