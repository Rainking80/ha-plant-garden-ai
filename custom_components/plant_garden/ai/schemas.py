"""JSON schemas for structured AI answers (spec 6.4).

Written for strict structured output on every provider: all properties
required (null where unknown), `additionalProperties: false`, no numeric or
length constraints (Anthropic and OpenAI reject them). Answers are validated
again here, tolerantly.
"""

from __future__ import annotations

from typing import Any

from ..models import Light, PlantCategory, WaterNeed


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def _nullable(kind: str) -> dict[str, Any]:
    return {"type": [kind, "null"]}


def _choice(values: list[str]) -> dict[str, Any]:
    return {"type": ["string", "null"], "enum": [*values, None]}


IDENTIFY_SCHEMA: dict[str, Any] = _object(
    {
        "candidates": {
            "type": "array",
            "description": "Most likely species first, at most 3.",
            "items": _object(
                {
                    "scientific_name": {"type": "string"},
                    "common_name_de": _nullable("string"),
                    "common_name_en": _nullable("string"),
                    "variety": _nullable("string"),
                    "family": _nullable("string"),
                    "confidence": {"type": "number", "description": "0 to 1"},
                    "reason": {"type": "string"},
                }
            ),
        },
        "size": _object(
            {
                "height_cm": _nullable("number"),
                "height_min_cm": _nullable("number"),
                "height_max_cm": _nullable("number"),
                "width_cm": _nullable("number"),
                "width_min_cm": _nullable("number"),
                "width_max_cm": _nullable("number"),
                "confidence": {"type": "number"},
                "basis": _nullable("string"),
            }
        ),
        "age": _object(
            {
                "age_months": _nullable("integer"),
                "min_months": _nullable("integer"),
                "max_months": _nullable("integer"),
                "stage": _nullable("string"),
                "confidence": {"type": "number"},
            }
        ),
        "health": _object(
            {
                "status": {"type": "string", "enum": ["healthy", "watch", "problem", "unknown"]},
                "summary": {"type": "string"},
            }
        ),
        "care": _object(
            {
                "category": _choice([c.value for c in PlantCategory]),
                "water_need": _choice([w.value for w in WaterNeed]),
                "light": _choice([light.value for light in Light]),
                "min_temperature_c": _nullable("number"),
                "mature_crown_diameter_m": _nullable("number"),
                "pruning": _nullable("string"),
                "confidence": {"type": "number"},
            }
        ),
        "questions": {
            "type": "array",
            "description": "What the user could photograph or tell to make this surer.",
            "items": {"type": "string"},
        },
    }
)


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def _text(value: Any, limit: int = 500) -> str | None:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _confidence(value: Any) -> float:
    number = _number(value)
    return min(max(number, 0.0), 1.0) if number is not None else 0.0


def clean_identification(data: dict[str, Any]) -> dict[str, Any]:
    """The answer with every value checked; anything malformed becomes null."""
    candidates = []
    for item in data.get("candidates") or []:
        if not isinstance(item, dict) or not _text(item.get("scientific_name"), 200):
            continue
        candidates.append(
            {
                "scientific_name": _text(item["scientific_name"], 200),
                "common_name_de": _text(item.get("common_name_de"), 200),
                "common_name_en": _text(item.get("common_name_en"), 200),
                "variety": _text(item.get("variety"), 200),
                "family": _text(item.get("family"), 100),
                "confidence": _confidence(item.get("confidence")),
                "reason": _text(item.get("reason"), 1000) or "",
            }
        )
    size = _dict(data.get("size"))
    age = _dict(data.get("age"))
    health = _dict(data.get("health"))
    care = _dict(data.get("care"))

    def choice(value: Any, allowed: list[str]) -> str | None:
        return value if value in allowed else None

    def months(value: Any) -> int | None:
        number = _number(value)
        return int(number) if number is not None and 0 <= number <= 12000 else None

    return {
        "candidates": candidates[:3],
        "size": {
            key: _number(size.get(key))
            for key in (
                "height_cm",
                "height_min_cm",
                "height_max_cm",
                "width_cm",
                "width_min_cm",
                "width_max_cm",
            )
        }
        | {"confidence": _confidence(size.get("confidence")), "basis": _text(size.get("basis"))},
        "age": {
            "age_months": months(age.get("age_months")),
            "min_months": months(age.get("min_months")),
            "max_months": months(age.get("max_months")),
            "stage": _text(age.get("stage"), 100),
            "confidence": _confidence(age.get("confidence")),
        },
        "health": {
            "status": choice(health.get("status"), ["healthy", "watch", "problem"]) or "unknown",
            "summary": _text(health.get("summary"), 1000) or "",
        },
        "care": {
            "category": choice(care.get("category"), [c.value for c in PlantCategory]),
            "water_need": choice(care.get("water_need"), [w.value for w in WaterNeed]),
            "light": choice(care.get("light"), [light.value for light in Light]),
            "min_temperature_c": _number(care.get("min_temperature_c")),
            "mature_crown_diameter_m": _number(care.get("mature_crown_diameter_m")),
            "pruning": _text(care.get("pruning")),
            "confidence": _confidence(care.get("confidence")),
        },
        "questions": [q for q in (_text(q, 300) for q in data.get("questions") or []) if q][:5],
    }
