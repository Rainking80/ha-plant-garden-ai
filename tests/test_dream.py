"""Dream garden: a photo, questions, a planting concept and a generated picture."""

from __future__ import annotations

import base64
from datetime import date
import io
import json
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigSubentryData
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from PIL import Image
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator, WebSocketGenerator

from custom_components.plant_garden.ai import images
from custom_components.plant_garden.ai.base import AIError
from custom_components.plant_garden.ai.dream import climate_facts
from custom_components.plant_garden.ai.prompts import dream as prompts
from custom_components.plant_garden.ai.providers import anthropic
from custom_components.plant_garden.ai.schemas import (
    DREAM_CONCEPT_SCHEMA,
    DREAM_LOOK_SCHEMA,
    clean_dream_concept,
    clean_dream_look,
    union_count,
)
from custom_components.plant_garden.const import DOMAIN
from custom_components.plant_garden.weather.base import DailyWeather

from .images import make_image
from .test_assistant import claude

MESSAGES = f"{anthropic.BASE_URL}/messages"
EDITS = "https://api.openai.com/v1/images/edits"
PICTURE = base64.b64encode(make_image(300, 200)).decode()

LOOK = {
    "description": "Ich sehe einen Rasen mit einem Plattenweg und links eine Hecke.",
    "elements": ["Rasen", "Plattenweg", "Hecke", "Apfelbaum"],
    "questions": [
        {"question": "Was soll sich ändern?", "options": ["Mehr Blüten", "Sichtschutz"]},
        {"question": "Wie viel Pflege?", "options": ["wenig", "mittel", "gern viel"]},
        {"question": "", "options": []},
    ],
    "styles": ["cottage", "natural", "castle"],
}
CONCEPT = {
    "summary": "Ein Staudenbeet entlang des Wegs, die Hecke bleibt.",
    "changes": ["Rasenkante abstechen", "Beet anlegen"],
    "hardscape": ["Stahlkante"],
    "plants": [
        {
            "name": "Lavendel",
            "scientific_name": "Lavandula angustifolia",
            "category": "perennial",
            "reason": "Sonnig und trocken.",
            "light": "full_sun",
            "water_need": "low",
            "height_cm": 50,
            "width_cm": 50,
            "min_temperature_c": -20,
            "planting_months": [4, 5, 9],
            "neighbours": "",
            "caution": "",
            "quantity": 5,
            "spacing_cm": 40,
        },
        {
            "name": "Katzenminze",
            "scientific_name": "",
            "category": "perennial",
            "reason": "",
            "light": "",
            "water_need": "",
            "height_cm": 0,
            "width_cm": 0,
            "min_temperature_c": None,
            "planting_months": [],
            "neighbours": "",
            "caution": "",
            "quantity": 0,
            "spacing_cm": 0,
        },
    ],
    "image_prompt": "A border of lavender and catmint along the path.",
}


@pytest.fixture
async def garden(hass: HomeAssistant) -> MockConfigEntry:
    """A garden with Claude (text and photos) and OpenAI (pictures)."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garten",
        data={},
        subentries_data=[
            ConfigSubentryData(
                data={"kind": "anthropic", "api_key": "sk-ant-x", "model": "claude-opus-5-5"},
                subentry_type="ai",
                title="Claude",
                unique_id=None,
            ),
            ConfigSubentryData(
                data={
                    "kind": "openai_compatible",
                    "preset": "openai",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-openai",
                    "model": "gpt-6-luna",
                },
                subentry_type="ai",
                title="OpenAI",
                unique_id=None,
            ),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _call(client: Any, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


def test_schemas_and_cleaning() -> None:
    assert union_count(DREAM_LOOK_SCHEMA) <= 16
    assert union_count(DREAM_CONCEPT_SCHEMA) <= 16
    look = clean_dream_look(LOOK)
    assert len(look["questions"]) == 2  # the empty question is dropped
    assert look["styles"] == ["cottage", "natural"]  # unknown styles too
    concept = clean_dream_concept(CONCEPT)
    first, second = concept["plants"]
    assert (first["quantity"], first["spacing_cm"], first["planting_months"]) == (5, 40, [4, 5, 9])
    assert (second["quantity"], second["spacing_cm"], second["category"]) == (1, None, "perennial")
    assert clean_dream_concept({})["plants"] == []


def test_climate_facts_tell_no_place() -> None:
    days = [
        DailyWeather(day=date(2027, 1, 1), source="x", t_min=-14.5, t_max=2.0, precip_mm=3.0),
        DailyWeather(day=date(2027, 7, 1), source="x", t_min=15.0, t_max=34.5, precip_mm=0.0),
    ]
    facts = climate_facts(days, 52.5, date(2027, 7, 10))
    assert facts == {
        "hemisphere": "north",
        "month": 7,
        "coldest_night_last_year_c": -14.5,
        "hottest_day_last_year_c": 34.5,
    }
    # a full year gives the yearly rain
    year = [DailyWeather(day=date(2026, 1, 1), source="x", precip_mm=2.0) for _ in range(320)]
    assert climate_facts(year, -35, date(2027, 1, 1))["rain_last_year_mm"] == 640
    assert climate_facts([], -35, date(2027, 1, 1)) == {"hemisphere": "south", "month": 1}


def test_picture_prompt_protects_what_stays() -> None:
    text = prompts.picture_prompt(
        description="A border of lavender along the path.",
        plants=[{"name": "Lavendel", "scientific_name": "Lavandula angustifolia", "quantity": 5}],
        keep=["the apple tree"],
        strength="gentle",
        month_name="June",
        instruction="more white flowers",
    )
    assert "Keep exactly as they are" in text
    assert "the house and all buildings" in text
    assert "the apple tree" in text
    assert "5 x Lavendel (Lavandula angustifolia)" in text
    assert "Change little" in text
    assert "Additional request: more white flowers" in text
    assert "no people" in text


async def test_image_providers(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    session: aiohttp.ClientSession = async_get_clientsession(hass)
    photo = make_image(640, 480)

    # OpenAI: JSON edit, tokens billed
    openai = {"kind": "openai_compatible", "preset": "openai", "api_key": "k",
              "base_url": "https://api.openai.com/v1"}  # fmt: skip
    aioclient_mock.post(
        EDITS,
        json={
            "data": [{"b64_json": PICTURE}],
            "usage": {"input_tokens": 2100, "output_tokens": 1584},
        },
    )
    result = await images.async_edit(session, openai, "gpt-image-2", "p", photo, portrait=False)
    assert (result.usage.input, result.usage.output, result.provider_cost) == (2100, 1584, None)
    assert Image.open(io.BytesIO(result.data)).size == (300, 200)
    body = aioclient_mock.mock_calls[-1][2]
    assert body["model"] == "gpt-image-2"
    assert body["size"] == "1536x1024"
    assert body["images"][0]["image_url"].startswith("data:image/jpeg;base64,")

    # OpenRouter: its own endpoint, the cost comes with the answer
    router = {"kind": "openai_compatible", "preset": "openrouter", "api_key": "k",
              "base_url": "https://openrouter.ai/api/v1"}  # fmt: skip
    aioclient_mock.post(
        "https://openrouter.ai/api/v1/images",
        json={"data": [{"b64_json": PICTURE, "media_type": "image/png"}], "usage": {"cost": 0.04}},
    )
    result = await images.async_edit(
        session, router, "openai/gpt-image-2", "p", photo, portrait=True
    )
    assert result.provider_cost == 0.04
    body = aioclient_mock.mock_calls[-1][2]
    assert body["aspect_ratio"] == "2:3"
    assert body["input_references"][0]["type"] == "image_url"

    # Gemini: the Interactions API, the picture in a model_output step
    gemini = {"kind": "gemini", "api_key": "k"}
    aioclient_mock.post(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        json={
            "steps": [
                {"type": "thought", "summary": []},
                {
                    "type": "model_output",
                    "content": [
                        {"type": "text", "text": "Here you go"},
                        {"type": "image", "mime_type": "image/png", "data": PICTURE},
                    ],
                },
            ]
        },
    )
    result = await images.async_edit(
        session, gemini, "gemini-nano-banana-2.1", "p", photo, portrait=False
    )
    assert result.mime_type == "image/png"
    body = aioclient_mock.mock_calls[-1][2]
    assert [part["type"] for part in body["input"]] == ["text", "image"]
    assert body["response_format"] == {"type": "image", "aspect_ratio": "4:3", "image_size": "1K"}
    assert aioclient_mock.mock_calls[-1][3]["x-goog-api-key"] == "k"

    # no picture in the answer, and providers that cannot
    aioclient_mock.clear_requests()
    aioclient_mock.post(EDITS, json={"data": []})
    with pytest.raises(AIError, match="no picture"):
        await images.async_edit(session, openai, "gpt-image-2", "p", photo, portrait=False)
    with pytest.raises(AIError, match="cannot create pictures"):
        await images.async_edit(session, {"kind": "anthropic"}, "x", "p", photo, portrait=False)
    assert images.flavour({"kind": "openai_compatible", "preset": "ollama"}) is None


async def test_from_photo_to_picture_to_plants(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    garden: MockConfigEntry,
) -> None:
    data = garden.runtime_data
    http = await hass_client()
    client = await hass_ws_client(hass)

    listing = (await _call(client, type="plant_garden/dream/list"))["result"]
    assert listing["designs"] == []
    # OpenAI creates the pictures; about 7 cents: 2500 x $8 + 1600 x $30 per million
    assert listing["image"] == {
        "available": True,
        "provider": "OpenAI",
        "model": "gpt-image-2",
        "cost": 0.068,
        "currency": "USD",
        "cost_known": True,
    }

    # the photo
    form = aiohttp.FormData()
    form.add_field("file", make_image(2400, 1600), filename="garten.jpg", content_type="image/jpeg")
    response = await http.post("/api/plant_garden/dreams", data=form)
    assert response.status == 200, await response.text()
    design = await response.json()
    assert (design["width"], design["height"]) == (1536, 1024)
    photo = await http.get(design["photo_url"])
    assert photo.status == 200
    assert Image.open(io.BytesIO(await photo.read())).size == (1536, 1024)
    bad = aiohttp.FormData()
    bad.add_field("file", b"not an image", filename="x.jpg")
    assert (await http.post("/api/plant_garden/dreams", data=bad)).status == 400

    # step 1: the AI looks and asks back
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(LOOK)))
    msg = await _call(client, type="plant_garden/dream/look", design_id=design["id"])
    assert msg["success"], msg
    look = msg["result"]["look"]
    assert look["description"].startswith("Ich sehe einen Rasen")
    assert [q["question"] for q in look["questions"]] == [
        "Was soll sich ändern?",
        "Wie viel Pflege?",
    ]
    content = aioclient_mock.mock_calls[-1][2]["messages"][0]["content"]
    assert [c["type"] for c in content] == ["image", "text"]

    # step 2: the concept from the wishes and the site
    aioclient_mock.clear_requests()
    aioclient_mock.post(MESSAGES, json=claude(json.dumps(CONCEPT)))
    msg = await _call(
        client,
        type="plant_garden/dream/concept",
        design_id=design["id"],
        wish="Mehr Blüten für Bienen",
        style="cottage",
        strength="gentle",
        keep=["Apfelbaum"],
        answers=[{"question": "Wie viel Pflege?", "answer": "wenig"}],
    )
    assert msg["success"], msg
    concept = msg["result"]["concept"]
    assert [p["name"] for p in concept["plants"]] == ["Lavendel", "Katzenminze"]
    assert concept["site"]["hemisphere"] == "north"
    text = aioclient_mock.mock_calls[-1][2]["messages"][0]["content"][-1]["text"]
    assert "Mehr Blüten für Bienen" in text
    assert '"keep":["Apfelbaum"]' in text
    assert "latitude" not in text
    lavender, _catmint = concept["plants"]

    # step 3: the picture, with only the lavender
    aioclient_mock.clear_requests()
    aioclient_mock.post(
        EDITS,
        json={
            "data": [{"b64_json": PICTURE}],
            "usage": {"input_tokens": 2000, "output_tokens": 1500},
        },
    )
    msg = await _call(
        client, type="plant_garden/dream/picture", design_id=design["id"], plants=[lavender["id"]]
    )
    assert msg["success"], msg
    [picture] = msg["result"]["pictures"]
    assert picture["model"] == "gpt-image-2"
    assert picture["cost"] == pytest.approx(2000 * 8e-6 + 1500 * 30e-6)
    prompt = aioclient_mock.mock_calls[-1][2]["prompt"]
    assert "5 x Lavendel" in prompt
    assert "Katzenminze" not in prompt
    assert "Apfelbaum" in prompt
    assert "Change little" in prompt
    served = await http.get(picture["url"])
    assert Image.open(io.BytesIO(await served.read())).size == (300, 200)
    rows = await data.manager.async_usage_log(limit=5)
    assert [row["feature"] for row in rows][:1] == ["dream_image"]
    assert rows[0]["provider_title"] == "OpenAI"

    # refine that picture with a wish
    msg = await _call(
        client,
        type="plant_garden/dream/picture",
        design_id=design["id"],
        instruction="mehr Weiß",
        base=picture["id"],
    )
    assert len(msg["result"]["pictures"]) == 2
    assert "Additional request: mehr Weiß" in aioclient_mock.mock_calls[-1][2]["prompt"]
    msg = await _call(
        client,
        type="plant_garden/dream/picture/delete",
        design_id=design["id"],
        picture_id=picture["id"],
    )
    assert len(msg["result"]["pictures"]) == 1
    assert (await http.get(picture["url"])).status == 404

    # a failing picture provider is an error, logged, nothing is added
    aioclient_mock.clear_requests()
    aioclient_mock.post(EDITS, status=400, json={"error": {"message": "moderation"}})
    msg = await _call(client, type="plant_garden/dream/picture", design_id=design["id"])
    assert msg["error"]["code"] == "ai_error"

    # take the lavender over: a planned plant with a task, only once
    msg = await _call(
        client, type="plant_garden/dream/plant", design_id=design["id"], plants=[lavender["id"]]
    )
    [plant_id] = msg["result"]["plants"]
    plant = data.manager.get_plant(plant_id)
    assert (plant.name, plant.scientific_name, plant.position) == (
        "Lavendel",
        "Lavandula angustifolia",
        None,
    )
    assert plant.tags == ["planned"]
    assert plant.sources["scientific_name"].source.value == "ai"
    [task] = await data.care.async_tasks(plant_id)
    assert task.title == "5 x Lavendel to plant"
    again = await _call(
        client, type="plant_garden/dream/plant", design_id=design["id"], plants=[lavender["id"]]
    )
    assert again["result"]["plants"] == []
    assert again["result"]["design"]["planted"] == [lavender["id"]]

    # designs survive a reload; deleting removes the files
    assert await hass.config_entries.async_unload(garden.entry_id)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_setup(garden.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    [kept] = (await _call(client, type="plant_garden/dream/list"))["result"]["designs"]
    assert kept["concept"]["summary"].startswith("Ein Staudenbeet")
    assert (await _call(client, type="plant_garden/dream/delete", design_id=design["id"]))[
        "success"
    ]
    assert (await _call(client, type="plant_garden/dream/list"))["result"]["designs"] == []
    assert (await _call(client, type="plant_garden/dream/look", design_id=design["id"]))["error"][
        "code"
    ] == "not_found"


async def test_no_picture_provider(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, loaded_entry: MockConfigEntry
) -> None:
    client = await hass_ws_client(hass)
    image = (await _call(client, type="plant_garden/dream/list"))["result"]["image"]
    assert image["available"] is False
    dream = loaded_entry.runtime_data.dream
    design = await dream.async_create(make_image(400, 600), x=2, y=3)
    assert design["place"] == {"x": 2, "y": 3}
    with pytest.raises(ValueError, match="no concept"):
        await dream.async_picture(design["id"])
