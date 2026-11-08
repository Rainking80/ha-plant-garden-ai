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

_LOGGER = logging.getLogger(__name__)

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


def process_image(data: bytes) -> ProcessedImage:
    """Validate, orient, strip metadata and create all size variants."""
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
    rgb = _to_rgb(oriented)

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


def valid_id(value: str) -> bool:
    """Return True for IDs we generate ourselves (ULIDs)."""
    return bool(_ID_RE.fullmatch(value))


class PhotoFiles:
    """Layout: <root>/<plant_id>/<photo_id>{.jpg,.medium.webp,.thumb.webp}."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def path(self, plant_id: str, photo_id: str, variant: PhotoVariant) -> Path:
        if not (valid_id(plant_id) and valid_id(photo_id)):
            raise ValueError("invalid id")
        return self.root / plant_id / f"{photo_id}{_VARIANT_SPECS[variant][2]}"

    def write(self, plant_id: str, photo_id: str, image: ProcessedImage) -> int:
        """Write all variants atomically; return the size of the original."""
        for variant, content in image.variants.items():
            target = self.path(plant_id, photo_id, variant)
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(content)
                Path(tmp).replace(target)
            except BaseException:
                Path(tmp).unlink(missing_ok=True)
                raise
        return len(image.variants[PhotoVariant.ORIGINAL])

    def delete(self, plant_id: str, photo_id: str) -> None:
        for variant in PhotoVariant:
            self.path(plant_id, photo_id, variant).unlink(missing_ok=True)

    def delete_plant(self, plant_id: str) -> None:
        if not valid_id(plant_id):
            raise ValueError("invalid id")
        shutil.rmtree(self.root / plant_id, ignore_errors=True)

    def disk_usage(self) -> int:
        if not self.root.exists():
            return 0
        return sum(f.stat().st_size for f in self.root.rglob("*") if f.is_file())
