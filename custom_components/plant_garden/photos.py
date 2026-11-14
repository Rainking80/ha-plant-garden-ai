"""Photo processing and file storage. Everything here is blocking (executor only)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
import io
import logging
import os
from pathlib import Path
import re
import shutil
import tempfile

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

from .models import PhotoEdit

_LOGGER = logging.getLogger(__name__)

SOURCE = "source"  # URL name of the image as uploaded (before any crop or turn)
SOURCE_SUFFIX = ".source.jpg"

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 60_000_000  # ~ 9500 x 6300, well above phone cameras
ACCEPTED_FORMATS = frozenset({"JPEG", "MPO", "PNG", "WEBP", "GIF", "BMP", "TIFF"})

_ID_RE = re.compile(r"^[0-9A-Z]{26}$")  # ULIDs only, so no path tricks are possible


class PhotoVariant(StrEnum):
    """Stored sizes of a photo."""

    ORIGINAL = "original"
    MEDIUM = "medium"
    THUMB = "thumb"


# variant -> (longest edge in px, Pillow format, file suffix, save options)
_VARIANT_SPECS: dict[PhotoVariant, tuple[int, str, str, dict[str, object]]] = {
    PhotoVariant.ORIGINAL: (2560, "JPEG", ".jpg", {"quality": 88, "optimize": True}),
    PhotoVariant.MEDIUM: (1024, "WEBP", ".medium.webp", {"quality": 82, "method": 4}),
    PhotoVariant.THUMB: (360, "WEBP", ".thumb.webp", {"quality": 78, "method": 4}),
}


class InvalidImageError(Exception):
    """The uploaded data is not an image we accept. `reason` is a translation key."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(slots=True, frozen=True)
class ProcessedImage:
    """All variants of an uploaded image, ready to be written to disk."""

    variants: dict[PhotoVariant, bytes]
    width: int
    height: int
    taken_at: datetime | None  # naive = local time of the camera


def _exif_taken_at(img: Image.Image) -> datetime | None:
    """Capture time from EXIF (DateTimeOriginal, falling back to DateTime)."""
    try:
        exif = img.getexif()
    except Exception:  # broken EXIF must not break the upload
        return None
    sub = exif.get_ifd(ExifTags.IFD.Exif)
    raw = sub.get(ExifTags.Base.DateTimeOriginal) or exif.get(ExifTags.Base.DateTime)
    if not isinstance(raw, str):
        return None
    try:
        taken = datetime.strptime(raw.strip("\x00 "), "%Y:%m:%d %H:%M:%S")  # noqa: DTZ007
    except ValueError:
        return None
    offset = sub.get(ExifTags.Base.OffsetTimeOriginal)
    if isinstance(offset, str) and (match := re.fullmatch(r"([+-])(\d{2}):(\d{2})", offset)):
        sign = 1 if match.group(1) == "+" else -1
        delta = timedelta(hours=int(match.group(2)), minutes=int(match.group(3)))
        taken = taken.replace(tzinfo=timezone(sign * delta))
    return taken


def _to_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB")


def _encode(rgb: Image.Image, taken_at: datetime | None = None) -> ProcessedImage:
    variants: dict[PhotoVariant, bytes] = {}
    width = height = 0
    for variant, (edge, fmt, _suffix, options) in _VARIANT_SPECS.items():
        copy = rgb.copy()
        copy.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        # No exif= argument: Pillow writes no metadata, so GPS and camera data are gone.
        copy.save(buffer, format=fmt, **options)
        variants[variant] = buffer.getvalue()
        if variant is PhotoVariant.ORIGINAL:
            width, height = copy.size
    return ProcessedImage(variants=variants, width=width, height=height, taken_at=taken_at)


def process_image(data: bytes) -> ProcessedImage:
    """Validate, orient, strip metadata and create all size variants."""
    rgb, taken_at = _load(data)
    return _encode(rgb, taken_at)


_TURNS = {
    90: Image.Transpose.ROTATE_270,  # Pillow turns counter-clockwise
    180: Image.Transpose.ROTATE_180,
    270: Image.Transpose.ROTATE_90,
}


def edit_image(stored: bytes, edit: PhotoEdit) -> ProcessedImage:
    """All variants of a stored upload, turned and then cropped."""
    with Image.open(io.BytesIO(stored)) as img:
        rgb = img.convert("RGB")
    if edit.rotate in _TURNS:
        rgb = rgb.transpose(_TURNS[edit.rotate])
    width, height = rgb.size
    left, top = round(edit.x * width), round(edit.y * height)
    right = max(left + 1, min(width, round((edit.x + edit.w) * width)))
    bottom = max(top + 1, min(height, round((edit.y + edit.h) * height)))
    return _encode(rgb.crop((left, top, right, bottom)))


def _load(data: bytes) -> tuple[Image.Image, datetime | None]:
    """Decode and validate an upload; return it upright in RGB plus its EXIF capture time."""
    try:
        img = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError) as err:
        raise InvalidImageError("invalid_image") from err

    if img.format not in ACCEPTED_FORMATS:
        raise InvalidImageError("unsupported_format")
    if img.width * img.height > MAX_PIXELS:
        raise InvalidImageError("image_too_large")

    taken_at = _exif_taken_at(img)
    try:
        img.load()
        oriented = ImageOps.exif_transpose(img)
    except (OSError, SyntaxError, Image.DecompressionBombError) as err:
        raise InvalidImageError("invalid_image") from err
    return _to_rgb(oriented), taken_at


BACKGROUND_MAX_EDGE = 4096  # site plans and aerial screenshots need more detail than photos


def process_background(data: bytes) -> tuple[bytes, int, int]:
    """A plan background: upright, without metadata, at most 4096 px. Returns JPEG, w, h."""
    rgb, _ = _load(data)
    rgb.thumbnail((BACKGROUND_MAX_EDGE, BACKGROUND_MAX_EDGE), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    rgb.save(buffer, format="JPEG", quality=85, optimize=True)
    return buffer.getvalue(), rgb.width, rgb.height


def valid_id(value: str) -> bool:
    """Return True for IDs we generate ourselves (ULIDs)."""
    return bool(_ID_RE.fullmatch(value))


def _write_atomic(target: Path, content: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        Path(tmp).replace(target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class BackgroundFiles:
    """Layout: <root>/<image_id>.jpg"""

    def __init__(self, root: Path) -> None:
        self.root = root

    def path(self, image_id: str) -> Path:
        if not valid_id(image_id):
            raise ValueError("invalid id")
        return self.root / f"{image_id}.jpg"

    def write(self, image_id: str, content: bytes) -> None:
        _write_atomic(self.path(image_id), content)

    def delete(self, image_id: str) -> None:
        self.path(image_id).unlink(missing_ok=True)

    def delete_unused(self, keep: set[str]) -> None:
        """Remove uploads that never became (or no longer are) the background."""
        if not self.root.exists():
            return
        for file in self.root.glob("*.jpg"):
            if file.stem not in keep:
                file.unlink(missing_ok=True)


class PhotoFiles:
    """Layout: <root>/<plant_id>/<photo_id>{.jpg,.medium.webp,.thumb.webp}.

    An edited photo also keeps its upload as <photo_id>.source.jpg; the variants
    then show the turned and cropped image.
    """

    def __init__(self, root: Path) -> None:
        self.root = root

    def path(self, plant_id: str, photo_id: str, variant: PhotoVariant) -> Path:
        if not (valid_id(plant_id) and valid_id(photo_id)):
            raise ValueError("invalid id")
        return self.root / plant_id / f"{photo_id}{_VARIANT_SPECS[variant][2]}"

    def source_path(self, plant_id: str, photo_id: str) -> Path:
        if not (valid_id(plant_id) and valid_id(photo_id)):
            raise ValueError("invalid id")
        return self.root / plant_id / f"{photo_id}{SOURCE_SUFFIX}"

    def upload_path(self, plant_id: str, photo_id: str) -> Path:
        """The image as uploaded: the kept source of an edited photo, else the original."""
        source = self.source_path(plant_id, photo_id)
        return source if source.exists() else self.path(plant_id, photo_id, PhotoVariant.ORIGINAL)

    def write(self, plant_id: str, photo_id: str, image: ProcessedImage) -> int:
        """Write all variants atomically; return the size of the original."""
        for variant, content in image.variants.items():
            _write_atomic(self.path(plant_id, photo_id, variant), content)
        return len(image.variants[PhotoVariant.ORIGINAL])

    def apply_edit(
        self, plant_id: str, photo_id: str, edit: PhotoEdit | None
    ) -> tuple[int, int, int]:
        """Show the upload turned and cropped, or as uploaded for None.

        Returns width, height and file size of the new original. The upload is
        copied aside before the first edit and moved back unchanged on a reset.
        """
        source = self.source_path(plant_id, photo_id)
        original = self.path(plant_id, photo_id, PhotoVariant.ORIGINAL)
        if edit is None or edit.is_identity:
            if not source.exists():
                with Image.open(original) as img:
                    return img.width, img.height, original.stat().st_size
            image = edit_image(source.read_bytes(), PhotoEdit())
            for variant in (PhotoVariant.MEDIUM, PhotoVariant.THUMB):
                _write_atomic(self.path(plant_id, photo_id, variant), image.variants[variant])
            source.replace(original)  # the uploaded bytes, not a re-encoded copy
            return image.width, image.height, original.stat().st_size
        if not source.exists():
            _write_atomic(source, original.read_bytes())
        image = edit_image(source.read_bytes(), edit)
        size = self.write(plant_id, photo_id, image)
        return image.width, image.height, size

    def delete(self, plant_id: str, photo_id: str) -> None:
        for variant in PhotoVariant:
            self.path(plant_id, photo_id, variant).unlink(missing_ok=True)
        self.source_path(plant_id, photo_id).unlink(missing_ok=True)

    def delete_plant(self, plant_id: str) -> None:
        if not valid_id(plant_id):
            raise ValueError("invalid id")
        shutil.rmtree(self.root / plant_id, ignore_errors=True)

    def disk_usage(self) -> int:
        if not self.root.exists():
            return 0
        return sum(f.stat().st_size for f in self.root.rglob("*") if f.is_file())
