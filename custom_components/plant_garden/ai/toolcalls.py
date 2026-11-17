"""Tool calling: one turn of a model that may ask for tools (plain HTTP).

The agent keeps the conversation in a neutral form and every provider gets it in
its own:

    {"role": "user", "text": ...}
    {"role": "assistant", "text": ..., "calls": [ToolCall, ...], "raw": ...}
    {"role": "tool", "results": [{"id", "name", "content", "error"}, ...]}

`raw` is the provider's own assistant message of this conversation. It is sent
back unchanged where it exists, because providers attach things to it that must
return with the tool results (Claude's thinking blocks, Gemini's thought
signatures). Messages from an earlier conversation have only their text.

Formats as documented by the providers: Anthropic Messages (`tools` with
`input_schema`, `tool_use` / `tool_result` blocks), OpenAI Chat Completions
(`tools` of type function, `tool_calls`, messages of role `tool`; also
OpenRouter, Ollama and LM Studio), Gemini generateContent
(`functionDeclarations`, `functionCall` / `functionResponse` parts). Tool
schemas stay within what all three accept: an object with plain properties,
enums and `required`.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
import json
import time
from typing import Any

import aiohttp

from .base import AIError, ProviderKind, Usage
from .http import async_request
from .providers import anthropic, gemini, openai_compat

TIMEOUT_S = 180


@dataclass(slots=True, frozen=True)
class ToolSpec:
    """A tool the model may call."""

    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema of an object


@dataclass(slots=True, frozen=True)
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass(slots=True)
class Turn:
    """What the model said and which tools it wants called."""

    text: str
    calls: list[ToolCall]
    usage: Usage
    model: str
    raw: Any = None  # the provider's assistant message, to send back as it is
    latency_ms: int = 0
    provider_cost: float | None = None
    request_id: str | None = None
    cut_off: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


def can_call_tools(data: Mapping[str, Any]) -> bool:
    """Language models reached over their own API (not Home Assistant AI tasks, not Pl@ntNet)."""
    return data.get("kind") in (ProviderKind.ANTHROPIC, ProviderKind.OPENAI, ProviderKind.GEMINI)


def _args(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


# ---------------------------------------------------------------- Anthropic
def anthropic_messages(messages: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for message in messages:
        role = message["role"]
        if role == "tool":
            result.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": item["id"],
                            "content": item["content"],
                            "is_error": bool(item.get("error")),
                        }
                        for item in message["results"]
                    ],
                }
            )
        elif role == "assistant" and message.get("raw"):
            result.append({"role": "assistant", "content": message["raw"]})
        else:
            result.append(
                {"role": role, "content": [{"type": "text", "text": message.get("text") or "…"}]}
            )
    return result


async def _anthropic(
    session: aiohttp.ClientSession, data: Mapping[str, Any], model: str, request: dict[str, Any]
) -> Turn:
    payload, headers = await async_request(
        session,
        "POST",
        f"{anthropic.BASE_URL}/messages",
        headers={
            "x-api-key": str(data["api_key"]),
            "anthropic-version": anthropic.API_VERSION,
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": request["max_tokens"],
            # the instructions and the tools are the same every turn: cached
            "system": [
                {"type": "text", "text": request["system"], "cache_control": {"type": "ephemeral"}}
            ],
            "messages": anthropic_messages(request["messages"]),
            "tools": [
                {"name": t.name, "description": t.description, "input_schema": t.parameters}
                for t in request["tools"]
            ],
        },
        timeout_s=TIMEOUT_S,
    )
    payload = payload or {}
    content = payload.get("content") or []
    usage = anthropic.map_usage(payload.get("usage") or {}, 0)
    if payload.get("stop_reason") == "refusal":
        raise AIError("The model declined this request", usage=usage)
    return Turn(
        text="".join(b.get("text", "") for b in content if b.get("type") == "text"),
        calls=[
            ToolCall(id=str(b.get("id")), name=str(b.get("name")), args=_args(b.get("input")))
            for b in content
            if b.get("type") == "tool_use"
        ],
        usage=usage,
        model=payload.get("model") or model,
        raw=content,
        request_id=headers.get("request-id"),
        cut_off=payload.get("stop_reason") == "max_tokens",
    )


# ---------------------------------------------------------------- OpenAI-compatible
def openai_messages(system: str, messages: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for message in messages:
        role = message["role"]
        if role == "tool":
            result.extend(
                {"role": "tool", "tool_call_id": item["id"], "content": item["content"]}
                for item in message["results"]
            )
        elif role == "assistant" and message.get("calls"):
            result.append(
                {
                    "role": "assistant",
                    "content": message.get("text") or None,
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": json.dumps(call.args, ensure_ascii=False),
                            },
                        }
                        for call in message["calls"]
                    ],
                }
            )
        else:
            result.append({"role": role, "content": message.get("text") or "…"})
    return result


async def _openai(
    session: aiohttp.ClientSession, data: Mapping[str, Any], model: str, request: dict[str, Any]
) -> Turn:
    preset = data.get("preset")
    limit = (
        "max_completion_tokens"
        if preset in openai_compat.COMPLETION_TOKENS_PRESETS
        else "max_tokens"
    )
    headers = {"content-type": "application/json"}
    if data.get("api_key"):
        headers["authorization"] = f"Bearer {data['api_key']}"
    if preset == "openrouter":
        headers["X-OpenRouter-Title"] = "Autogarden for Home Assistant"
    payload, answer_headers = await async_request(
        session,
        "POST",
        f"{str(data['base_url']).rstrip('/')}/chat/completions",
        headers=headers,
        json={
            "model": model,
            "messages": openai_messages(request["system"], request["messages"]),
            limit: request["max_tokens"],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in request["tools"]
            ],
        },
        timeout_s=TIMEOUT_S,
    )
    payload = payload or {}
    raw_usage = payload.get("usage") or {}
    usage = openai_compat.map_usage(raw_usage, 0)
    choice = (payload.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    if message.get("refusal"):
        raise AIError("The model declined this request", usage=usage)
    cost = raw_usage.get("cost")
    return Turn(
        text=message.get("content") or "",
        calls=[
            ToolCall(
                id=str(call.get("id")),
                name=str((call.get("function") or {}).get("name")),
                args=_args((call.get("function") or {}).get("arguments")),
            )
            for call in message.get("tool_calls") or []
        ],
        usage=usage,
        model=payload.get("model") or model,
        provider_cost=float(cost) if isinstance(cost, int | float) else None,
        request_id=payload.get("id") or answer_headers.get("x-request-id"),
        cut_off=choice.get("finish_reason") == "length",
    )


# ---------------------------------------------------------------- Gemini
def gemini_contents(messages: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for message in messages:
        role = message["role"]
        if role == "tool":
            parts = []
            for item in message["results"]:
                response: dict[str, Any] = {
                    "name": item["name"],
                    "response": {"error" if item.get("error") else "result": item["content"]},
                }
                if item.get("call_id"):  # only when the model numbered its call
                    response["id"] = item["call_id"]
                parts.append({"functionResponse": response})
            result.append({"role": "user", "parts": parts})
        elif role == "assistant" and message.get("raw"):
            result.append(message["raw"])
        else:
            result.append(
                {
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": message.get("text") or "…"}],
                }
            )
    return result


async def _gemini(
    session: aiohttp.ClientSession, data: Mapping[str, Any], model: str, request: dict[str, Any]
) -> Turn:
    payload, _ = await async_request(
        session,
        "POST",
        f"{gemini.BASE_URL}/models/{model}:generateContent",
        headers={"x-goog-api-key": str(data["api_key"]), "content-type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": request["system"]}]},
            "contents": gemini_contents(request["messages"]),
            "generationConfig": {"maxOutputTokens": request["max_tokens"]},
            "tools": [
                {
                    "functionDeclarations": [
                        {"name": t.name, "description": t.description, "parameters": t.parameters}
                        for t in request["tools"]
                    ]
                }
            ],
        },
        timeout_s=TIMEOUT_S,
    )
    payload = payload or {}
    usage = gemini.map_usage(payload.get("usageMetadata") or {}, 0)
    candidate = (payload.get("candidates") or [{}])[0]
    reason = candidate.get("finishReason")
    if reason in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST") or not candidate:
        raise AIError("The model declined this request", usage=usage)
    content = candidate.get("content") or {"role": "model", "parts": []}
    parts = content.get("parts") or []
    calls = []
    native_ids: dict[str, str] = {}
    for index, part in enumerate(parts):
        call = part.get("functionCall")
        if not call:
            continue
        # Gemini numbers calls only sometimes: give each one an id of our own
        call_id = f"call_{index}"
        if call.get("id"):
            native_ids[call_id] = str(call["id"])
        calls.append(ToolCall(id=call_id, name=str(call.get("name")), args=_args(call.get("args"))))
    return Turn(
        text="".join(p.get("text", "") for p in parts if p.get("text") and not p.get("thought")),
        calls=calls,
        usage=usage,
        model=payload.get("modelVersion") or model,
        raw={"role": "model", "parts": parts},
        request_id=payload.get("responseId"),
        cut_off=reason == "MAX_TOKENS",
        extra={"native_ids": native_ids},
    )


async def async_turn(
    session: aiohttp.ClientSession,
    data: Mapping[str, Any],
    *,
    system: str,
    messages: Sequence[Mapping[str, Any]],
    tools: Sequence[ToolSpec],
    max_tokens: int = 4000,
) -> Turn:
    """One turn of the provider of an AI subentry: text and/or tool calls."""
    kind = data.get("kind")
    model = str(data.get("model") or "")
    request = {"system": system, "messages": messages, "tools": tools, "max_tokens": max_tokens}
    start = time.monotonic()
    if kind == ProviderKind.ANTHROPIC:
        turn = await _anthropic(session, data, model or anthropic.DEFAULT_MODEL, request)
    elif kind == ProviderKind.GEMINI:
        turn = await _gemini(session, data, model or gemini.DEFAULT_MODEL, request)
    elif kind == ProviderKind.OPENAI:
        turn = await _openai(session, data, model, request)
    else:
        raise AIError("This AI provider cannot use tools")
    turn.latency_ms = int((time.monotonic() - start) * 1000)
    return turn
