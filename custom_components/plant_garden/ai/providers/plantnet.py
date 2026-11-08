"""Pl@ntNet species identification (my-api.plantnet.org, the user's own key).

Verified against the official API spec v2.2.2 (2026-11-08): multipart `images`
(JPEG/PNG, at most 5, one plant) with matching `organs` (leaf, flower, fruit,
bark or auto); the answer lists species with a score and reports
`remainingIdentificationRequests`. /v2/languages checks a key without using an
identification. Free plan: 500 identifications per day (also failed ones).
"""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any

import aiohttp

from ..base import AIError, Image, Usage
from ..http import async_request

BASE_URL = "https://my-api.plantnet.org/v2"
ORGANS = ("leaf", "flower", "fruit", "bark", "auto")
MAX_IMAGES = 5
RESULTS = 5


@dataclass(slots=True, frozen=True)
class Candidate:
    scientific_name: str
    authorship: str
    family: str | None
    genus: str | None
    common_names: tuple[str, ...]
    score: float  # 0..1

    def as_dict(self) -> dict[str, Any]:
        return {
            "scientific_name": self.scientific_name,
            "authorship": self.authorship,
            "family": self.family,
            "genus": self.genus,
            "common_names": list(self.common_names),
            "score": self.score,
        }


@dataclass(slots=True)
class PlantNetResult:
    candidates: list[Candidate]
    remaining: int | None
    usage: Usage
    latency_ms: int


def parse(payload: dict[str, Any]) -> list[Candidate]:
    candidates = []
    for result in payload.get("results") or []:
        species = result.get("species") or {}
        name = species.get("scientificNameWithoutAuthor")
        if not name:
            continue
        candidates.append(
            Candidate(
                scientific_name=name,
                authorship=species.get("scientificNameAuthorship") or "",
                family=(species.get("family") or {}).get("scientificNameWithoutAuthor"),
                genus=(species.get("genus") or {}).get("scientificNameWithoutAuthor"),
                common_names=tuple(species.get("commonNames") or ()),
                score=round(float(result.get("score") or 0), 4),
            )
        )
    return candidates


class PlantNetProvider:
    model = "plantnet"

    def __init__(self, session: aiohttp.ClientSession, api_key: str) -> None:
        self._session = session
        self._key = api_key

    async def async_validate(self) -> None:
        await async_request(
            self._session,
            "GET",
            f"{BASE_URL}/languages",
            params={"api-key": self._key},
            timeout_s=20,
        )

    async def async_identify(self, images: list[Image], language: str) -> PlantNetResult:
        """Species candidates for 1 to 5 photos of one plant (JPEG or PNG)."""
        if not images:
            raise AIError("No photo to identify")
        form = aiohttp.FormData()
        for index, image in enumerate(images[:MAX_IMAGES]):
            if image.mime_type not in ("image/jpeg", "image/png"):
                raise AIError("Pl@ntNet needs JPEG or PNG photos")
            form.add_field(
                "images", image.data, filename=f"photo{index}.jpg", content_type=image.mime_type
            )
        for image in images[:MAX_IMAGES]:
            form.add_field("organs", image.organ if image.organ in ORGANS else "auto")
        start = time.monotonic()
        try:
            payload, _ = await async_request(
                self._session,
                "POST",
                f"{BASE_URL}/identify/all",
                params={
                    "api-key": self._key,
                    "lang": language if language in ("de", "en") else "en",
                    "nb-results": str(RESULTS),
                },
                data=form,
                timeout_s=60,
                retries=0,  # every request costs a credit, failed ones too
            )
        except AIError as err:
            if err.status == 404:  # no plant recognised: an answer, not a failure
                payload = {"results": []}
            else:
                raise
        payload = payload or {}
        return PlantNetResult(
            candidates=parse(payload),
            remaining=payload.get("remainingIdentificationRequests"),
            usage=Usage(images=len(images[:MAX_IMAGES])),
            latency_ms=int((time.monotonic() - start) * 1000),
        )
