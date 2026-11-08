"""Types shared by all AI providers (spec 6.3)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


class Feature(StrEnum):
    """What a request is for; every call is logged and priced per feature."""

    IDENTIFY = "identify"
    ESTIMATE = "estimate"
    DIAGNOSE = "diagnose"
    TIPS = "tips"
    CHAT = "chat"
    DIGEST = "digest"


class ProviderKind(StrEnum):
    HA_AI_TASK = "ha_ai_task"
    OPENAI = "openai_compatible"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    PLANTNET = "plantnet"


class AIError(Exception):
    """A provider call failed. `status` is the HTTP status if there was one."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        retryable: bool = False,
        usage: Usage | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.retryable = retryable
        self.usage = usage  # tokens were spent even though the call failed


class AuthError(AIError):
    """The key was rejected (401/403): the user has to enter a new one."""


class BudgetExceededError(AIError):
    """The monthly budget is used up and the hard stop is on."""


@dataclass(slots=True, frozen=True)
class Image:
    """A JPEG prepared for AI use (downsized, no EXIF), plus where it came from."""

    data: bytes
    mime_type: str = "image/jpeg"
    photo_id: str | None = None
    organ: str | None = None  # leaf, flower, fruit, bark, habit (identification)


@dataclass(slots=True)
class Message:
    role: str  # "user" or "assistant"
    text: str
    images: list[Image] = field(default_factory=list)


@dataclass(slots=True)
class AIRequest:
    feature: Feature
    system: str
    messages: list[Message]
    json_schema: dict[str, Any] | None = None
    max_output_tokens: int = 4000
    plant_id: str | None = None
    prompt_version: str = ""


@dataclass(slots=True)
class Usage:
    """Token counts, normalised: `input` excludes cached reads and cache writes,
    `output` includes reasoning (`reasoning` is the part of it spent thinking)."""

    input: int = 0
    cached_input: int = 0
    cache_write: int = 0
    output: int = 0
    reasoning: int = 0
    images: int = 0
    requests: int = 1


@dataclass(slots=True)
class AIResponse:
    text: str
    data: dict[str, Any] | None
    usage: Usage
    model: str
    latency_ms: int = 0
    provider_cost: float | None = None  # USD, when the provider reports it (OpenRouter)
    request_id: str | None = None


@dataclass(slots=True, frozen=True)
class ModelInfo:
    id: str
    name: str
    vision: bool | None = None  # None: unknown


class AIProvider(Protocol):
    kind: ProviderKind
    model: str

    async def async_validate(self) -> None: ...
    async def async_list_models(self) -> list[ModelInfo]: ...
    async def async_generate(self, req: AIRequest) -> AIResponse: ...


def parse_json(text: str) -> dict[str, Any] | None:
    """The JSON object in a model's answer (tolerates code fences and prose around it)."""
    import json  # noqa: PLC0415 - small helper, keeps the module import light

    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(text[start : end + 1])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None
