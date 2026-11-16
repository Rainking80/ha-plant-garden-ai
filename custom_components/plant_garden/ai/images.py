"""Image editing by AI providers: a photo and a prompt in, a new picture out.

Verified against the official docs on 2026-11-16:

- OpenAI: `POST /v1/images/edits` with JSON `{model, prompt, images: [{image_url}],
  size, quality, output_format}`; the picture comes back as `data[0].b64_json`,
  the usage as `input_tokens` / `output_tokens` (billed per token).
- Google Gemini: the Interactions API, `POST /v1beta/interactions` with
  `{model, input: [{type: text}, {type: image, mime_type, data}],
  response_format: {type: image, aspect_ratio, image_size}}`; the picture is an
  `image` block in a `model_output` step. Billed per picture (by size).
- OpenRouter: `POST /api/v1/images` with `{model, prompt, input_references:
  [{type: image_url, image_url: {url}}]}`; `data[0].b64_json`, and the cost of
  the call in `usage.cost`.

Other providers (Anthropic, Home Assistant AI tasks, local servers) cannot edit
pictures here.
"""

from __future__ import annotations

import base64
import binascii
from collections.abc import Mapping
from dataclasses import dataclass
import time
from typing import Any

import aiohttp

from .base import AIError, ProviderKind, Usage
from .http import async_request
from .providers.gemini import BASE_URL as GEMINI_URL

GEMINI_REVISION = "2026-05-20"
TIMEOUT_S = 300  # a picture takes a while

# Models used unless the user names another one in the options
DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-image-2",
    "openrouter": "openai/gpt-image-2",
    "gemini": "gemini-nano-banana-2.1",
}
# Rough size of an OpenAI edit before the call: the photo as input, a medium
# landscape picture as output (the real numbers come back with the answer).
OPENAI_ESTIMATE = Usage(input=2500, output=1600)


@dataclass(slots=True)
class ImageResult:
    data: bytes
    mime_type: str
    usage: Usage
    model: str
    latency_ms: int = 0
    provider_cost: float | None = None  # USD, when the provider reports it
    cost: float | None = None  # USD, filled in by the service


def flavour(data: Mapping[str, Any]) -> str | None:
    """Which image API an AI subentry speaks: openai, openrouter, gemini or None."""
    kind = data.get("kind")
    if kind == ProviderKind.GEMINI:
        return "gemini"
    if kind == ProviderKind.OPENAI and data.get("preset") in ("openai", "openrouter"):
        return str(data["preset"])
    return None


def estimate_usage(data: Mapping[str, Any]) -> Usage | None:
    """What a call will roughly use, for the price before it (None: the provider tells after)."""
    kind = flavour(data)
    if kind == "openai":
        return OPENAI_ESTIMATE
    if kind == "gemini":
        return Usage()  # one request, priced per picture
    return None


def _decode(value: Any) -> bytes:
    if not isinstance(value, str) or not value:
        raise AIError("The provider sent no picture")
    if value.startswith("data:"):
        value = value.split(",", 1)[-1]
    try:
        return base64.b64decode(value, validate=False)
    except (binascii.Error, ValueError) as err:
        raise AIError("The provider sent a broken picture") from err


def _data_url(photo: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(photo).decode()


async def _openai(
    session: aiohttp.ClientSession, data: Mapping[str, Any], model: str, prompt: str,
    photo: bytes, *, portrait: bool,
) -> ImageResult:  # fmt: skip
    payload, _ = await async_request(
        session,
        "POST",
        f"{str(data['base_url']).rstrip('/')}/images/edits",
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {data.get('api_key')}",
        },
        json={
            "model": model,
            "prompt": prompt,
            "images": [{"image_url": _data_url(photo)}],
            "size": "1024x1536" if portrait else "1536x1024",
            "quality": "medium",
            "output_format": "jpeg",
            "n": 1,
        },
        timeout_s=TIMEOUT_S,
        retries=0,  # a retry would be billed again
    )
    payload = payload or {}
    usage = payload.get("usage") or {}
    return ImageResult(
        data=_decode(((payload.get("data") or [{}])[0]).get("b64_json")),
        mime_type="image/jpeg",
        usage=Usage(
            input=int(usage.get("input_tokens") or 0),
            output=int(usage.get("output_tokens") or 0),
            images=1,
        ),
        model=model,
    )


async def _openrouter(
    session: aiohttp.ClientSession, data: Mapping[str, Any], model: str, prompt: str,
    photo: bytes, *, portrait: bool,
) -> ImageResult:  # fmt: skip
    payload, _ = await async_request(
        session,
        "POST",
        f"{str(data['base_url']).rstrip('/')}/images",
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {data.get('api_key')}",
            "X-OpenRouter-Title": "Autogarden for Home Assistant",
        },
        json={
            "model": model,
            "prompt": prompt,
            "aspect_ratio": "2:3" if portrait else "3:2",
            "output_format": "jpeg",
            "input_references": [{"type": "image_url", "image_url": {"url": _data_url(photo)}}],
        },
        timeout_s=TIMEOUT_S,
        retries=0,
    )
    payload = payload or {}
    usage = payload.get("usage") or {}
    first = (payload.get("data") or [{}])[0]
    cost = usage.get("cost")
    return ImageResult(
        data=_decode(first.get("b64_json")),
        mime_type=first.get("media_type") or "image/jpeg",
        usage=Usage(
            input=int(usage.get("prompt_tokens") or 0),
            output=int(usage.get("completion_tokens") or 0),
            images=1,
        ),
        model=model,
        provider_cost=float(cost) if isinstance(cost, int | float) else None,
    )


def _gemini_picture(payload: Mapping[str, Any]) -> tuple[bytes, str]:
    """The first image block of the model's output."""
    for step in payload.get("steps") or []:
        if step.get("type") != "model_output":
            continue
        for block in step.get("content") or []:
            if block.get("type") == "image" and block.get("data"):
                return _decode(block["data"]), block.get("mime_type") or "image/png"
    raise AIError("The model answered without a picture")


async def _gemini(
    session: aiohttp.ClientSession, data: Mapping[str, Any], model: str, prompt: str,
    photo: bytes, *, portrait: bool,
) -> ImageResult:  # fmt: skip
    payload, _ = await async_request(
        session,
        "POST",
        f"{GEMINI_URL}/interactions",
        headers={
            "content-type": "application/json",
            "x-goog-api-key": str(data.get("api_key")),
            "Api-Revision": GEMINI_REVISION,
        },
        json={
            "model": model,
            "input": [
                {"type": "text", "text": prompt},
                {
                    "type": "image",
                    "mime_type": "image/jpeg",
                    "data": base64.b64encode(photo).decode(),
                },
            ],
            "response_format": {
                "type": "image",
                "aspect_ratio": "3:4" if portrait else "4:3",
                "image_size": "1K",
            },
        },
        timeout_s=TIMEOUT_S,
        retries=0,
    )
    picture, mime = _gemini_picture(payload or {})
    # priced per picture: the token counts are not needed (and not relied on)
    return ImageResult(data=picture, mime_type=mime, usage=Usage(images=1), model=model)


async def async_edit(
    session: aiohttp.ClientSession,
    data: Mapping[str, Any],
    model: str,
    prompt: str,
    photo: bytes,
    *,
    portrait: bool,
) -> ImageResult:
    """Let the provider of an AI subentry edit a JPEG photo after a prompt."""
    kind = flavour(data)
    start = time.monotonic()
    if kind == "openai":
        result = await _openai(session, data, model, prompt, photo, portrait=portrait)
    elif kind == "openrouter":
        result = await _openrouter(session, data, model, prompt, photo, portrait=portrait)
    elif kind == "gemini":
        result = await _gemini(session, data, model, prompt, photo, portrait=portrait)
    else:
        raise AIError("This AI provider cannot create pictures")
    result.latency_ms = int((time.monotonic() - start) * 1000)
    return result
