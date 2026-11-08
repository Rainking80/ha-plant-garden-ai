"""Google Gemini via generateContent (v1beta, plain HTTP).

Verified against the official v1beta discovery document (revision 20261108):
`x-goog-api-key`, images as inline_data, JSON via
`generationConfig.responseFormat.text` (mimeType + JSON schema). Usage:
`promptTokenCount` includes cached content, thoughts are counted separately
from `candidatesTokenCount` and billed as output.
"""

from __future__ import annotations

import base64
from collections.abc import Callable
import time
from typing import Any

import aiohttp

from ..base import AIError, AIRequest, AIResponse, ModelInfo, ProviderKind, Usage, parse_json
from ..http import async_request, async_stream

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.8-flash"


def map_usage(usage: dict[str, Any], images: int) -> Usage:
    prompt = int(usage.get("promptTokenCount") or 0)
    cached = int(usage.get("cachedContentTokenCount") or 0)
    thoughts = int(usage.get("thoughtsTokenCount") or 0)
    return Usage(
        input=max(prompt - cached, 0),
        cached_input=cached,
        output=int(usage.get("candidatesTokenCount") or 0) + thoughts,
        reasoning=thoughts,
        images=images,
    )


class GeminiProvider:
    kind = ProviderKind.GEMINI

    def __init__(self, session: aiohttp.ClientSession, api_key: str, model: str) -> None:
        self._session = session
        self._key = api_key
        self.model = model or DEFAULT_MODEL

    def _headers(self) -> dict[str, str]:
        return {"x-goog-api-key": self._key, "content-type": "application/json"}

    async def async_validate(self) -> None:
        await self.async_list_models()

    async def async_list_models(self) -> list[ModelInfo]:
        payload, _ = await async_request(
            self._session,
            "GET",
            f"{BASE_URL}/models",
            headers=self._headers(),
            params={"pageSize": "200"},
            timeout_s=20,
        )
        return [
            ModelInfo(
                id=item["name"].removeprefix("models/"),
                name=item.get("displayName") or item["name"],
            )
            for item in (payload or {}).get("models", [])
            if "generateContent" in (item.get("supportedGenerationMethods") or [])
        ]

    def body(self, req: AIRequest) -> dict[str, Any]:
        contents = []
        for message in req.messages:
            parts: list[dict[str, Any]] = [
                {
                    "inline_data": {
                        "mime_type": image.mime_type,
                        "data": base64.b64encode(image.data).decode(),
                    }
                }
                for image in message.images
            ]
            parts.append({"text": message.text})
            contents.append(
                {"role": "model" if message.role == "assistant" else "user", "parts": parts}
            )
        config: dict[str, Any] = {"maxOutputTokens": req.max_output_tokens}
        if req.json_schema is not None:
            config["responseFormat"] = {
                "text": {"mimeType": "APPLICATION_JSON", "schema": req.json_schema}
            }
        return {
            "systemInstruction": {"parts": [{"text": req.system}]},
            "contents": contents,
            "generationConfig": config,
        }

    async def async_generate(self, req: AIRequest) -> AIResponse:
        start = time.monotonic()
        payload, _ = await async_request(
            self._session,
            "POST",
            f"{BASE_URL}/models/{self.model}:generateContent",
            headers=self._headers(),
            json=self.body(req),
        )
        payload = payload or {}
        usage = map_usage(
            payload.get("usageMetadata") or {}, sum(len(m.images) for m in req.messages)
        )
        candidate = (payload.get("candidates") or [{}])[0]
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        reason = candidate.get("finishReason")
        if reason == "MAX_TOKENS":
            raise AIError("The answer was cut off (output limit)", usage=usage)
        if reason in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST") or not candidate:
            raise AIError("The model declined this request", usage=usage)
        return AIResponse(
            text=text,
            data=parse_json(text) if req.json_schema is not None else None,
            usage=usage,
            model=payload.get("modelVersion") or self.model,
            latency_ms=int((time.monotonic() - start) * 1000),
            request_id=payload.get("responseId"),
        )

    async def async_stream(self, req: AIRequest, on_delta: Callable[[str], None]) -> AIResponse:
        """`streamGenerateContent?alt=sse`: every event is a partial response."""
        start = time.monotonic()
        images = sum(len(m.images) for m in req.messages)
        parts: list[str] = []
        usage_raw: dict[str, Any] = {}
        model = self.model
        request_id = None
        reason = None
        async for chunk in async_stream(
            self._session,
            f"{BASE_URL}/models/{self.model}:streamGenerateContent",
            headers=self._headers(),
            params={"alt": "sse"},
            json=self.body(req),
        ):
            usage_raw = chunk.get("usageMetadata") or usage_raw
            model = chunk.get("modelVersion") or model
            request_id = chunk.get("responseId") or request_id
            for candidate in chunk.get("candidates") or []:
                for part in (candidate.get("content") or {}).get("parts") or []:
                    if part.get("text") and not part.get("thought"):
                        parts.append(part["text"])
                        on_delta(part["text"])
                reason = candidate.get("finishReason") or reason
        usage = map_usage(usage_raw, images)
        if reason in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"):
            raise AIError("The model declined this request", usage=usage)
        return AIResponse(
            text="".join(parts),
            data=None,
            usage=usage,
            model=model,
            latency_ms=int((time.monotonic() - start) * 1000),
            request_id=request_id,
        )
