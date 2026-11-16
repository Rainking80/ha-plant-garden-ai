"""Sun and shade on the plan."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.plant_garden import sun
from custom_components.plant_garden.models import Plant, PlantCategory, Point, Shape, ShapeKind

LAT = 52.5


def _plant(plant_id: str, x: float, y: float, **fields: object) -> Plant:
    now = dt_util.utcnow()
    return Plant(
        id=plant_id,
        name=plant_id,
        created_at=now,
        updated_at=now,
        position=Point(x, y),
        **fields,  # type: ignore[arg-type]
    )


def _house(height: float | None = None) -> Shape:
    # 10 m wide, 6 m deep, its middle at the origin
    return Shape(
        id="H",
        kind=ShapeKind.HOUSE,
        geometry={"type": "rect", "cx": 0, "cy": 0, "w": 10, "h": 6, "rotation": 0},
        height_m=height,
    )


def test_sun_position() -> None:
    # equinox, noon: 90° minus the latitude high, due south
    elevation, azimuth = sun.sun_position(LAT, 81, 12)
    assert elevation == pytest.approx(37.5, abs=0.2)
    assert azimuth == pytest.approx(180, abs=0.1)
    # midsummer noon is 23.44° higher; midwinter as much lower
    assert sun.sun_position(LAT, 172, 12)[0] == pytest.approx(60.9, abs=0.2)
    assert sun.sun_position(LAT, 355, 12)[0] == pytest.approx(14.1, abs=0.2)
    # morning in the east, evening in the west, night below the horizon
    assert sun.sun_position(LAT, 81, 6)[1] == pytest.approx(90, abs=0.5)
    assert sun.sun_position(LAT, 81, 18)[1] == pytest.approx(270, abs=0.5)
    assert sun.sun_position(LAT, 81, 0)[0] < 0
    # south of the equator the noon sun stands in the north
    assert sun.sun_position(-35, 81, 12)[1] == pytest.approx(0, abs=0.1)


def test_obstacles_and_their_heights() -> None:
    tree = _plant("tree", 20, 0, category=PlantCategory.TREE)
    rose = _plant("rose", 22, 0, category=PlantCategory.PERENNIAL)
    hedge = _plant("hedge", 0, 0, category=PlantCategory.HEDGE)
    hedge.position = None
    shapes = [
        _house(),
        Shape(
            id="B",
            kind=ShapeKind.BED,
            geometry={"type": "circle", "cx": 5, "cy": 9, "r": 1},
        ),
        Shape(
            id="G",
            kind=ShapeKind.HEDGE,
            plant_id="hedge",
            geometry={"type": "polygon", "points": [[0, 10], [8, 10], [8, 11], [0, 11]]},
        ),
        Shape(
            id="Z",
            kind=ShapeKind.ZONE,
            geometry={"type": "circle", "cx": 0, "cy": 0, "r": 30},
        ),
    ]
    found = sun.obstacles(shapes, [tree, rose, hedge], {"hedge": 250}, {"tree": 600})
    by_owner = {(o.plant_id, o.height) for o in found}
    # the house by its default, the hedge by its measured height, the tree by its
    # category; beds, zones and low plants cast no shadow
    assert by_owner == {(None, 6.0), ("hedge", 2.5), ("tree", 6.0)}
    crown = next(o for o in found if o.plant_id == "tree")
    assert crown.radius == pytest.approx(3)
    # an own height wins; a flat one casts no shadow
    assert sun.obstacles([_house(9)], [], {}, {})[0].height == 9
    assert sun.obstacles([_house(0.5)], [], {}, {}) == []


def test_shade_north_of_a_house() -> None:
    blockers = sun.obstacles([_house()], [], {}, {})
    # open ground far away: every look at the sun counts
    open_june = sun.sun_hours(60, 60, blockers, LAT, 6)
    assert open_june == pytest.approx(15.3, abs=0.4)  # the sun above 5°
    # 2 m north of the wall (y is south, so north is negative): only morning and
    # evening sun, which comes from the north-east and north-west in June
    north = sun.sun_hours(0, -5, blockers, LAT, 6)
    assert north < open_june - 5
    # 2 m south of it: sun all day but the early morning and late evening
    south = sun.sun_hours(0, 5, blockers, LAT, 6)
    assert south > north + 3
    # in December the sun stays in the south: right behind the house it is dark all
    # day, 10 m behind it the low sun still passes the house's corners
    assert sun.sun_hours(0, -5, blockers, LAT, 12) == 0
    assert 0 < sun.sun_hours(0, -13, blockers, LAT, 12) < sun.sun_hours(0, 13, blockers, LAT, 12)
    assert sun.sun_hours(0, 13, blockers, LAT, 12) > 4
    # inside the outline nothing shines
    assert sun.sun_hours(0, 0, blockers, LAT, 6) == 0


def test_a_plant_does_not_shade_itself() -> None:
    tree = _plant("tree", 0, 0, category=PlantCategory.TREE)
    blockers = sun.obstacles([], [tree], {}, {})
    assert sun.sun_hours(0, 0, blockers, LAT, 6) == 0
    assert sun.sun_hours(0, 0, blockers, LAT, 6, own="tree") > 14
    # the fern under it is in its shade
    result = sun.plants_sun([tree, _plant("fern", 0.5, -1)], [], blockers, LAT)
    assert result["tree"]["light"] == "full_sun"
    assert result["fern"]["light"] == "shade"
    assert len(result["fern"]["months"]) == 12
    assert result["tree"]["season_hours"] == pytest.approx(13.5, abs=0.6)


def test_light_classes_and_season() -> None:
    assert sun.light_class(6).value == "full_sun"
    assert sun.light_class(5.9).value == "partial_shade"
    assert sun.light_class(2.9).value == "shade"
    assert sun.season_months(52) == (4, 5, 6, 7, 8, 9)
    assert sun.season_months(-35) == (10, 11, 12, 1, 2, 3)


def test_sun_map() -> None:
    blockers = sun.obstacles([_house()], [], {}, {})
    box = sun.plan_bounds([_house()], [])
    assert box == (-7, -5, 7, 5)
    grid = sun.sun_map(box, blockers, LAT, 6)
    assert (grid["cols"], grid["rows"]) == (40, 29)
    assert grid["cell"] == pytest.approx(0.35)
    assert len(grid["hours"]) == 40 * 29
    assert grid["day_hours"] == pytest.approx(15.3, abs=0.4)
    # the top row is north of the house (shaded around noon), the bottom row south
    middle = 20
    assert grid["hours"][middle] < grid["hours"][28 * 40 + middle]
    assert sun.plan_bounds([], []) is None


async def test_sun_commands(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    client = await hass_ws_client(hass)

    async def call(msg: dict) -> dict:
        await client.send_json_auto_id(msg)
        return await client.receive_json()

    # an empty plan has no map
    assert (await call({"type": "plant_garden/sun/map", "month": 6}))["result"] is None

    house = {
        "kind": "house",
        "geometry": {"type": "rect", "cx": 0, "cy": 0, "w": 10, "h": 6, "rotation": 0},
        "height_m": 8,
    }
    saved = (await call({"type": "plant_garden/layout/shapes/save", "shape": house}))["result"]
    assert saved["height_m"] == 8
    manager = loaded_entry.runtime_data.manager
    fern = await manager.async_create_plant({"name": "Farn", "position": {"x": 0, "y": -4}})
    rose = await manager.async_create_plant({"name": "Rose", "position": {"x": 0, "y": 6}})

    summary = (await call({"type": "plant_garden/sun/summary"}))["result"]
    assert summary["obstacles"] == 1
    assert summary["season"] == [4, 5, 6, 7, 8, 9]
    assert summary["plants"][rose.id]["light"] == "full_sun"
    assert summary["plants"][rose.id]["season_hours"] > summary["plants"][fern.id]["season_hours"]

    grid = (await call({"type": "plant_garden/sun/map", "month": 6}))["result"]
    assert grid["month"] == 6
    assert len(grid["hours"]) == grid["cols"] * grid["rows"]
    assert (await call({"type": "plant_garden/sun/map", "month": 13}))["success"] is False
