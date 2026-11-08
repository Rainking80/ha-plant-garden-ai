"""Prepare a local dev Home Assistant (scripts/develop) for trying the panel.

On a fresh instance it creates the login `dev` with a random password (printed
once), finishes onboarding, adds Plant Garden and fills it with an invented demo
garden. A long-lived token is kept in the HA config dir, so later runs need no
login. Existing gardens are left alone unless --reset is given.

    uv run python scripts/demo.py [--reset] [http://localhost:8123]
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import os
from pathlib import Path
import secrets
from typing import Any

import aiohttp
from smoke import CLIENT_ID, START_TIMEOUT, onboard

TOKEN_FILE = (
    Path(os.environ.get("HA_DEV_CONFIG", Path.home() / ".ha-plant-garden-dev")) / ".demo_token"
)

# An invented garden of about 30 x 20 m, centred on the HA home location.
SHAPES: list[dict[str, Any]] = [
    {
        "kind": "boundary",
        "label": None,
        "z": -10,
        "locked": True,
        "geometry": {"type": "polygon", "points": [[-15, -10], [15, -10], [15, 10], [-15, 10]]},
    },
    {
        "kind": "lawn",
        "label": "Rasen",
        "z": -6,
        "link": "Rasen",
        "geometry": {"type": "polygon", "points": [[-13, -1], [6, -1], [6, 8.5], [-13, 8.5]]},
    },
    {
        "kind": "house",
        "label": "Haus",
        "z": 5,
        "locked": True,
        "geometry": {"type": "rect", "cx": -6, "cy": -6, "w": 11, "h": 7, "rotation": 0},
    },
    {
        "kind": "terrace",
        "label": "Terrasse",
        "z": -5,
        "geometry": {"type": "rect", "cx": -6, "cy": -1.5, "w": 8, "h": 2.6, "rotation": 0},
    },
    {
        "kind": "path",
        "label": None,
        "z": -4,
        "geometry": {
            "type": "polygon",
            "points": [[-2, -1.5], [9.5, -1.5], [9.5, -0.5], [-2, -0.5]],
        },
    },
    {
        "kind": "bed",
        "label": "Staudenbeet",
        "z": -2,
        "soil_type": "loam",
        "geometry": {
            "type": "polygon",
            "points": [[7, 0.5], [13.5, 0.5], [13.5, 6], [10, 8.5], [7, 6]],
        },
    },
    {
        "kind": "raised_bed",
        "label": "Hochbeet",
        "z": -1,
        "soil_type": "potting_mix",
        "geometry": {"type": "rect", "cx": 10.5, "cy": -6, "w": 4, "h": 1.2, "rotation": 0},
    },
    {
        "kind": "greenhouse",
        "label": "Gewächshaus",
        "z": 4,
        "geometry": {"type": "rect", "cx": 4, "cy": -7, "w": 3, "h": 2.4, "rotation": 0},
    },
    {
        "kind": "pond",
        "label": "Teich",
        "z": -3,
        "geometry": {"type": "circle", "cx": -10, "cy": 5.5, "r": 1.6},
    },
    {
        "kind": "hedge",
        "label": "Hecke",
        "z": 0,
        "link": "Hainbuchenhecke",
        "geometry": {"type": "rect", "cx": 0, "cy": 9.4, "w": 29, "h": 0.9, "rotation": 0},
    },
]

# name, fields, position or None (stays in the tray), height and width in cm
PLANTS: list[tuple[str, dict[str, Any], tuple[float, float] | None, tuple[float, float] | None]] = [
    (
        "Apfelbaum",
        {
            "scientific_name": "Malus domestica",
            "variety": "Boskoop",
            "category": "tree",
            "light": "full_sun",
            "water_need": "moderate",
            "planted_on": "2019-03-20",
        },
        (2.5, 4.5),
        (380, 340),
    ),
    (
        "Hortensie",
        {
            "scientific_name": "Hydrangea macrophylla",
            "category": "shrub",
            "light": "partial_shade",
            "water_need": "high",
            "status": "watch",
            "age": {"age_months": 36, "on": "2024-05-01"},
        },
        (-11.5, -1.6),
        (110, 120),
    ),
    (
        "Lavendel",
        {
            "scientific_name": "Lavandula angustifolia",
            "category": "perennial",
            "light": "full_sun",
            "water_need": "low",
        },
        (8.2, 1.6),
        (45, 50),
    ),
    (
        "Lavendel 2",
        {
            "scientific_name": "Lavandula angustifolia",
            "category": "perennial",
            "light": "full_sun",
            "water_need": "low",
        },
        (9.2, 1.6),
        None,
    ),
    (
        "Rose",
        {
            "scientific_name": "Rosa",
            "variety": "Gloria Dei",
            "category": "shrub",
            "light": "full_sun",
            "water_need": "moderate",
            "status": "problem",
        },
        (11.6, 2.8),
        (90, 70),
    ),
    (
        "Pfingstrose",
        {"scientific_name": "Paeonia lactiflora", "category": "perennial"},
        (9, 4.5),
        None,
    ),
    (
        "Tomaten",
        {
            "scientific_name": "Solanum lycopersicum",
            "category": "vegetable",
            "location_type": "raised_bed",
            "water_need": "high",
        },
        (9.6, -6),
        (120, 50),
    ),
    ("Kräuter", {"category": "herb", "location_type": "raised_bed"}, (11.8, -6), None),
    ("Rasen", {"category": "lawn", "location_type": "lawn", "water_need": "moderate"}, None, None),
    (
        "Hainbuchenhecke",
        {"scientific_name": "Carpinus betulus", "category": "hedge", "water_need": "moderate"},
        None,
        (180, 90),
    ),
    (
        "Bonsai",
        {
            "scientific_name": "Juniperus chinensis",
            "category": "potted",
            "location_type": "pot",
            "water_need": "moderate",
        },
        None,
        (35, 40),
    ),
    (
        "Minze",
        {"scientific_name": "Mentha", "category": "herb", "location_type": "pot"},
        None,
        None,
    ),
]


MARKERS = [
    ("sensor.demo_bodenfeuchte_beet", 10.5, 3.5),
    ("sensor.demo_zisterne", 13.5, -8.5),
    ("input_boolean.demo_zone_lawn", -3, 4),
]


async def add_markers_and_background(call: Any, layout: dict[str, Any], reset: bool) -> None:
    """Sensor markers and the aerial image, unless the user already set their own."""
    states = {s["entity_id"] for s in await call(type="get_states")}
    if reset:
        for marker in layout["markers"]:
            await call(type="plant_garden/layout/markers/delete", marker_id=marker["id"])
    if reset or not layout["markers"]:
        added = 0
        for entity_id, x, y in MARKERS:
            if entity_id in states:
                await call(
                    type="plant_garden/layout/markers/save",
                    marker={"entity_id": entity_id, "x": x, "y": y},
                )
                added += 1
        print(f"  {added} Sensor-Marker angelegt")
    if reset or not layout["background"]:
        origin = layout["origin"] or {}
        # the dev instance lives in Berlin; elsewhere leave the background to the user
        if 51.3 < origin.get("latitude", 0) < 53.6 and 11.2 < origin.get("longitude", 0) < 14.8:
            await call(
                type="plant_garden/layout/set_background",
                background={"type": "wms", "preset": "bb", "opacity": 1},
            )
            print("  Luftbild Berlin/Brandenburg als Hintergrund gesetzt")


async def finish_onboarding(
    session: aiohttp.ClientSession, base: str, headers: dict[str, str]
) -> None:
    for step, payload in (
        ("core_config", None),
        ("analytics", None),
        ("integration", {"client_id": CLIENT_ID, "redirect_uri": f"{CLIENT_ID}?auth_callback=1"}),
    ):
        async with session.post(
            f"{base}/api/onboarding/{step}", json=payload, headers=headers
        ) as resp:
            if resp.status not in (200, 403):  # 403: step already done
                print(f"  onboarding step {step}: HTTP {resp.status}")


async def wait_until_up(session: aiohttp.ClientSession, base: str) -> None:
    """Unlike smoke.wait_for_ha this also works for onboarded instances: HA only
    serves /api/onboarding while onboarding is not finished."""
    while True:
        try:
            async with session.get(f"{base}/manifest.json") as resp:
                if resp.status == 200:
                    return
        except aiohttp.ClientError:
            pass
        await asyncio.sleep(2)


async def login(session: aiohttp.ClientSession, base: str) -> str:
    """A token for the dev instance: onboard if fresh, else the stored long-lived token."""
    async with session.get(f"{base}/api/onboarding") as resp:
        # 404: onboarding finished, the endpoint is gone
        steps = {s["step"]: s["done"] for s in await resp.json()} if resp.status == 200 else {}
    if resp.status == 200 and not steps.get("user"):
        password = secrets.token_urlsafe(9)
        token = await onboard(session, base, name="Dev", username="dev", password=password)
        await finish_onboarding(session, base, {"Authorization": f"Bearer {token}"})
        print(f"  Login für http://localhost:8123 -> Benutzer: dev   Passwort: {password}")
        return token
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text().strip()
    raise SystemExit(
        f"HA is already onboarded and {TOKEN_FILE} is missing. Create a long-lived token "
        "in your HA profile and write it to that file."
    )


async def main(base: str, reset: bool) -> None:
    async with aiohttp.ClientSession() as session:
        print(f"waiting for {base} ...")
        async with asyncio.timeout(START_TIMEOUT):
            await wait_until_up(session, base)
        token = await login(session, base)
        headers = {"Authorization": f"Bearer {token}"}

        async with session.ws_connect(base.replace("http", "ws", 1) + "/api/websocket") as ws:
            await ws.receive_json()
            await ws.send_json({"type": "auth", "access_token": token})
            assert (await ws.receive_json())["type"] == "auth_ok"
            ids = itertools.count(1)

            async def call(**msg: Any) -> Any:
                await ws.send_json({"id": next(ids), **msg})
                reply = await ws.receive_json()
                if not reply["success"]:
                    raise RuntimeError(f"{msg['type']}: {reply['error']}")
                return reply["result"]

            if not TOKEN_FILE.exists():
                long_lived = await call(
                    type="auth/long_lived_access_token",
                    client_name="plant-garden-demo",
                    lifespan=3650,
                )
                TOKEN_FILE.write_text(long_lived)
                TOKEN_FILE.chmod(0o600)

            entries = await call(type="config_entries/get", domain="plant_garden")
            if not entries:
                async with session.post(
                    f"{base}/api/config/config_entries/flow",
                    json={"handler": "plant_garden"},
                    headers=headers,
                ) as resp:
                    flow = await resp.json()
                async with session.post(
                    f"{base}/api/config/config_entries/flow/{flow['flow_id']}",
                    json={"garden_name": "Demo-Garten"},
                    headers=headers,
                ) as resp:
                    assert (await resp.json())["type"] == "create_entry"
                print("  Plant Garden eingerichtet")

            existing = (await call(type="plant_garden/plants/list"))["plants"]
            layout = await call(type="plant_garden/layout/get")
            await add_markers_and_background(call, layout, reset)
            if (existing or layout["shapes"]) and not reset:
                print("  Pflanzen/Flächen gibt es schon, nicht verändert (--reset zum Neuaufbau)")
                return
            for plant in existing:
                await call(type="plant_garden/plants/delete", plant_id=plant["id"])
            for shape in layout["shapes"]:
                await call(type="plant_garden/layout/shapes/delete", shape_id=shape["id"])

            plant_ids: dict[str, str] = {}
            moves = []
            for name, fields, position, size in PLANTS:
                plant = await call(type="plant_garden/plants/create", name=name, **fields)
                plant_ids[name] = plant["id"]
                if position:
                    moves.append(
                        {"plant_id": plant["id"], "position": {"x": position[0], "y": position[1]}}
                    )
                if size:
                    await call(
                        type="plant_garden/measurements/add",
                        plant_id=plant["id"],
                        measured_on="2026-06-15",
                        height_cm=size[0],
                        width_cm=size[1],
                    )
            await call(type="plant_garden/plants/move", moves=moves)
            for spec in SHAPES:
                shape = {k: v for k, v in spec.items() if k != "link"}
                if spec.get("link"):
                    shape["plant_id"] = plant_ids[spec["link"]]
                await call(type="plant_garden/layout/shapes/save", shape=shape)
            print(f"  Demo-Garten angelegt: {len(PLANTS)} Pflanzen, {len(SHAPES)} Flächen")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("base", nargs="?", default="http://localhost:8123")
    parser.add_argument("--reset", action="store_true", help="replace existing garden data")
    args = parser.parse_args()
    asyncio.run(main(args.base, args.reset))
