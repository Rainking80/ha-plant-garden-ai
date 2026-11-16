"""A plan drawn from a picture: the AI outlines the areas of the background."""

from __future__ import annotations

import io
import json
from typing import Any

from homeassistant.core import HomeAssistant
from PIL import Image
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden.ai import sketch
from custom_components.plant_garden.ai.schemas import SKETCH_SCHEMA, clean_sketch, union_count

from .images import make_image
from .test_assistant import MESSAGES, _call, _sent, claude, garden  # noqa: F401

BACKGROUND = {
    "type": "image",
    "image_id": "x",
    "width_px": 800,
    "height_px": 400,
    "x": -10,
    "y": -5,
    "width_m": 20,
    "rotation": 0,
}

ANSWER = {
    "areas": [
        # the left half of the picture
        {"kind": "lawn", "label": "Rasen", "points": [[0, 0], [500, 0], [500, 1000], [0, 1000]]},
        # closed outline (first corner repeated), partly outside the picture
        {
            "kind": "house",
            "label": "",
            "points": [[600, 200], [900, 200], [1200, 800], [600, 800], [600, 200]],
        },
        {"kind": "bed", "label": "", "points": [[10, 10], [11, 10], [11, 11]]},  # tiny
        {"kind": "volcano", "label": "", "points": [[0, 0], [9, 0], [9, 9]]},  # unknown kind
        {"kind": "path", "label": "", "points": [[0, 0], [1, "x"]]},  # no outline
    ],
    "note": "Die Hecke war nicht klar zu erkennen.",
}


def test_picture_positions_become_plan_metres() -> None:
    # 20 m x 10 m, top-left at (-10, -5): the middle of the picture is the origin
    assert sketch.to_plan((500, 500), BACKGROUND) == (0, 0)
    assert sketch.to_plan((0, 0), BACKGROUND) == (-10, -5)
    assert sketch.to_plan((1000, 1000), BACKGROUND) == (10, 5)
    # turned a quarter clockwise around its centre: the right edge points south
    turned = {**BACKGROUND, "rotation": 90}
    assert sketch.to_plan((1000, 500), turned) == pytest.approx((0, 10))
    assert sketch.to_plan((500, 0), turned) == pytest.approx((5, 0))


def test_clean_and_convert() -> None:
    assert union_count(SKETCH_SCHEMA) <= 16
    cleaned = clean_sketch(ANSWER)
    assert [a["kind"] for a in cleaned["areas"]] == ["lawn", "house", "bed"]
    assert cleaned["areas"][1]["points"][2] == (1000, 800)  # clamped into the picture
    assert cleaned["note"].startswith("Die Hecke")
    shapes = sketch.shapes_from(cleaned["areas"], BACKGROUND)
    # the tiny bed (2 cm) is dropped
    assert [(s["kind"], s["label"], s["area_m2"]) for s in shapes] == [
        ("lawn", "Rasen", 100.0),
        ("house", None, 42.0),
    ]
    assert shapes[0]["geometry"] == {
        "type": "polygon",
        "points": [[-10, -5], [0, -5], [0, 5], [-10, 5]],
    }
    assert len(shapes[1]["geometry"]["points"]) == 4  # the repeated corner is gone
    assert clean_sketch({}) == {"areas": [], "note": None}


def test_prepare_downsizes() -> None:
    big = make_image(3000, 1500)
    small = sketch.prepare(big)
    with Image.open(io.BytesIO(small)) as image:
        assert image.size == (1568, 784)
        assert image.format == "JPEG"


async def test_sketch_command(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: tuple[MockConfigEntry, Any],  # noqa: F811
) -> None:
    entry, _rose = garden
    manager = entry.runtime_data.manager
    client = await hass_ws_client(hass)

    # without an uploaded picture there is nothing to read
    msg = await _call(client, type="plant_garden/assistant/sketch")
    assert msg["error"]["code"] == "invalid_format"

    uploaded = await manager.async_upload_background(make_image(800, 400))
    await manager.async_set_background(
        {**BACKGROUND, "image_id": uploaded["image_id"], "opacity": 0.8}
    )
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(ANSWER)))
    msg = await _call(client, type="plant_garden/assistant/sketch")
    assert msg["success"], msg
    result = msg["result"]
    assert [s["kind"] for s in result["shapes"]] == ["lawn", "house"]
    assert result["note"].startswith("Die Hecke")
    # nothing was saved
    assert manager.shapes() == []

    body = _sent(aioclient_mock)
    content = body["messages"][0]["content"]
    assert [c["type"] for c in content] == ["image", "text"]
    assert "20 m x 10 m" in content[-1]["text"]
    [row] = await manager.async_usage_log(limit=5)
    assert row["feature"] == "sketch"
