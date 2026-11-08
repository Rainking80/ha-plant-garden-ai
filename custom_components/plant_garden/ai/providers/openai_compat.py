"""OpenAI-compatible Chat Completions: OpenAI, OpenRouter, Ollama, LM Studio, others.

Verified against the official docs (2026-11-08): images as base64 data URIs,
`response_format` json_schema (strict), `max_completion_tokens` (OpenAI; local
servers take `max_tokens`), no `temperature` (rejected with reasoning). Usage:
`prompt_tokens` includes cached reads and cache writes, `completion_tokens`
includes reasoning. OpenRouter reports the cost of each call in `usage.cost`.
"""

from __future__ import annotations

import base64
import time
from typing import Any

import aiohttp

from ..base import AIError, AIRequest, AIResponse, ModelInfo, ProviderKind, Usage, parse_json
from ..http import async_request

PRESETS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "ollama": "http://localhost:11434/v1",
    "lmstudio": "http://localhost:1234/v1",
}
# only OpenAI documents max_completion_tokens; local servers know max_tokens
COMPLETION_TOKENS_PRESETS = frozenset({"openai", "openrouter"})


def map_usage(usage: dict[str, Any], images: int) -> Usage:
    """Split OpenAI's totals so nothing is counted twice."""
    prompt = int(usage.get("prompt_tokens") or 0)
    details = usage.get("prompt_tokens_details") or {}
    cached = int(details.get("cached_tokens") or 0)
    written = int(details.get("cache_write_tokens") or 0)
    output = usage.get("completion_tokens_details") or {}
    return Usage(
        input=max(prompt - cached - written, 0),
        cached_input=cached,
        cache_write=written,
        output=int(usage.get("completion_tokens") or 0),
        reasoning=int(output.get("reasoning_tokens") or 0),
        images=images,
    )


class OpenAICompatibleProvider:
    kind = ProviderKind.OPENAI

    def __init__(
        self,
        session: aiohttp.ClientSession,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        preset: str | None = None,
    ) -> None:
        self._session = session
        self._base = base_url.rstrip("/")
        self._key = api_key
        self.model = model
        self.preset = preset

    def _headers(self) -> dict[str, str]:
        headers = {"content-type": "application/json"}
        if self._key:
            headers["authorization"] = f"Bearer {self._key}"
        if self.preset == "openrouter":
            headers["X-OpenRouter-Title"] = "Plant Garden for Home Assistant"
        return headers

    async def async_validate(self) -> None:
        await self.async_list_models()

    async def async_list_models(self) -> list[ModelInfo]:
        payload, _ = await async_request(
            self._session, "GET", f"{self._base}/models", headers=self._headers(), timeout_s=20
        )
        models = []
        for item in (payload or {}).get("data", []):
            modalities = (item.get("architecture") or {}).get("input_modalities")
            vision = "image" in modalities if isinstance(modalities, list) else None
            models.append(
                ModelInfo(id=item["id"], name=item.get("name") or item["id"], vision=vision)
            )
        return models

    def body(self, req: AIRequest) -> dict[str, Any]:
        messages: list[dict[str, Any]] = [{"role": "system", "content": req.system}]
        for message in req.messages:
            if not message.images:
                messages.append({"role": message.role, "content": message.text})
                continue
            parts: list[dict[str, Any]] = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{image.mime_type};base64,"
                        + base64.b64encode(image.data).decode(),
                        "detail": "auto",
                    },
                }
                for image in message.images
            ]
            parts.append({"type": "text", "text": message.text})
            messages.append({"role": message.role, "content": parts})
        limit = (
            "max_completion_tokens" if self.preset in COMPLETION_TOKENS_PRESETS else "max_tokens"
        )
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            limit: req.max_output_tokens,
        }
        if req.json_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": f"plant_garden_{req.feature.value}",
                    "schema": req.json_schema,
                    "strict": True,
                },
            }
        return body

    async def async_generate(self, req: AIRequest) -> AIResponse:
        start = time.monotonic()
        payload, headers = await async_request(
            self._session,
            "POST",
            f"{self._base}/chat/completions",
            headers=self._headers(),
            json=self.body(req),
        )
        payload = payload or {}
        raw_usage = payload.get("usage") or {}
        usage = map_usage(raw_usage, sum(len(m.images) for m in req.messages))
        choice = (payload.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        text = message.get("content") or ""
        if message.get("refusal"):
            raise AIError("The model declined this request", usage=usage)
        if choice.get("finish_reason") == "length":
            raise AIError("The answer was cut off (output limit)", usage=usage)
        cost = raw_usage.get("cost")
        return AIResponse(
            text=text,
            data=parse_json(text) if req.json_schema is not None else None,
            usage=usage,
            model=payload.get("model") or self.model,
            latency_ms=int((time.monotonic() - start) * 1000),
            provider_cost=float(cost) if isinstance(cost, int | float) else None,
            request_id=payload.get("id") or headers.get("x-request-id"),
        )
