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
import sys

import aiohttp

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

        await ws.send_json({"id": 1, "type": "get_panels"})
        panels = (await ws.receive_json())["result"]
        panel = panels.get("plant-garden")
        assert panel, f"panel missing, got {sorted(panels)}"
        assert panel["title"] == GARDEN_NAME, panel
        module_url: str = panel["config"]["_panel_custom"]["module_url"]
        print(f"  panel registered: /{panel['url_path']} -> {module_url}")

        await ws.send_json({"id": 2, "type": "plant_garden/info"})
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
    await call(type="plant_garden/layout/markers/delete", marker_id=marker["id"])
    await call(type="plant_garden/layout/set_background", background={"type": "none"})


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
