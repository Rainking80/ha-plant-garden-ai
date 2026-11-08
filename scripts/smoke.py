"""End-to-end smoke test against a running, *fresh* Home Assistant instance.

Onboards HA through its HTTP API, adds Plant Garden through the real config flow
and checks that the panel is registered, the bundle is served and the panel's
WebSocket command answers. Started by scripts/smoke; can also be run on its own:

    python scripts/smoke.py http://localhost:8123
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import io
import json
import sys

import aiohttp
from aiohttp import web

CLIENT_ID = "http://localhost/"  # any URL works for the onboarding client
GARDEN_NAME = "Demo-Garten"
START_TIMEOUT = 600  # first start installs integration requirements


async def wait_for_ha(session: aiohttp.ClientSession, base: str) -> None:
    while True:
        try:
            async with session.get(f"{base}/api/onboarding") as resp:
                if resp.status == 200:
                    return
        except aiohttp.ClientError:
            pass
        await asyncio.sleep(2)


async def onboard(
    session: aiohttp.ClientSession,
    base: str,
    *,
    name: str = "Smoke Test",
    username: str = "smoke",
    password: str = "smoke-test-password",
) -> str:
    """Create the owner account of a fresh HA and return an access token."""
    async with session.post(
        f"{base}/api/onboarding/users",
        json={
            "client_id": CLIENT_ID,
            "name": name,
            "username": username,
            "password": password,
            "language": "de",
        },
    ) as resp:
        resp.raise_for_status()
        auth_code = (await resp.json())["auth_code"]
    async with session.post(
        f"{base}/auth/token",
        data={"grant_type": "authorization_code", "code": auth_code, "client_id": CLIENT_ID},
    ) as resp:
        resp.raise_for_status()
        token: str = (await resp.json())["access_token"]
    return token


async def add_garden(session: aiohttp.ClientSession, base: str, headers: dict[str, str]) -> None:
    async with session.post(
        f"{base}/api/config/config_entries/flow",
        json={"handler": "plant_garden", "show_advanced_options": False},
        headers=headers,
    ) as resp:
        resp.raise_for_status()
        flow = await resp.json()
    assert flow["type"] == "form", flow
    async with session.post(
        f"{base}/api/config/config_entries/flow/{flow['flow_id']}",
        json={"garden_name": GARDEN_NAME},
        headers=headers,
    ) as resp:
        resp.raise_for_status()
        result = await resp.json()
    assert result["type"] == "create_entry", result
    print(f"  config entry created: {result['title']}")


async def check_websocket(session: aiohttp.ClientSession, base: str, token: str) -> str:
    ws_url = base.replace("http", "ws", 1) + "/api/websocket"
    async with session.ws_connect(ws_url) as ws:
        assert (await ws.receive_json())["type"] == "auth_required"
        await ws.send_json({"type": "auth", "access_token": token})
        assert (await ws.receive_json())["type"] == "auth_ok"

        # what the HA frontend asks right after login; if one of these fails the
        # whole UI hangs on "loading" (happened with a broken dev environment).
        # Message ids must increase within a connection.
        for msg_id, msg_type in enumerate(
            ("get_config", "get_services", "get_states", "frontend/get_themes"), start=1
        ):
            await ws.send_json({"id": msg_id, "type": msg_type})
            reply = await ws.receive_json()
            assert reply.get("success"), (msg_type, reply)
        print("  HA frontend start-up calls answer (get_config, get_services, …)")

        await ws.send_json({"id": 10, "type": "get_panels"})
        reply = await ws.receive_json()
        assert reply.get("success"), reply
        panels = reply["result"]
        panel = panels.get("plant-garden")
        assert panel, f"panel missing, got {sorted(panels)}"
        assert panel["title"] == GARDEN_NAME, panel
        module_url: str = panel["config"]["_panel_custom"]["module_url"]
        print(f"  panel registered: /{panel['url_path']} -> {module_url}")

        await ws.send_json({"id": 11, "type": "plant_garden/info"})
        info = await ws.receive_json()
        assert info["success"], info
        print(f"  plant_garden/info: {info['result']}")
        return module_url


async def check_bundle(session: aiohttp.ClientSession, base: str, module_url: str) -> None:
    async with session.get(f"{base}{module_url}") as resp:
        assert resp.status == 200, resp.status
        body = await resp.text()
        assert "plant-garden-panel" in body
        print(f"  bundle served: {len(body)} bytes, {resp.headers.get('Content-Type')}")


def _jpeg(width: int = 1600, height: int = 1200) -> bytes:
    from PIL import Image  # noqa: PLC0415 - only needed here

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (60, 140, 70)).save(buffer, format="JPEG")
    return buffer.getvalue()


async def check_plants_and_photos(
    session: aiohttp.ClientSession, base: str, token: str, headers: dict[str, str]
) -> None:
    ws_url = base.replace("http", "ws", 1) + "/api/websocket"
    async with session.ws_connect(ws_url) as ws:
        await ws.receive_json()
        await ws.send_json({"type": "auth", "access_token": token})
        await ws.receive_json()
        ids = iter(range(10, 100))

        async def call(**msg: object) -> dict:
            await ws.send_json({"id": next(ids), **msg})
            reply = await ws.receive_json()
            assert reply["success"], reply
            return reply["result"]

        plant = await call(
            type="plant_garden/plants/create", name="Smoke-Tomate", category="vegetable"
        )
        print(f"  plant created: {plant['name']} ({plant['id']})")

        form = aiohttp.FormData()
        form.add_field("plant_id", plant["id"])
        form.add_field("taken_at", "2026-06-01T09:00:00+02:00")
        form.add_field("file", _jpeg(), filename="tomate.jpg", content_type="image/jpeg")
        async with session.post(
            f"{base}/api/plant_garden/photos", data=form, headers=headers
        ) as resp:
            assert resp.status == 200, await resp.text()
            photo = await resp.json()
        print(f"  photo uploaded: {photo['width']}x{photo['height']}, taken {photo['taken_at']}")

        # signed URLs work without the Authorization header (that is what <img> does)
        async with aiohttp.ClientSession() as anonymous:
            for variant in ("thumb", "medium", "original"):
                async with anonymous.get(f"{base}{photo['urls'][variant]}") as resp:
                    assert resp.status == 200, (variant, resp.status)
            async with anonymous.get(f"{base}{photo['urls']['thumb'].split('?')[0]}") as resp:
                assert resp.status == 403, resp.status
        print("  signed photo URLs served, unsigned URL rejected with 403")

        await call(
            type="plant_garden/measurements/add",
            plant_id=plant["id"],
            measured_on="2026-06-01",
            height_cm=35,
        )
        detail = await call(type="plant_garden/plants/get", plant_id=plant["id"])
        assert detail["plant"]["photo_count"] == 1, detail
        assert detail["plant"]["height_cm"] == 35, detail
        print("  measurement added")

        # garden plan: a bed, the plant inside it
        layout = await call(type="plant_garden/layout/get")
        assert layout["origin"], layout
        bed = await call(
            type="plant_garden/layout/shapes/save",
            shape={
                "kind": "bed",
                "label": "Smoke-Beet",
                "geometry": {"type": "rect", "cx": 2, "cy": 1, "w": 4, "h": 2, "rotation": 10},
            },
        )
        await call(
            type="plant_garden/plants/move",
            moves=[{"plant_id": plant["id"], "position": {"x": 2, "y": 1}}],
        )
        layout = await call(type="plant_garden/layout/get")
        assert [s["id"] for s in layout["shapes"]] == [bed["id"]], layout
        plants = await call(type="plant_garden/plants/list")
        placed = {p["id"]: p["position"] for p in plants["plants"]}
        assert placed[plant["id"]] == {"x": 2.0, "y": 1.0}, placed
        print(f"  plan: origin {layout['origin']}, bed saved, plant placed")

        await check_background_and_markers(session, base, headers, call)
        await check_irrigation(session, base, headers, call, plant["id"])
        await check_ai(session, base, headers, call, plant_id=plant["id"], photo_id=photo["id"])

        await call(type="plant_garden/layout/shapes/delete", shape_id=bed["id"])
        await call(type="plant_garden/plants/delete", plant_id=plant["id"])
        print("  bed and plant deleted")


async def check_background_and_markers(
    session: aiohttp.ClientSession,
    base: str,
    headers: dict[str, str],
    call: Callable[..., Awaitable[dict]],
) -> None:
    """Aerial image preset, an uploaded background image and a sensor marker."""
    result = await call(
        type="plant_garden/layout/set_background",
        background={"type": "wms", "preset": "bb", "opacity": 0.9},
    )
    assert result["background"]["preset"] == "bb", result
    marker = await call(
        type="plant_garden/layout/markers/save",
        marker={"entity_id": "sun.sun", "x": 1, "y": 1},
    )
    form = aiohttp.FormData()
    form.add_field("file", _jpeg(1200, 600), filename="plan.jpg", content_type="image/jpeg")
    async with session.post(
        f"{base}/api/plant_garden/backgrounds", data=form, headers=headers
    ) as resp:
        assert resp.status == 200, await resp.text()
        upload = await resp.json()
    async with (
        aiohttp.ClientSession() as anonymous,
        anonymous.get(f"{base}{upload['url']}") as resp,
    ):
        assert resp.status == 200, resp.status
    image_background = {
        "type": "image",
        "image_id": upload["image_id"],
        "width_px": upload["width_px"],
        "height_px": upload["height_px"],
        "x": -10,
        "y": -5,
        "width_m": 20,
    }
    result = await call(type="plant_garden/layout/set_background", background=image_background)
    assert "authSig=" in result["background"]["url"], result
    print(f"  background: WMS preset, then uploaded image {upload['width_px']}px; marker saved")

    # Move the garden's location 0.001° north and back: the marker keeps its place.
    origin = result["origin"]
    moved = await call(
        type="plant_garden/layout/set_origin",
        latitude=origin["latitude"] + 0.001,
        longitude=origin["longitude"],
    )
    shifted = next(m for m in moved["markers"] if m["id"] == marker["id"])
    assert abs(shifted["y"] - (1 + 111.3)) < 0.5, shifted
    back = await call(type="plant_garden/layout/set_origin", **origin)
    restored = next(m for m in back["markers"] if m["id"] == marker["id"])
    assert abs(restored["y"] - 1) < 0.01, restored
    print("  garden location moved and back; marker stayed in place")

    await call(type="plant_garden/layout/markers/delete", marker_id=marker["id"])
    await call(type="plant_garden/layout/set_background", background={"type": "none"})


async def check_irrigation(
    session: aiohttp.ClientSession,
    base: str,
    headers: dict[str, str],
    call: Callable[..., Awaitable[dict]],
    plant_id: str,
) -> None:
    """A zone over the plant follows a (REST-created) entity: one run waters the plant."""
    valve = "input_boolean.smoke_zone"

    async def set_valve(state: str) -> None:
        async with session.post(
            f"{base}/api/states/{valve}", json={"state": state}, headers=headers
        ) as resp:
            assert resp.status in (200, 201), await resp.text()

    await set_valve("off")
    zone = await call(
        type="plant_garden/layout/shapes/save",
        shape={
            "kind": "zone",
            "label": "Smoke-Zone",
            "geometry": {"type": "rect", "cx": 2, "cy": 1, "w": 4, "h": 4, "rotation": 0},
            "irrigation": {"entity_id": valve, "emitter": "spray", "rate_mm_h": 500},
        },
    )
    await set_valve("on")
    await asyncio.sleep(6)
    await set_valve("off")
    events: list[dict] = []
    for _ in range(20):
        events = (await call(type="plant_garden/irrigation/events", zone_id=zone["id"]))["events"]
        if events:
            break
        await asyncio.sleep(0.5)
    assert len(events) == 1, events
    [share] = events[0]["plants"]
    assert share["plant_id"] == plant_id, events[0]
    assert share["liters"] > 0, events[0]
    summary = await call(type="plant_garden/irrigation/summary")
    assert summary["plants"][plant_id]["total_l"] > 0, summary
    async with session.get(f"{base}/api/states", headers=headers) as resp:
        states = await resp.json()
    received = [
        s
        for s in states
        if s["entity_id"].startswith("sensor.smoke_tomate")
        and s["attributes"].get("unit_of_measurement") == "L"
    ]
    assert received, states
    assert float(received[0]["state"]) > 0, received
    print(
        f"  irrigation: zone run of {events[0]['duration_s']} s recorded, "
        f"{share['liters']} L for the plant, {received[0]['entity_id']} = {received[0]['state']}"
    )
    await call(type="plant_garden/layout/shapes/delete", shape_id=zone["id"])
    await check_weather(session, base, headers, call, plant_id)


async def check_weather(
    session: aiohttp.ClientSession,
    base: str,
    headers: dict[str, str],
    call: Callable[..., Awaitable[dict]],
    plant_id: str,
) -> None:
    """Add Open-Meteo as weather source (real request, Berlin centre) and read the balance."""
    summary = await call(type="plant_garden/water/summary")
    assert summary["configured"] is False, summary
    entry_id = (await call(type="plant_garden/info"))["entry_id"]
    flow_url = f"{base}/api/config/config_entries/subentries/flow"
    async with session.post(
        flow_url, json={"handler": [entry_id, "weather"]}, headers=headers
    ) as resp:
        flow = await resp.json()
    for step in ({"source": "open_meteo"}, {}):
        async with session.post(
            f"{flow_url}/{flow['flow_id']}", json=step, headers=headers
        ) as resp:
            flow = await resp.json()
    assert flow["type"] == "create_entry", flow
    summary = await call(type="plant_garden/water/refresh")
    assert summary["sources"][0]["ok"], summary
    past = [day for day in summary["weather"] if not day["forecast"]]
    assert len(past) >= 10, summary["weather"]
    assert any(day["forecast"] for day in summary["weather"]), summary["weather"]
    balance = summary["plants"][plant_id]
    assert balance["taw"] > 0, balance
    print(
        f"  weather: Open-Meteo added, {len(summary['weather'])} days; "
        f"plant deficit {balance['depletion']} of {balance['taw']} mm"
    )


FAKE_AI_PORT = 18765
FAKE_KEY = "sk-smoke-0000-secret-1234"
FAKE_ANSWER = {
    "candidates": [
        {
            "scientific_name": "Solanum lycopersicum",
            "common_name_de": "Tomate",
            "common_name_en": "Tomato",
            "variety": None,
            "family": "Solanaceae",
            "confidence": 0.93,
            "reason": "Gefiederte Blätter, gelbe Sternblüten",
        }
    ],
    "size": {
        "height_cm": 40,
        "height_min_cm": 30,
        "height_max_cm": 50,
        "width_cm": None,
        "width_min_cm": None,
        "width_max_cm": None,
        "confidence": 0.4,
        "basis": "Gießkanne im Bild",
    },
    "age": {
        "age_months": None,
        "min_months": None,
        "max_months": None,
        "stage": None,
        "confidence": 0,
    },
    "health": {"status": "healthy", "summary": "Kräftig, keine Flecken."},
    "care": {
        "category": "vegetable",
        "water_need": "high",
        "light": "full_sun",
        "min_temperature_c": 10,
        "mature_crown_diameter_m": 0.6,
        "pruning": "Geiztriebe ausbrechen",
        "confidence": 0.7,
    },
    "questions": ["Welche Sorte hast du gepflanzt?"],
}


FAKE_DIAGNOSIS = {
    "summary": "Wahrscheinlich Trockenstress.",
    "health": "watch",
    "symptoms": ["Blätter hängen"],
    "causes": [{"name": "Trockenheit", "type": "water", "confidence": 0.7, "evidence": "Defizit"}],
    "actions": [{"text": "Morgens gießen", "urgency": "now", "warning": None}],
    "monitoring": [],
    "missing_info": [],
    "follow_up_days": 7,
}


async def fake_ai_server(requests: list[dict]) -> web.AppRunner:
    """An OpenAI-compatible endpoint on localhost: no key, no cost, fixed answer."""

    def authorized(request: web.Request) -> bool:
        return request.headers.get("Authorization") == f"Bearer {FAKE_KEY}"

    async def models(request: web.Request) -> web.Response:
        if not authorized(request):
            return web.json_response({"error": "bad key"}, status=401)
        return web.json_response({"data": [{"id": "fake-vision"}, {"id": "fake-text"}]})

    async def completions(request: web.Request) -> web.Response:
        if not authorized(request):
            return web.json_response({"error": "bad key"}, status=401)
        body = await request.json()
        requests.append(body)
        if body.get("stream"):  # the chat: answer in pieces as server-sent events
            response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
            await response.prepare(request)
            for chunk in (
                {"choices": [{"delta": {"content": "Gieß "}}]},
                {"choices": [{"delta": {"content": "morgen früh."}, "finish_reason": "stop"}]},
                {"choices": [], "usage": {"prompt_tokens": 400, "completion_tokens": 20}},
            ):
                await response.write(f"data: {json.dumps(chunk)}\n\n".encode())
            await response.write(b"data: [DONE]\n\n")
            await response.write_eof()
            return response
        schema = (body.get("response_format") or {}).get("json_schema", {}).get("name", "")
        answer = FAKE_DIAGNOSIS if schema == "plant_garden_diagnose" else FAKE_ANSWER
        return web.json_response(
            {
                "id": "chatcmpl-smoke",
                "model": body["model"],
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": json.dumps(answer)},
                    }
                ],
                "usage": {
                    "prompt_tokens": 1500,
                    "prompt_tokens_details": {"cached_tokens": 500},
                    "completion_tokens": 300,
                },
            }
        )

    app = web.Application()
    app.router.add_get("/v1/models", models)
    app.router.add_post("/v1/chat/completions", completions)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", FAKE_AI_PORT).start()
    return runner


async def add_fake_provider(
    session: aiohttp.ClientSession, base: str, headers: dict[str, str], entry_id: str
) -> None:
    """The real subentry flow: a wrong key is refused, the right one saved."""
    flow_url = f"{base}/api/config/config_entries/subentries/flow"
    async with session.post(flow_url, json={"handler": [entry_id, "ai"]}, headers=headers) as resp:
        flow = await resp.json()
    url = f"http://127.0.0.1:{FAKE_AI_PORT}/v1"
    steps = (
        {"kind": "openai_compatible"},
        {"preset": "custom", "base_url": url, "api_key": "sk-wrong"},
        {"preset": "custom", "base_url": url, "api_key": FAKE_KEY},
        {"model": "fake-vision"},
    )
    for step in steps:
        async with session.post(
            f"{flow_url}/{flow['flow_id']}", json=step, headers=headers
        ) as resp:
            flow = await resp.json()
        if step.get("api_key") == "sk-wrong":
            assert flow["errors"] == {"base": "invalid_auth"}, flow
    assert flow["type"] == "create_entry", flow
    print(f"  ai: provider added through the flow (wrong key refused): {flow['title']}")


async def check_identification(
    call: Callable[..., Awaitable[dict]], requests: list[dict], plant_id: str, photo_id: str
) -> None:
    """Identify with the fake model and take one suggestion over."""
    await call(
        type="plant_garden/ai/pricing/set",
        kind="openai_compatible",
        model="fake-vision",
        prices={"input": 1, "cached_input": 0.1, "output": 4},
    )
    estimate = await call(type="plant_garden/ai/estimate", photos=1)
    assert estimate["cost"], estimate
    assert estimate["cost"] > 0, estimate
    record = await call(
        type="plant_garden/ai/identify",
        plant_id=plant_id,
        photos=[{"photo_id": photo_id, "organ": "leaf"}],
    )
    [sent] = requests
    images = [
        part
        for message in sent["messages"]
        for part in (message["content"] if isinstance(message["content"], list) else [])
        if part.get("type") == "image_url"
    ]
    assert images, sent
    assert images[0]["image_url"]["url"].startswith("data:image/"), images
    assert sent["response_format"]["type"] == "json_schema", sent
    assert record["result"]["candidates"][0]["scientific_name"] == "Solanum lycopersicum"
    assert record["plantnet"] is None, record
    states = {s["key"]: s["state"] for s in record["suggestions"]}
    assert states["scientific_name"] == "new", states
    assert states["category"] == "same", states  # the user chose vegetable
    await call(type="plant_garden/ai/decide", plant_id=plant_id, key="scientific_name", accept=True)
    plant = (await call(type="plant_garden/plants/get", plant_id=plant_id))["plant"]
    assert plant["scientific_name"] == "Solanum lycopersicum", plant
    assert plant["sources"]["scientific_name"]["source"] == "ai", plant["sources"]
    print(
        f"  ai: identified as {plant['scientific_name']} "
        f"({len(images)} photo as data URI), suggestion taken over with source ai"
    )


# entity ids follow HA's language (de: "KI-Anfragen heute"), so sensors are matched by name
AI_SENSOR_NAMES = (
    "AI requests today",
    "AI tokens this month",
    "KI-Anfragen heute",
    "KI-Tokens im Monat",
)


async def check_usage(
    session: aiohttp.ClientSession,
    base: str,
    headers: dict[str, str],
    call: Callable[..., Awaitable[dict]],
) -> None:
    """Tokens and cost of the call, the log, the tech page and the sensors; the key stays hidden."""
    today = (await call(type="plant_garden/ai/usage/summary"))["today"]
    assert today["requests"] == 1, today
    assert (today["input"], today["cached_input"], today["output"]) == (1000, 500, 300)
    expected = (1000 * 1 + 500 * 0.1 + 300 * 4) / 1e6
    assert abs(today["cost"] - expected) < 1e-9, (today["cost"], expected)
    [row] = (await call(type="plant_garden/ai/usage/log"))["rows"]
    assert row["status"] == "ok", row
    assert row["prompt"] is None, row  # debug log is off
    tech = await call(type="plant_garden/tech/info")
    [provider] = tech["providers"]
    assert FAKE_KEY not in json.dumps(tech), provider
    assert provider["key"].endswith("1234"), provider
    test = await call(type="plant_garden/ai/test", provider_id=provider["id"])
    assert test["ok"], test
    async with session.get(f"{base}/api/states", headers=headers) as resp:
        all_states = await resp.json()
    assert FAKE_KEY not in json.dumps(all_states)
    sensors = {
        s["entity_id"]: s["state"]
        for s in all_states
        if s["entity_id"].startswith("sensor.")
        and s["attributes"].get("friendly_name", "").endswith(AI_SENSOR_NAMES)
    }
    assert sorted(sensors.values()) == ["1", "1800"], sensors
    print(
        f"  ai: usage {today['input']}+{today['cached_input']} cached in, "
        f"{today['output']} out = {today['cost']:.6f} USD; key masked as {provider['key']}; "
        f"sensors {sensors}"
    )


async def check_ai(
    session: aiohttp.ClientSession,
    base: str,
    headers: dict[str, str],
    call: Callable[..., Awaitable[dict]],
    *,
    plant_id: str,
    photo_id: str,
) -> None:
    """Provider flow, identification, suggestions, usage log and tech page with a fake AI."""
    status = await call(type="plant_garden/ai/status")
    assert status["available"] is False, status
    requests: list[dict] = []
    runner = await fake_ai_server(requests)
    try:
        entry_id = (await call(type="plant_garden/info"))["entry_id"]
        await add_fake_provider(session, base, headers, entry_id)
        await check_identification(call, requests, plant_id, photo_id)
        await check_usage(session, base, headers, call)
        await check_assistant(session, base, headers, call, plant_id)
    finally:
        await runner.cleanup()


TODO_NAMES = ("Garden tasks", "Gartenaufgaben")


async def check_assistant(
    session: aiohttp.ClientSession,
    base: str,
    headers: dict[str, str],
    call: Callable[..., Awaitable[dict]],
    plant_id: str,
) -> None:
    """M7: problem from a tagged photo, diagnosis, tasks in the HA to-do list, streamed chat."""
    form = aiohttp.FormData()
    form.add_field("plant_id", plant_id)
    form.add_field("tags", "problem")
    form.add_field("note", "Blätter hängen")
    form.add_field("file", _jpeg(800, 600), filename="welke.jpg", content_type="image/jpeg")
    async with session.post(f"{base}/api/plant_garden/photos", data=form, headers=headers) as resp:
        assert resp.status == 200, await resp.text()
    [problem] = (await call(type="plant_garden/problems/list", plant_id=plant_id))["problems"]
    assert problem["title"] == "Blätter hängen", problem
    result = await call(type="plant_garden/problems/diagnose", problem_id=problem["id"])
    diagnosis = result["problem"]["diagnosis"]
    assert diagnosis["causes"][0]["name"] == "Trockenheit", diagnosis
    [follow_up] = (await call(type="plant_garden/tasks/list", plant_id=plant_id))["tasks"]
    assert follow_up["kind"] == "photo", follow_up
    print(f"  assistant: problem from a tagged photo, diagnosed ({diagnosis['summary']})")

    # the follow-up task is in Home Assistant's to-do list and can be ticked off there
    async with session.get(f"{base}/api/states", headers=headers) as resp:
        states = await resp.json()
    [todo] = [
        s
        for s in states
        if s["entity_id"].startswith("todo.")
        and s["attributes"].get("friendly_name", "").endswith(TODO_NAMES)
    ]
    assert todo["state"] == "1", todo
    async with session.post(
        f"{base}/api/services/todo/update_item",
        json={"entity_id": todo["entity_id"], "item": follow_up["id"], "status": "completed"},
        headers=headers,
    ) as resp:
        assert resp.status == 200, await resp.text()
    tasks = (await call(type="plant_garden/tasks/list", plant_id=plant_id))["tasks"]
    assert [t["status"] for t in tasks] == ["done"], tasks
    print(f"  assistant: task ticked off in {todo['entity_id']}")

    # chat: a subscription that streams the answer
    ws_url = base.replace("http", "ws", 1) + "/api/websocket"
    token = headers["Authorization"].removeprefix("Bearer ")
    async with session.ws_connect(ws_url) as ws:
        await ws.receive_json()
        await ws.send_json({"type": "auth", "access_token": token})
        await ws.receive_json()
        await ws.send_json(
            {"id": 1, "type": "plant_garden/assistant/chat", "plant_id": plant_id, "text": "Wann?"}
        )
        assert (await ws.receive_json())["success"]
        deltas = []
        while True:
            event = (await ws.receive_json())["event"]
            if "delta" in event:
                deltas.append(event["delta"])
                continue
            assert event.get("done"), event
            break
    assert deltas == ["Gieß ", "morgen früh."], deltas
    print(f"  assistant: chat streamed in {len(deltas)} pieces: {''.join(deltas)}")


async def main(base: str) -> None:
    async with aiohttp.ClientSession() as session:
        print(f"waiting for {base} ...")
        async with asyncio.timeout(START_TIMEOUT):
            await wait_for_ha(session, base)
        token = await onboard(session, base)
        print("  onboarding done")
        headers = {"Authorization": f"Bearer {token}"}
        await add_garden(session, base, headers)
        module_url = await check_websocket(session, base, token)
        await check_bundle(session, base, module_url)
        await check_plants_and_photos(session, base, token, headers)
    print("SMOKE TEST OK")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8123"))
