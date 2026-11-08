"""Anthropic Claude via the Messages API (plain HTTP).

Verified against Anthropic's API reference (2026-11): API version 2026-10-21
(no temperature/top_p/top_k), images as base64 blocks, JSON via
`output_config.format` (json_schema), prompt caching with `cache_control` on the
static system prompt, usage fields input_tokens (uncached remainder),
cache_creation_input_tokens, cache_read_input_tokens, output_tokens.
"""

from __future__ import annotations

import base64
from collections.abc import Callable
import time
from typing import Any

import aiohttp

from ..base import (
    AIError,
    AIRequest,
    AIResponse,
    ModelInfo,
    ProviderKind,
    Usage,
    parse_json,
)
from ..http import async_request, async_stream

BASE_URL = "https://api.anthropic.com/v1"
API_VERSION = "2026-10-21"
DEFAULT_MODEL = "claude-opus-5-5"


def map_usage(usage: dict[str, Any], images: int) -> Usage:
    """Anthropic reports the uncached remainder as input_tokens (nothing double counted)."""
    return Usage(
        input=int(usage.get("input_tokens") or 0),
        cached_input=int(usage.get("cache_read_input_tokens") or 0),
        cache_write=int(usage.get("cache_creation_input_tokens") or 0),
        output=int(usage.get("output_tokens") or 0),
        images=images,
    )


class AnthropicProvider:
    kind = ProviderKind.ANTHROPIC

    def __init__(self, session: aiohttp.ClientSession, api_key: str, model: str) -> None:
        self._session = session
        self._key = api_key
        self.model = model or DEFAULT_MODEL

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self._key,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
        }

    async def async_validate(self) -> None:
        await self.async_list_models()

    async def async_list_models(self) -> list[ModelInfo]:
        payload, _ = await async_request(
            self._session,
            "GET",
            f"{BASE_URL}/models",
            headers=self._headers(),
            params={"limit": "100"},
            timeout_s=20,
        )
        return [
            ModelInfo(id=item["id"], name=item.get("display_name") or item["id"], vision=True)
            for item in (payload or {}).get("data", [])
        ]

    def body(self, req: AIRequest) -> dict[str, Any]:
        messages = []
        for message in req.messages:
            content: list[dict[str, Any]] = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image.mime_type,
                        "data": base64.b64encode(image.data).decode(),
                    },
                }
                for image in message.images
            ]
            content.append({"type": "text", "text": message.text})
            messages.append({"role": message.role, "content": content})
        body: dict[str, Any] = {
            "model": self.model,
            "max_tokens": req.max_output_tokens,
            # static instructions first and cached, so repeated calls are cheaper
            "system": [
                {"type": "text", "text": req.system, "cache_control": {"type": "ephemeral"}}
            ],
            "messages": messages,
        }
        if req.json_schema is not None:
            body["output_config"] = {"format": {"type": "json_schema", "schema": req.json_schema}}
        return body

    async def async_generate(self, req: AIRequest) -> AIResponse:
        start = time.monotonic()
        payload, headers = await async_request(
            self._session,
            "POST",
            f"{BASE_URL}/messages",
            headers=self._headers(),
            json=self.body(req),
        )
        payload = payload or {}
        images = sum(len(m.images) for m in req.messages)
        usage = map_usage(payload.get("usage") or {}, images)
        text = "".join(
            block.get("text", "")
            for block in payload.get("content", [])
            if block.get("type") == "text"
        )
        if payload.get("stop_reason") == "refusal":
            raise AIError("The model declined this request", usage=usage)
        if payload.get("stop_reason") == "max_tokens":
            raise AIError("The answer was cut off (output limit)", usage=usage)
        return AIResponse(
            text=text,
            data=parse_json(text) if req.json_schema is not None else None,
            usage=usage,
            model=payload.get("model") or self.model,
            latency_ms=int((time.monotonic() - start) * 1000),
            request_id=headers.get("request-id"),
        )

    async def async_stream(self, req: AIRequest, on_delta: Callable[[str], None]) -> AIResponse:
        """Text as it is written (server-sent events); usage from message_start/_delta."""
        start = time.monotonic()
        images = sum(len(m.images) for m in req.messages)
        usage_raw: dict[str, Any] = {}
        parts: list[str] = []
        model = self.model
        request_id = None
        stop = None
        async for event in async_stream(
            self._session,
            f"{BASE_URL}/messages",
            headers=self._headers(),
            json={**self.body(req), "stream": True},
        ):
            kind = event.get("type")
            if kind == "message_start":
                message = event.get("message") or {}
                usage_raw.update(message.get("usage") or {})
                model = message.get("model") or model
                request_id = message.get("id")
            elif kind == "content_block_delta":
                delta = event.get("delta") or {}
                if delta.get("type") == "text_delta" and delta.get("text"):
                    parts.append(delta["text"])
                    on_delta(delta["text"])
            elif kind == "message_delta":
                usage_raw.update({k: v for k, v in (event.get("usage") or {}).items() if v})
                stop = (event.get("delta") or {}).get("stop_reason")
            elif kind == "error":
                message = str((event.get("error") or {}).get("message") or "stream error")
                raise AIError(message[:300], usage=map_usage(usage_raw, images))
        usage = map_usage(usage_raw, images)
        if stop == "refusal":
            raise AIError("The model declined this request", usage=usage)
        return AIResponse(
            text="".join(parts),
            data=None,
            usage=usage,
            model=model,
            latency_ms=int((time.monotonic() - start) * 1000),
            request_id=request_id,
        )
