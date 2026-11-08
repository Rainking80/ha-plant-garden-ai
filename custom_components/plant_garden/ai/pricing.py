"""Prices per model and the cost of a call (spec 4.8).

Defaults come from pricing_defaults.json (researched from the official pricing
pages, with a date); the user can override every price on the tech page. A cost
the provider reports itself (OpenRouter) wins. A model without a price has an
unknown cost, never 0.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .base import Usage

DEFAULTS_FILE = Path(__file__).parent / "pricing_defaults.json"


def load_defaults() -> dict[str, Any]:
    """Read pricing_defaults.json (blocking: call it in the executor)."""
    data: dict[str, Any] = json.loads(DEFAULTS_FILE.read_text(encoding="utf-8"))
    return data


def merged_prices(
    defaults: dict[str, Any], overrides: dict[str, dict[str, dict[str, float]]]
) -> dict[str, dict[str, dict[str, float]]]:
    """provider kind -> model -> prices; user overrides replace single models."""
    result: dict[str, dict[str, dict[str, float]]] = {
        kind: {model: dict(prices) for model, prices in models.items()}
        for kind, models in defaults.get("models", {}).items()
    }
    for kind, models in overrides.items():
        for model, prices in models.items():
            result.setdefault(kind, {})[model] = dict(prices)
    return result


def price_for(
    prices: dict[str, dict[str, dict[str, float]]], kind: str, model: str
) -> dict[str, float] | None:
    """Prices of a model; dated or tagged ids match their base id (longest prefix)."""
    table = prices.get(kind, {})
    if model in table:
        return table[model]
    matches = [key for key in table if model.startswith((f"{key}-", f"{key}:"))]
    return table[max(matches, key=len)] if matches else None


def cost_of(usage: Usage, price: dict[str, float] | None) -> float | None:
    """USD for one call, or None if the model has no price."""
    if price is None:
        return None
    per_million = (
        usage.input * price.get("input", 0)
        + usage.cached_input * price.get("cached_input", price.get("input", 0))
        + usage.cache_write * price.get("cache_write", price.get("input", 0))
        + usage.output * price.get("output", 0)
    )
    return round(
        per_million / 1_000_000
        + usage.images * price.get("per_image", 0)
        + usage.requests * price.get("per_request", 0),
        6,
    )


def estimate_tokens(text: str, images: int) -> int:
    """Rough input size before a call: 4 characters per token, ~1600 tokens per image."""
    return len(text) // 4 + images * 1600
