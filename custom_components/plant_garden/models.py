"""Domain model of Plant Garden.

Plain dataclasses with explicit (de)serialisation. Plants live in the HA Store
(JSON); photos and measurements live in SQLite (see database.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Any, Self


class Source(StrEnum):
    """Where a value came from. User values always win over everything else."""

    USER = "user"
    AI = "ai"
    PROVIDER = "provider"
    DEFAULT = "default"


class PlantCategory(StrEnum):
    """Rough botanical/horticultural group."""

    PERENNIAL = "perennial"
    SHRUB = "shrub"
    TREE = "tree"
    HEDGE = "hedge"
    CLIMBER = "climber"
    GRASS = "grass"
    LAWN = "lawn"
    BULB = "bulb"
    ANNUAL = "annual"
    VEGETABLE = "vegetable"
    HERB = "herb"
    FRUIT = "fruit"
    SUCCULENT = "succulent"
    POTTED = "potted"
    OTHER = "other"


class LocationType(StrEnum):
    """Where the plant grows; affects rain and soil water."""

    BED = "bed"
    RAISED_BED = "raised_bed"
    POT = "pot"
    LAWN = "lawn"
    GREENHOUSE = "greenhouse"
    COVERED = "covered"


class Light(StrEnum):
    """Light requirement or situation."""

    FULL_SUN = "full_sun"
    PARTIAL_SHADE = "partial_shade"
    SHADE = "shade"


class WaterNeed(StrEnum):
    """WUCOLS water use classes."""

    VERY_LOW = "very_low"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class SoilType(StrEnum):
    """Soil texture classes (FAO-56 table on soil water characteristics)."""

    SAND = "sand"
    LOAMY_SAND = "loamy_sand"
    SANDY_LOAM = "sandy_loam"
    LOAM = "loam"
    SILT_LOAM = "silt_loam"
    CLAY_LOAM = "clay_loam"
    CLAY = "clay"
    POTTING_MIX = "potting_mix"


class PlantStatus(StrEnum):
    """Health or life-cycle state."""

    HEALTHY = "healthy"
    WATCH = "watch"
    PROBLEM = "problem"
    DEAD = "dead"
    REMOVED = "removed"


def months_between(start: date, end: date) -> int:
    """Whole months from start to end (negative if end is before start)."""
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return months


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


@dataclass(slots=True, kw_only=True)
class FieldSource:
    """Provenance of one plant field."""

    source: Source
    updated_at: datetime
    confidence: float | None = None
    model: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "source": self.source.value,
            "updated_at": self.updated_at.isoformat(),
            "confidence": self.confidence,
            "model": self.model,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(
            source=Source(data["source"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            confidence=data.get("confidence"),
            model=data.get("model"),
        )


@dataclass(slots=True, kw_only=True)
class AgeReference:
    """'The plant was about <age_months> old on <on>'."""

    age_months: int
    on: date

    def months_at(self, day: date) -> int:
        return max(0, self.age_months + months_between(self.on, day))

    def as_dict(self) -> dict[str, Any]:
        return {"age_months": self.age_months, "on": self.on.isoformat()}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(age_months=int(data["age_months"]), on=date.fromisoformat(data["on"]))


# Fields a user (or later the AI) may set on a plant, with the type used for
# (de)serialisation. "name" is required and handled separately.
TEXT_FIELDS = ("scientific_name", "variety", "family", "notes")
ENUM_FIELDS: dict[str, type[StrEnum]] = {
    "category": PlantCategory,
    "location_type": LocationType,
    "light": Light,
    "water_need": WaterNeed,
    "soil_type": SoilType,
    "status": PlantStatus,
}
NUMBER_FIELDS = ("min_temperature_c", "root_depth_cm", "crown_diameter_m")
EDITABLE_FIELDS = frozenset(
    (
        "name",
        *TEXT_FIELDS,
        *ENUM_FIELDS,
        *NUMBER_FIELDS,
        "planted_on",
        "age",
        "tags",
        "position",
    )
)


@dataclass(slots=True, frozen=True)
class Point:
    """A position on the plan: metres east (x) and south (y) of the origin."""

    x: float
    y: float

    def as_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(x=float(data["x"]), y=float(data["y"]))


@dataclass(slots=True, kw_only=True)
class Plant:
    """A plant (or a planted area such as a lawn or hedge)."""

    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    scientific_name: str | None = None
    variety: str | None = None
    family: str | None = None
    notes: str | None = None
    category: PlantCategory = PlantCategory.OTHER
    location_type: LocationType = LocationType.BED
    light: Light | None = None
    water_need: WaterNeed | None = None
    soil_type: SoilType | None = None
    status: PlantStatus = PlantStatus.HEALTHY
    min_temperature_c: float | None = None
    root_depth_cm: float | None = None
    planted_on: date | None = None
    age: AgeReference | None = None
    tags: list[str] = field(default_factory=list)
    cover_photo_id: str | None = None
    # Garden plan: None = not placed yet. The crown diameter is the size drawn on
    # the plan; without it the panel falls back to the measured width.
    position: Point | None = None
    crown_diameter_m: float | None = None
    sources: dict[str, FieldSource] = field(default_factory=dict)

    def age_months(self, today: date) -> int | None:
        """Current age in months, from the age reference or the planting date."""
        if self.age is not None:
            return self.age.months_at(today)
        if self.planted_on is not None:
            return max(0, months_between(self.planted_on, today))
        return None

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "planted_on": _iso(self.planted_on),
            "age": self.age.as_dict() if self.age else None,
            "tags": list(self.tags),
            "cover_photo_id": self.cover_photo_id,
            "position": self.position.as_dict() if self.position else None,
            "sources": {key: src.as_dict() for key, src in self.sources.items()},
        }
        for key in (*TEXT_FIELDS, *NUMBER_FIELDS):
            data[key] = getattr(self, key)
        for key in ENUM_FIELDS:
            value = getattr(self, key)
            data[key] = value.value if value is not None else None
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        kwargs: dict[str, Any] = {
            "id": data["id"],
            "name": data["name"],
            "created_at": datetime.fromisoformat(data["created_at"]),
            "updated_at": datetime.fromisoformat(data["updated_at"]),
            "planted_on": _date(data.get("planted_on")),
            "age": AgeReference.from_dict(data["age"]) if data.get("age") else None,
            "tags": list(data.get("tags", [])),
            "cover_photo_id": data.get("cover_photo_id"),
            "position": Point.from_dict(data["position"]) if data.get("position") else None,
            "sources": {
                key: FieldSource.from_dict(src) for key, src in data.get("sources", {}).items()
            },
        }
        for key in (*TEXT_FIELDS, *NUMBER_FIELDS):
            kwargs[key] = data.get(key)
        for key, enum in ENUM_FIELDS.items():
            if data.get(key) is not None:
                kwargs[key] = enum(data[key])
        return cls(**kwargs)


class ShapeKind(StrEnum):
    """Elements of the garden layout."""

    BOUNDARY = "boundary"
    HOUSE = "house"
    TERRACE = "terrace"
    PATH = "path"
    BED = "bed"
    RAISED_BED = "raised_bed"
    LAWN = "lawn"
    HEDGE = "hedge"
    POND = "pond"
    GREENHOUSE = "greenhouse"
    ROOF = "roof"
    OTHER = "other"


@dataclass(slots=True, kw_only=True)
class Shape:
    """One element of the layout.

    `geometry` is one of (all in plan metres, see Point):
      {"type": "rect", "cx", "cy", "w", "h", "rotation"}   rotation in degrees, clockwise
      {"type": "circle", "cx", "cy", "r"}
      {"type": "polygon", "points": [[x, y], ...]}
    It is validated by the WebSocket schema and stored as is.
    """

    id: str
    kind: ShapeKind
    geometry: dict[str, Any]
    label: str | None = None
    plant_id: str | None = None
    soil_type: SoilType | None = None
    locked: bool = False
    z: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind.value,
            "geometry": self.geometry,
            "label": self.label,
            "plant_id": self.plant_id,
            "soil_type": self.soil_type.value if self.soil_type else None,
            "locked": self.locked,
            "z": self.z,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(
            id=data["id"],
            kind=ShapeKind(data["kind"]),
            geometry=data["geometry"],
            label=data.get("label"),
            plant_id=data.get("plant_id"),
            soil_type=SoilType(data["soil_type"]) if data.get("soil_type") else None,
            locked=bool(data.get("locked", False)),
            z=int(data.get("z", 0)),
        )


@dataclass(slots=True, frozen=True)
class GeoPoint:
    """Latitude/longitude of the plan origin."""

    latitude: float
    longitude: float

    def as_dict(self) -> dict[str, float]:
        return {"latitude": self.latitude, "longitude": self.longitude}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(latitude=float(data["latitude"]), longitude=float(data["longitude"]))


@dataclass(slots=True, kw_only=True)
class Marker:
    """A Home Assistant entity shown on the plan with its live value."""

    id: str
    entity_id: str
    x: float
    y: float
    label: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "entity_id": self.entity_id,
            "x": self.x,
            "y": self.y,
            "label": self.label,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(
            id=data["id"],
            entity_id=data["entity_id"],
            x=float(data["x"]),
            y=float(data["y"]),
            label=data.get("label"),
        )


@dataclass(slots=True, kw_only=True)
class Layout:
    """The garden plan apart from the plants (which carry their own position).

    `background` is None or one of (validated by the WebSocket schema):
      {"type": "wms", "preset": str | None, "url", "layers", "attribution", "opacity"}
      {"type": "image", "image_id", "width_px", "height_px",
       "x", "y" (top-left corner in plan metres), "width_m", "rotation", "opacity"}
    """

    origin: GeoPoint | None = None
    shapes: dict[str, Shape] = field(default_factory=dict)
    background: dict[str, Any] | None = None
    markers: dict[str, Marker] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "origin": self.origin.as_dict() if self.origin else None,
            "shapes": [shape.as_dict() for shape in self.shapes.values()],
            "background": self.background,
            "markers": [marker.as_dict() for marker in self.markers.values()],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        shapes = [Shape.from_dict(item) for item in data.get("shapes", [])]
        markers = [Marker.from_dict(item) for item in data.get("markers", [])]
        return cls(
            origin=GeoPoint.from_dict(data["origin"]) if data.get("origin") else None,
            shapes={shape.id: shape for shape in shapes},
            background=data.get("background"),
            markers={marker.id: marker for marker in markers},
        )


@dataclass(slots=True, kw_only=True)
class Photo:
    """Metadata of one stored photo. The image files live on disk."""

    id: str
    plant_id: str
    taken_at: datetime
    uploaded_at: datetime
    width: int
    height: int
    size_bytes: int
    tags: list[str] = field(default_factory=list)
    note: str = ""


@dataclass(slots=True, kw_only=True)
class Measurement:
    """Height and/or width of a plant on a given day."""

    id: str
    plant_id: str
    measured_on: date
    height_cm: float | None
    width_cm: float | None
    source: Source = Source.USER
    confidence: float | None = None
    photo_id: str | None = None
    note: str = ""
