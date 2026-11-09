"""JSON schemas for structured AI answers (spec 6.4).

Written for strict structured output on every provider: all properties
required, `additionalProperties: false`, no numeric or length constraints
(Anthropic and OpenAI reject them). Unknown values are an empty string or 0;
only where 0 is a real value (a frost limit, an age, a number of days) a field
may be null, as `anyOf` with null - Claude allows at most 16 such union fields
per schema (and rejects `enum` inside a type array). Answers are validated
again here, tolerantly; "" and 0 become None.
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
    """A value that may be null - a union, keep them few (Claude: at most 16)."""
    return {"anyOf": [{"type": kind}, {"type": "null"}]}


def _text_or_empty() -> dict[str, Any]:
    return {"type": "string", "description": "Empty string if unknown."}


def _positive() -> dict[str, Any]:
    return {"type": "number", "description": "0 if unknown."}


def _choice(values: list[str]) -> dict[str, Any]:
    return {"type": "string", "enum": [*values, ""], "description": "Empty string if unknown."}


def union_count(schema: Any) -> int:
    """Fields using anyOf or type arrays (Claude's limit is 16 per schema)."""
    if isinstance(schema, list):
        return sum(union_count(item) for item in schema)
    if not isinstance(schema, dict):
        return 0
    own = 1 if "anyOf" in schema or isinstance(schema.get("type"), list) else 0
    return own + sum(union_count(value) for value in schema.values())


IDENTIFY_SCHEMA: dict[str, Any] = _object(
    {
        "candidates": {
            "type": "array",
            "description": "Most likely species first, at most 3.",
            "items": _object(
                {
                    "scientific_name": {"type": "string"},
                    "common_name_de": _text_or_empty(),
                    "common_name_en": _text_or_empty(),
                    "variety": _text_or_empty(),
                    "family": _text_or_empty(),
                    "confidence": {"type": "number", "description": "0 to 1"},
                    "reason": {"type": "string"},
                }
            ),
        },
        "size": _object(
            {
                "height_cm": _positive(),
                "height_min_cm": _positive(),
                "height_max_cm": _positive(),
                "width_cm": _positive(),
                "width_min_cm": _positive(),
                "width_max_cm": _positive(),
                "confidence": {"type": "number"},
                "basis": _text_or_empty(),
            }
        ),
        "age": _object(
            {
                "age_months": _nullable("integer"),
                "min_months": _nullable("integer"),
                "max_months": _nullable("integer"),
                "stage": _text_or_empty(),
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
                "mature_crown_diameter_m": _positive(),
                "watering": _text_or_empty(),
                "fertilizing": _text_or_empty(),
                "pruning": _text_or_empty(),
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


def _positive_number(value: Any) -> float | None:
    number = _number(value)
    return number if number is not None and number > 0 else None


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
            key: _positive_number(size.get(key))
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
            "mature_crown_diameter_m": _positive_number(care.get("mature_crown_diameter_m")),
            "watering": _text(care.get("watering")),
            "fertilizing": _text(care.get("fertilizing")),
            "pruning": _text(care.get("pruning")),
            "confidence": _confidence(care.get("confidence")),
        },
        "questions": [q for q in (_text(q, 300) for q in data.get("questions") or []) if q][:5],
    }


# ---------------------------------------------------------------- assistant (spec 4.7)
CAUSE_TYPES = [
    "pest",
    "disease",
    "nutrient",
    "water",
    "light",
    "temperature",
    "mechanical",
    "other",
]
URGENCIES = ["now", "soon", "later"]
TASK_KINDS = ["water", "fertilize", "prune", "repot", "pest_check", "harvest", "photo", "other"]
QUESTION_FIELDS = [
    "soil_type",
    "light",
    "water_need",
    "location_type",
    "category",
    "planted_on",
    "age",
    "root_depth_cm",
    "min_temperature_c",
    "scientific_name",
    "variety",
]

DIAGNOSE_SCHEMA: dict[str, Any] = _object(
    {
        "summary": {"type": "string", "description": "One or two sentences."},
        "health": {"type": "string", "enum": ["healthy", "watch", "problem"]},
        "symptoms": {"type": "array", "items": {"type": "string"}},
        "causes": {
            "type": "array",
            "description": "Most likely first, at most 4.",
            "items": _object(
                {
                    "name": {"type": "string"},
                    "type": {"type": "string", "enum": CAUSE_TYPES},
                    "confidence": {"type": "number", "description": "0 to 1"},
                    "evidence": {"type": "string"},
                }
            ),
        },
        "actions": {
            "type": "array",
            "items": _object(
                {
                    "text": {"type": "string"},
                    "urgency": {"type": "string", "enum": URGENCIES},
                    "warning": _text_or_empty(),
                }
            ),
        },
        "monitoring": {"type": "array", "items": {"type": "string"}},
        "missing_info": {"type": "array", "items": {"type": "string"}},
        "follow_up_days": _nullable("integer"),
    }
)

TIPS_SCHEMA: dict[str, Any] = _object(
    {
        "tips": {
            "type": "array",
            "items": _object(
                {
                    "title": {"type": "string"},
                    "text": {"type": "string"},
                    "plant": _text_or_empty(),
                    "task": {
                        "anyOf": [
                            _object(
                                {
                                    "kind": {"type": "string", "enum": TASK_KINDS},
                                    "title": {"type": "string"},
                                    "due_in_days": _nullable("integer"),
                                    "repeat_every": _nullable("integer"),
                                    "repeat_unit": _choice(["days", "weeks"]),
                                }
                            ),
                            {"type": "null"},
                        ]
                    },
                }
            ),
        },
        "questions": {
            "type": "array",
            "items": _object(
                {
                    "plant": _text_or_empty(),
                    "field": _choice(QUESTION_FIELDS),
                    "question": {"type": "string"},
                }
            ),
        },
    }
)


def _texts(value: Any, limit: int, count: int) -> list[str]:
    items = value if isinstance(value, list) else []
    return [t for t in (_text(item, limit) for item in items) if t][:count]


def clean_diagnosis(data: dict[str, Any]) -> dict[str, Any]:
    """A diagnosis with every value checked (spec 4.7)."""
    causes: list[dict[str, Any]] = []
    for item in data.get("causes") or []:
        if not isinstance(item, dict) or not _text(item.get("name"), 200):
            continue
        causes.append(
            {
                "name": _text(item["name"], 200),
                "type": item.get("type") if item.get("type") in CAUSE_TYPES else "other",
                "confidence": _confidence(item.get("confidence")),
                "evidence": _text(item.get("evidence"), 1000) or "",
            }
        )
    actions = []
    for item in data.get("actions") or []:
        if not isinstance(item, dict) or not _text(item.get("text"), 1000):
            continue
        actions.append(
            {
                "text": _text(item["text"], 1000),
                "urgency": item.get("urgency") if item.get("urgency") in URGENCIES else "soon",
                "warning": _text(item.get("warning"), 500),
            }
        )
    days = _number(data.get("follow_up_days"))
    health = data.get("health")
    return {
        "summary": _text(data.get("summary"), 1000) or "",
        "health": health if health in ("healthy", "watch", "problem") else "watch",
        "symptoms": _texts(data.get("symptoms"), 300, 10),
        "causes": sorted(causes, key=lambda c: -c["confidence"])[:4],
        "actions": actions[:8],
        "monitoring": _texts(data.get("monitoring"), 300, 6),
        "missing_info": _texts(data.get("missing_info"), 300, 5),
        "follow_up_days": int(days) if days is not None and 1 <= days <= 60 else None,
    }


def clean_tips(data: dict[str, Any], refs: dict[str, str]) -> dict[str, Any]:
    """Tips and questions; plant references ("p3") become plant ids or null."""
    tips = []
    for item in data.get("tips") or []:
        if not isinstance(item, dict) or not _text(item.get("text"), 2000):
            continue
        task = _dict(item.get("task"))
        clean_task = None
        if task and _text(task.get("title"), 200):
            due = _number(task.get("due_in_days"))
            every = _number(task.get("repeat_every"))
            unit = task.get("repeat_unit")
            clean_task = {
                "kind": task.get("kind") if task.get("kind") in TASK_KINDS else "other",
                "title": _text(task["title"], 200),
                "due_in_days": int(due) if due is not None and 0 <= due <= 365 else None,
                "repeat": {"every": int(every), "unit": unit}
                if every is not None and 1 <= every <= 365 and unit in ("days", "weeks")
                else None,
            }
        tips.append(
            {
                "title": _text(item.get("title"), 200) or "",
                "text": _text(item["text"], 2000),
                "plant_id": refs.get(str(item.get("plant") or "")),
                "task": clean_task,
            }
        )
    questions = []
    for item in data.get("questions") or []:
        if not isinstance(item, dict) or not _text(item.get("question"), 500):
            continue
        questions.append(
            {
                "plant_id": refs.get(str(item.get("plant") or "")),
                "field": item.get("field") if item.get("field") in QUESTION_FIELDS else None,
                "question": _text(item["question"], 500),
            }
        )
    return {"tips": tips[:6], "questions": questions[:3]}
