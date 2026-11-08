"""Generate the brand icons in custom_components/plant_garden/brand/.

Home Assistant (2026.x) serves icon.png / icon@2x.png from a custom
integration's brand folder. Run with the dev venv:

    uv run python scripts/generate_brand.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "custom_components" / "plant_garden" / "brand"
SCALE = 4  # draw large, downsample for smooth edges

LEAF_DARK = (63, 125, 78, 255)
LEAF_LIGHT = (116, 179, 130, 255)
STEM = (79, 138, 91, 255)
WATER = (61, 139, 217, 255)
SOIL = (138, 106, 79, 255)

Point = tuple[float, float]


def leaf(base: Point, angle_deg: float, length: float, width: float) -> list[Point]:
    """Lens-shaped leaf growing from base in the given direction (0 deg = up)."""
    angle = math.radians(angle_deg)
    direction = (math.sin(angle), -math.cos(angle))
    normal = (-direction[1], direction[0])
    steps = 60
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        half = width / 2 * math.sin(math.pi * t) ** 0.85 * (1 - 0.25 * t)
        cx = base[0] + direction[0] * length * t
        cy = base[1] + direction[1] * length * t
        left.append((cx + normal[0] * half, cy + normal[1] * half))
        right.append((cx - normal[0] * half, cy - normal[1] * half))
    return left + right[::-1]


def drop(center: Point, radius: float) -> list[Point]:
    """Water drop: circle with a pointed top."""
    tip_distance = 2.1 * radius
    alpha = math.asin(radius / tip_distance)
    tip = (center[0], center[1] - tip_distance)
    start = -math.pi / 2 + (math.pi / 2 - alpha)  # tangent point on the right
    sweep = 2 * math.pi - 2 * (math.pi / 2 - alpha)
    arc = [
        (
            center[0] + radius * math.cos(start + sweep * i / 60),
            center[1] + radius * math.sin(start + sweep * i / 60),
        )
        for i in range(61)
    ]
    return [tip, *arc]


def render(size: int) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def p(x: float, y: float) -> Point:
        return (x * s, y * s)

    # soil mound
    draw.ellipse([p(0.16, 0.80), p(0.74, 0.94)], fill=SOIL)
    # stem
    draw.line([p(0.45, 0.86), p(0.45, 0.47)], fill=STEM, width=round(0.055 * s))
    draw.ellipse([p(0.4225, 0.4425), p(0.4775, 0.4975)], fill=STEM)
    # leaves
    draw.polygon(leaf(p(0.45, 0.60), -58, 0.40 * s, 0.22 * s), fill=LEAF_LIGHT)
    draw.polygon(leaf(p(0.45, 0.46), 38, 0.44 * s, 0.24 * s), fill=LEAF_DARK)
    # water drop
    draw.polygon(drop(p(0.80, 0.70), 0.095 * s), fill=WATER)

    bbox = img.getbbox()
    assert bbox is not None
    img = img.crop(bbox)
    # pad to square, keep a small margin, then downsample
    side = max(img.size)
    margin = round(side * 0.04)
    canvas = Image.new("RGBA", (side + 2 * margin, side + 2 * margin), (0, 0, 0, 0))
    canvas.paste(img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(256).save(OUT / "icon.png", optimize=True)
    render(512).save(OUT / "icon@2x.png", optimize=True)
    print(f"wrote {OUT / 'icon.png'} and {OUT / 'icon@2x.png'}")


if __name__ == "__main__":
    main()
