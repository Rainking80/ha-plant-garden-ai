"""HTTP helper for AI providers: JSON POST/GET with retries, never logs keys (spec 6.3)."""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import aiohttp

from .base import AIError, AuthError

_LOGGER = logging.getLogger(__name__)

RETRIES = 2  # 3 attempts in total
MAX_WAIT = 30.0  # seconds


def _wait(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        try:
            return min(float(retry_after), MAX_WAIT)
        except ValueError:
            pass
    return float(min(2**attempt + random.uniform(0, 0.5), MAX_WAIT))  # noqa: S311 - jitter


def _message(payload: Any, status: int) -> str:
    """Error text from a provider answer, without echoing request data."""
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return str(error["message"])[:300]
        if isinstance(error, str):
            return error[:300]
        if isinstance(payload.get("message"), str):
            return str(payload["message"])[:300]
    return f"HTTP {status}"


async def async_request(
    session: aiohttp.ClientSession,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json: Any = None,
    data: Any = None,
    params: dict[str, str] | None = None,
    timeout_s: float = 120,
    retries: int = RETRIES,
) -> tuple[Any, dict[str, str]]:
    """Send a request; retry 429 and 5xx with backoff (Retry-After respected).

    Returns the decoded JSON and the response headers. 401/403 raise AuthError,
    other 4xx raise AIError at once. Errors never contain headers or URLs with keys.
    """
    for attempt in range(retries + 1):
        try:
            async with session.request(
                method,
                url,
                headers=headers,
                json=json,
                data=data,
                params=params,
                timeout=aiohttp.ClientTimeout(total=timeout_s),
            ) as resp:
                try:
                    payload = await resp.json(content_type=None)
                except aiohttp.ContentTypeError, ValueError:
                    payload = None
                if resp.status < 400:
                    return payload, dict(resp.headers)
                text = _message(payload, resp.status)
                if resp.status in (401, 403):
                    raise AuthError(text, status=resp.status)
                retryable = resp.status == 429 or resp.status >= 500
                if not retryable or attempt == retries:
                    raise AIError(text, status=resp.status, retryable=retryable)
                wait = _wait(attempt, resp.headers.get("Retry-After"))
        except (aiohttp.ClientError, TimeoutError) as err:
            if attempt == retries:
                raise AIError(f"not reachable: {type(err).__name__}", retryable=True) from None
            wait = _wait(attempt, None)
        _LOGGER.debug("AI request failed, retrying in %.1f s", wait)
        await asyncio.sleep(wait)
    raise AIError("no answer")  # pragma: no cover - the loop always returns or raises
