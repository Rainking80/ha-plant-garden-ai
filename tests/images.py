"""Generate test images in memory."""

from __future__ import annotations

import io

from PIL import ExifTags, Image


def make_image(
    width: int = 400,
    height: int = 200,
    *,
    fmt: str = "JPEG",
    mode: str = "RGB",
    orientation: int | None = None,
    taken: str | None = None,
    offset: str | None = None,
    gps: bool = False,
) -> bytes:
    """An image whose left half is green and right half is red (to check rotation)."""
    color_left = (40, 160, 60, 255) if mode == "RGBA" else (40, 160, 60)
    color_right = (200, 40, 40, 128) if mode == "RGBA" else (200, 40, 40)
    img = Image.new(mode, (width, height), color_left)
    img.paste(Image.new(mode, (width // 2, height), color_right), (width // 2, 0))

    exif = Image.Exif()
    if orientation is not None:
        exif[ExifTags.Base.Orientation] = orientation
    if taken is not None:
        exif.get_ifd(ExifTags.IFD.Exif)[ExifTags.Base.DateTimeOriginal] = taken
    if offset is not None:
        exif.get_ifd(ExifTags.IFD.Exif)[ExifTags.Base.OffsetTimeOriginal] = offset
    if gps:
        gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps_ifd[ExifTags.GPS.GPSLatitudeRef] = "N"
        gps_ifd[ExifTags.GPS.GPSLatitude] = (52.0, 31.0, 12.0)
        gps_ifd[ExifTags.GPS.GPSLongitudeRef] = "E"
        gps_ifd[ExifTags.GPS.GPSLongitude] = (13.0, 24.0, 18.0)

    buffer = io.BytesIO()
    if fmt == "JPEG":
        img.save(buffer, format=fmt, exif=exif)
    else:
        img.save(buffer, format=fmt)
    return buffer.getvalue()
