"""A Wikipedia article about a plant, for AI providers without web search (D-038).

Plain MediaWiki API calls: search for the botanical (else the common) name, then
the article as plain text. Free and without a key; only the plant's name is
sent. Wikimedia asks every client to identify itself in the User-Agent.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any
from urllib.parse import quote

import aiohttp

from .base import AIError
from .http import async_request

_LOGGER = logging.getLogger(__name__)

API = "https://{language}.wikipedia.org/w/api.php"
USER_AGENT = (
    "PlantGarden/0.1 (Home Assistant integration; https://github.com/Rainking80/ha-plant-garden-ai)"
)
MAX_CHARS = 12000


@dataclass(slots=True, frozen=True)
class Article:
    title: str
    url: str
    text: str


async def _query(
    session: aiohttp.ClientSession, language: str, params: dict[str, str]
) -> dict[str, Any]:
    payload, _ = await async_request(
        session,
        "GET",
        API.format(language=language),
        headers={"user-agent": USER_AGENT},
        params={"format": "json", "formatversion": "2", **params},
        timeout_s=20,
        retries=1,
    )
    return payload if isinstance(payload, dict) else {}


async def async_article(
    session: aiohttp.ClientSession, names: list[str], languages: list[str]
) -> Article | None:
    """The first article found for one of the names, in the first language that has one."""
    for language in dict.fromkeys(languages):
        for name in dict.fromkeys(n for n in names if n):
            try:
                found = await _query(
                    session,
                    language,
                    {"action": "query", "list": "search", "srsearch": name, "srlimit": "1"},
                )
                hits = (found.get("query") or {}).get("search") or []
                if not hits:
                    continue
                title = str(hits[0]["title"])
                page = await _query(
                    session,
                    language,
                    {
                        "action": "query",
                        "prop": "extracts",
                        "explaintext": "1",
                        "redirects": "1",
                        "titles": title,
                    },
                )
            except (AIError, KeyError) as err:
                _LOGGER.debug("Wikipedia (%s) for %s: %s", language, name, err)
                continue
            pages = (page.get("query") or {}).get("pages") or []
            text = str((pages[0] if pages else {}).get("extract") or "").strip()
            if text:
                return Article(
                    title=title,
                    url=f"https://{language}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
                    text=text[:MAX_CHARS],
                )
    return None
