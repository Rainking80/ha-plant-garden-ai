"""The AI service: providers, budget, usage log, identification (spec 4.3, 4.8, 6).

Every call goes through `async_generate` (or the Pl@ntNet path): budget check
first, then the provider, then one usage row with tokens and cost, also for
failed calls. Nothing calls an AI without a user action.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import date, datetime, timedelta
import logging
import time
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigEntry, ConfigSubentry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now

from ..const import (
    CONF_AI_AUTO_IDENTIFY,
    CONF_AI_BUDGET,
    CONF_AI_BUDGET_STOP,
    CONF_AI_DEBUG,
    CONF_AI_IDENTIFY,
    CONF_AI_RETENTION_DAYS,
    CONF_AI_TEXT,
    CONF_USD_EUR,
    DEFAULT_AI_RETENTION_DAYS,
    DOMAIN,
    SUBENTRY_AI,
)
from ..models import Source
from ..photos import PhotoVariant
from . import pricing
from .base import (
    AIError,
    AIRequest,
    AIResponse,
    AuthError,
    BudgetExceededError,
    Feature,
    Image,
    Message,
    ProviderKind,
    Usage,
)
from .prompts import identify as identify_prompt
from .providers.anthropic import AnthropicProvider
from .providers.gemini import GeminiProvider
from .providers.ha_ai_task import AITaskProvider
from .providers.openai_compat import OpenAICompatibleProvider
from .providers.plantnet import PlantNetProvider
from .schemas import IDENTIFY_SCHEMA, clean_identification

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "plant_garden.ai"
TEXT_FEATURES = frozenset({Feature.TIPS, Feature.CHAT, Feature.DIGEST, Feature.RESEARCH})
BUDGET_WARN = 0.8
MAX_PHOTOS = 3
# care fields an identification can suggest, with where the value lives in the answer
CARE_FIELDS = ("category", "water_need", "light", "min_temperature_c")


def build_provider(hass: HomeAssistant, data: Mapping[str, Any]) -> Any:
    """A provider object for the settings of an AI subentry."""
    session = async_get_clientsession(hass)
    kind = ProviderKind(data["kind"])
    if kind is ProviderKind.HA_AI_TASK:
        return AITaskProvider(hass, data["entity_id"])
    if kind is ProviderKind.ANTHROPIC:
        return AnthropicProvider(session, data["api_key"], data.get("model", ""))
    if kind is ProviderKind.GEMINI:
        return GeminiProvider(session, data["api_key"], data.get("model", ""))
    if kind is ProviderKind.PLANTNET:
        return PlantNetProvider(session, data["api_key"])
    return OpenAICompatibleProvider(
        session,
        base_url=data["base_url"],
        api_key=data.get("api_key") or None,
        model=data.get("model", ""),
        preset=data.get("preset"),
    )


def mask(key: str | None) -> str | None:
    """sk-…abcd: enough to recognise a key, never enough to use it."""
    if not key:
        return None
    return f"{key[:3]}…{key[-4:]}" if len(key) > 10 else "…"


def season_text(latitude: float, today: date, language: str) -> str:
    months_de = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
                 "September", "Oktober", "November", "Dezember"]  # fmt: skip
    north = latitude >= 0
    if language == "de":
        half = "Nordhalbkugel" if north else "Südhalbkugel"
        return f"{months_de[today.month - 1]}, {half}"
    half = "northern hemisphere" if north else "southern hemisphere"
    return f"{today.strftime('%B')}, {half}"


class AIService:
    """Owns the AI providers of the garden and everything that is logged about them."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        manager: Any,  # GardenManager (import cycle)
        pricing_defaults: dict[str, Any],
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._manager = manager
        self._pricing_defaults = pricing_defaults
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORAGE_KEY)
        self._data: dict[str, Any] = {"pricing": {}, "identifications": {}, "status": {}}
        self._unsubs: list[CALLBACK_TYPE] = []
        # for the garden sensors: cost and tokens this month, requests today
        self.stats: dict[str, Any] = {"month_cost": 0.0, "month_tokens": 0, "today_requests": 0}

    async def async_start(self) -> None:
        stored = await self._store.async_load()
        if stored:
            self._data.update(stored)
        self._unsubs.append(
            async_track_time_change(self.hass, self._async_purge, hour=3, minute=17, second=0)
        )
        self._unsubs.append(self._manager.async_subscribe(self._on_garden_change))
        self._manager.photo_hooks.append(self._async_on_photo)
        await self.async_refresh_stats()

    async def async_refresh_stats(self) -> None:
        today = dt_util.now().date()
        month = await self._manager.async_usage_totals(today.replace(day=1))
        day = await self._manager.async_usage_totals(today)
        self.stats = {
            "month_cost": round(float(month.get("cost") or 0) * self._rate(), 4),
            "month_tokens": int(
                month["input"] + month["cached_input"] + month["cache_write"] + month["output"]
            ),
            "today_requests": int(day["requests"]),
        }

    @callback
    def _on_garden_change(self, change: Any) -> None:
        if change.kind == "plant_removed" and change.plant_id:
            self.forget_plant(change.plant_id)

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._async_on_photo in self._manager.photo_hooks:
            self._manager.photo_hooks.remove(self._async_on_photo)

    async def _async_on_photo(self, photo: Any, added: bool) -> None:
        """Option "identify after upload": only plants whose species is still unknown."""
        if not added or not self._entry.options.get(CONF_AI_AUTO_IDENTIFY):
            return
        plant = self._manager.get_plant(photo.plant_id)
        if plant.scientific_name or (
            self.subentry_for(Feature.IDENTIFY) is None and self.plantnet() is None
        ):
            return

        async def identify() -> None:
            try:
                await self.async_identify(plant.id, [(photo.id, "auto")], self.hass.config.language)
            except AIError as err:
                _LOGGER.warning("Identification after upload failed: %s", err)

        self._entry.async_create_background_task(
            self.hass, identify(), f"plant_garden identify {plant.id}"
        )

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self._data, 1)

    @property
    def _session(self) -> aiohttp.ClientSession:
        return async_get_clientsession(self.hass)

    # ------------------------------------------------------------ providers
    def subentries(self) -> list[ConfigSubentry]:
        return [s for s in self._entry.subentries.values() if s.subentry_type == SUBENTRY_AI]

    def build(self, subentry: ConfigSubentry) -> Any:
        """A provider object for a subentry's settings."""
        return build_provider(self.hass, subentry.data)

    def _language_models(self) -> list[ConfigSubentry]:
        return [s for s in self.subentries() if s.data["kind"] != ProviderKind.PLANTNET]

    def subentry_for(self, feature: Feature) -> ConfigSubentry | None:
        """The provider chosen for a feature in the options, else the first one."""
        option = CONF_AI_TEXT if feature in TEXT_FEATURES else CONF_AI_IDENTIFY
        chosen = self._entry.options.get(option)
        models = self._language_models()
        return next((s for s in models if s.subentry_id == chosen), models[0] if models else None)

    def plantnet(self) -> ConfigSubentry | None:
        return next((s for s in self.subentries() if s.data["kind"] == ProviderKind.PLANTNET), None)

    def providers_info(self) -> list[dict[str, Any]]:
        """For the tech page: never the keys themselves (spec 9)."""
        return [
            {
                "id": sub.subentry_id,
                "title": sub.title,
                "kind": sub.data["kind"],
                "model": sub.data.get("model") or sub.data.get("entity_id"),
                "base_url": sub.data.get("base_url"),
                "key": mask(sub.data.get("api_key")),
                "status": self._data["status"].get(sub.subentry_id),
            }
            for sub in self.subentries()
        ]

    def _set_status(
        self,
        subentry_id: str,
        *,
        ok: bool,
        error: str | None,
        auth_failed: bool = False,
        **extra: Any,
    ) -> None:
        """Remember the last check of a provider; a rejected key becomes a repair issue."""
        status = dict(self._data["status"].get(subentry_id) or {})
        status.update(ok=ok, error=error, checked=dt_util.utcnow().isoformat(), **extra)
        self._data["status"][subentry_id] = status
        self._save()
        issue = f"ai_auth_{subentry_id}"
        if auth_failed:
            subentry = self._entry.subentries.get(subentry_id)
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                issue,
                is_fixable=False,
                severity=ir.IssueSeverity.ERROR,
                translation_key="ai_auth",
                translation_placeholders={"provider": subentry.title if subentry else subentry_id},
            )
        elif ok:
            ir.async_delete_issue(self.hass, DOMAIN, issue)

    async def async_test(self, subentry_id: str) -> dict[str, Any]:
        """'Test connection' on the tech page: a cheap call (model list, key check)."""
        subentry = next((s for s in self.subentries() if s.subentry_id == subentry_id), None)
        if subentry is None:
            raise AIError("unknown provider")
        try:
            await self.build(subentry).async_validate()
        except AIError as err:
            self._set_status(
                subentry_id, ok=False, error=str(err), auth_failed=isinstance(err, AuthError)
            )
        else:
            self._set_status(subentry_id, ok=True, error=None)
        status: dict[str, Any] = self._data["status"][subentry_id]
        return status

    # ------------------------------------------------------------ prices and money
    def prices(self) -> dict[str, dict[str, dict[str, float]]]:
        return pricing.merged_prices(self._pricing_defaults, self._data["pricing"])

    def pricing_info(self) -> dict[str, Any]:
        return {
            "as_of": self._pricing_defaults.get("_as_of"),
            "sources": self._pricing_defaults.get("_sources", {}),
            "currency": "USD",
            "prices": self.prices(),
            "overrides": self._data["pricing"],
        }

    async def async_set_price(self, kind: str, model: str, prices: dict[str, float] | None) -> None:
        overrides = self._data["pricing"]
        if prices is None:
            overrides.get(kind, {}).pop(model, None)
        else:
            overrides.setdefault(kind, {})[model] = prices
        self._save()

    def _rate(self) -> float:
        """USD -> display currency (1 when costs are shown in US dollars)."""
        return float(self._entry.options.get(CONF_USD_EUR) or 1)

    def currency(self) -> str:
        return "EUR" if self._entry.options.get(CONF_USD_EUR) else "USD"

    def display_cost(self, usd: float | None) -> float | None:
        """A cost in US dollars in the display currency."""
        return None if usd is None else round(usd * self._rate(), 4)

    def estimate(self, subentry: ConfigSubentry, request: AIRequest) -> float | None:
        """Rough cost of a request in USD before sending it (None: unknown)."""
        text = request.system + "".join(m.text for m in request.messages)
        images = sum(len(m.images) for m in request.messages)
        usage = Usage(
            input=pricing.estimate_tokens(text, images),
            output=request.max_output_tokens // 2,
            images=images,
        )
        model = subentry.data.get("model") or ""
        return pricing.cost_of(
            usage, pricing.price_for(self.prices(), subentry.data["kind"], model)
        )

    def estimate_identify(self, photos: int) -> float | None:
        """Rough cost of identifying a plant with this many photos, display currency."""
        subentry = self.subentry_for(Feature.IDENTIFY)
        total = 0.0
        if subentry is not None:
            request = AIRequest(
                feature=Feature.IDENTIFY,
                system=identify_prompt.SYSTEM["en"],
                messages=[
                    Message(
                        role="user",
                        text="x" * 600,
                        images=[Image(data=b"") for _ in range(photos)],
                    )
                ],
                max_output_tokens=4000,
            )
            estimate = self.estimate(subentry, request)
            if estimate is None:
                return None
            total += estimate
        return round(total * self._rate(), 4)

    async def async_month_cost(self) -> float:
        totals = await self._manager.async_usage_totals(dt_util.now().date().replace(day=1))
        return float(totals.get("cost") or 0)

    async def _async_check_budget(self, estimate: float | None) -> None:
        budget = float(self._entry.options.get(CONF_AI_BUDGET) or 0)
        if budget <= 0:
            return
        spent = await self.async_month_cost() * self._rate()
        planned = (estimate or 0) * self._rate()
        if self._entry.options.get(CONF_AI_BUDGET_STOP) and spent + planned > budget:
            raise BudgetExceededError(
                f"Monthly AI budget used up ({spent:.2f} of {budget:.2f} {self.currency()})"
            )

    def _update_budget_issues(self, spent: float) -> None:
        budget = float(self._entry.options.get(CONF_AI_BUDGET) or 0)
        placeholders = {
            "spent": f"{spent:.2f}",
            "budget": f"{budget:.2f}",
            "currency": self.currency(),
        }
        for issue, threshold in (("budget_warning", BUDGET_WARN), ("budget_exceeded", 1.0)):
            if budget > 0 and spent >= budget * threshold:
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    issue,
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key=issue,
                    translation_placeholders=placeholders,
                )
            else:
                ir.async_delete_issue(self.hass, DOMAIN, issue)

    # ------------------------------------------------------------ calls and logging
    async def _async_log(
        self,
        *,
        feature: Feature,
        subentry: ConfigSubentry,
        model: str,
        plant_id: str | None,
        status: str,
        error: str | None,
        usage: Usage,
        latency_ms: int,
        provider_cost: float | None = None,
        request_id: str | None = None,
        prompt_version: str = "",
        prompt: str | None = None,
        response: str | None = None,
    ) -> float | None:
        """Log one call; returns its cost in USD (None: unknown)."""
        kind = subentry.data["kind"]
        if provider_cost is not None:
            cost: float | None = provider_cost
            cost_source = "provider"
        else:
            cost = pricing.cost_of(
                usage,
                pricing.price_for(self.prices(), kind, model),
                pricing.SEARCH_PRICES.get(kind, 0.0),
            )
            cost_source = "pricing" if cost is not None else "unknown"
        debug = bool(self._entry.options.get(CONF_AI_DEBUG))
        now = dt_util.utcnow()
        await self._manager.async_insert_usage(
            {
                "id": ulid_now(),
                "ts": now.isoformat(),
                "day": dt_util.as_local(now).date().isoformat(),
                "feature": feature.value,
                "provider": kind,
                "provider_title": subentry.title,
                "model": model,
                "plant_id": plant_id,
                "status": status,
                "error": error,
                "input": usage.input,
                "cached_input": usage.cached_input,
                "cache_write": usage.cache_write,
                "output": usage.output,
                "reasoning": usage.reasoning,
                "images": usage.images,
                "cost": cost,
                "cost_source": cost_source,
                "latency_ms": latency_ms,
                "request_id": request_id,
                "prompt_version": prompt_version,
                "prompt": prompt if debug else None,
                "response": response if debug else None,
            }
        )
        await self.async_refresh_stats()
        self._update_budget_issues(self.stats["month_cost"])
        self._manager.notify_ai()
        return cost

    def can_search_web(self, feature: Feature = Feature.RESEARCH) -> bool:
        """Does the provider of a feature search the web itself (Claude, Gemini, OpenRouter)?"""
        subentry = self.subentry_for(feature)
        return subentry is not None and bool(getattr(self.build(subentry), "web_search", False))

    def estimate_research(self) -> float | None:
        """Rough cost of researching one plant, display currency (None: unknown).

        A web research reads the pages it found (about 30,000 tokens) and runs up
        to 5 searches; then a short call puts the notes in order.
        """
        subentry = self.subentry_for(Feature.RESEARCH)
        if subentry is None:
            return None
        kind = subentry.data["kind"]
        price = pricing.price_for(self.prices(), kind, subentry.data.get("model") or "")
        web = self.can_search_web()
        research = pricing.cost_of(
            Usage(input=30000 if web else 6000, output=3000, searches=5 if web else 0),
            price,
            pricing.SEARCH_PRICES.get(kind, 0.0),
        )
        tidy = pricing.cost_of(Usage(input=5000, output=2500), price)
        if research is None or tidy is None:
            return None
        return round(((research if web else 0) + tidy) * self._rate(), 4)

    async def async_generate(
        self,
        feature: Feature,
        request: AIRequest,
        subentry: ConfigSubentry | None = None,
        *,
        on_delta: Callable[[str], None] | None = None,
        web: bool = False,
    ) -> AIResponse:
        """One AI call with budget check, logging and one JSON repair retry.

        With `on_delta`, text answers are streamed where the provider can; other
        providers deliver the whole answer as one delta. With `web`, the provider
        researches the answer with its own web search (see `can_search_web`).
        """
        subentry = subentry or self.subentry_for(feature)
        if subentry is None:
            raise AIError("No AI provider is set up")
        provider = self.build(subentry)
        if web and not getattr(provider, "web_search", False):
            raise AIError("This AI provider cannot search the web")
        await self._async_check_budget(self.estimate(subentry, request))
        prompt_text = request.system + "\n\n" + "\n\n".join(m.text for m in request.messages)
        stream = (
            on_delta is not None
            and request.json_schema is None
            and hasattr(provider, "async_stream")
        )
        for attempt in range(2):
            start = time.monotonic()
            try:
                if web:
                    response: AIResponse = await provider.async_research(request)
                elif stream:
                    response = await provider.async_stream(request, on_delta)
                else:
                    response = await provider.async_generate(request)
                if on_delta is not None and not stream:
                    on_delta(response.text)
            except AIError as err:
                await self._async_log(
                    feature=feature,
                    subentry=subentry,
                    model=provider.model,
                    plant_id=request.plant_id,
                    status="error",
                    error=str(err),
                    usage=err.usage or Usage(),
                    latency_ms=int((time.monotonic() - start) * 1000),
                    prompt_version=request.prompt_version,
                    prompt=prompt_text,
                )
                if isinstance(err, AuthError):
                    self._set_status(
                        subentry.subentry_id, ok=False, error=str(err), auth_failed=True
                    )
                raise
            if not (self._data["status"].get(subentry.subentry_id) or {}).get("ok", True):
                self._set_status(subentry.subentry_id, ok=True, error=None)
            invalid = request.json_schema is not None and response.data is None
            response.cost = await self._async_log(
                feature=feature,
                subentry=subentry,
                model=response.model,
                plant_id=request.plant_id,
                status="invalid_json" if invalid else "ok",
                error="answer was not valid JSON" if invalid else None,
                usage=response.usage,
                latency_ms=response.latency_ms,
                provider_cost=response.provider_cost,
                request_id=response.request_id,
                prompt_version=request.prompt_version,
                prompt=prompt_text,
                response=response.text,
            )
            if not invalid:
                return response
            if attempt == 0:
                request.messages = [
                    *request.messages,
                    Message(role="assistant", text=response.text[:4000]),
                    Message(
                        role="user",
                        text="That was not valid JSON for the schema. Answer again with "
                        "only the JSON object.",
                    ),
                ]
        raise AIError("The AI did not answer with valid JSON")

    # ------------------------------------------------------------ identification
    async def async_images(
        self, photos: list[tuple[str, str]], plant_id: str, variant: PhotoVariant
    ) -> list[Image]:
        images = []
        for photo_id, organ in photos:
            photo = await self._manager.async_get_photo(photo_id)
            if photo.plant_id != plant_id:
                raise AIError("photo of another plant")
            path = self._manager.photo_path(photo, variant)
            data = await self.hass.async_add_executor_job(path.read_bytes)
            mime = "image/jpeg" if variant is PhotoVariant.ORIGINAL else "image/webp"
            images.append(Image(data=data, mime_type=mime, photo_id=photo_id, organ=organ))
        return images

    async def async_identify(
        self, plant_id: str, photos: list[tuple[str, str]], language: str
    ) -> dict[str, Any]:
        """Pl@ntNet candidates (if set up), then the language model as arbiter (spec 4.3)."""
        plant = self._manager.get_plant(plant_id)
        if not 1 <= len(photos) <= MAX_PHOTOS:
            raise AIError(f"1 to {MAX_PHOTOS} photos")
        llm = self.subentry_for(Feature.IDENTIFY)
        net = self.plantnet()
        if llm is None and net is None:
            raise AIError("No AI provider is set up")
        record: dict[str, Any] = {
            "created": dt_util.utcnow().isoformat(),
            "photos": [photo_id for photo_id, _ in photos],
            "plantnet": None,
            "result": None,
            "model": None,
            "provider": None,
            "accepted": [],
            "rejected": [],
        }
        candidates: list[dict[str, Any]] | None = None
        if net is not None:
            await self._async_check_budget(None)
            start = time.monotonic()
            images = await self.async_images(photos, plant_id, PhotoVariant.ORIGINAL)
            try:
                found = await PlantNetProvider(self._session, net.data["api_key"]).async_identify(
                    images, language
                )
            except AIError as err:
                await self._async_log(
                    feature=Feature.IDENTIFY, subentry=net, model="plantnet", plant_id=plant_id,
                    status="error", error=str(err), usage=Usage(images=len(images)),
                    latency_ms=int((time.monotonic() - start) * 1000),
                )  # fmt: skip
                if isinstance(err, AuthError):
                    self._set_status(net.subentry_id, ok=False, error=str(err), auth_failed=True)
                if llm is None:
                    raise
            else:
                candidates = [c.as_dict() for c in found.candidates]
                record["plantnet"] = {"candidates": candidates, "remaining": found.remaining}
                self._set_status(net.subentry_id, ok=True, error=None, remaining=found.remaining)
                await self._async_log(
                    feature=Feature.IDENTIFY, subentry=net, model="plantnet", plant_id=plant_id,
                    status="ok", error=None, usage=found.usage, latency_ms=found.latency_ms,
                )  # fmt: skip
        if llm is not None:
            origin = self._manager.layout.origin
            latitude = origin.latitude if origin else self.hass.config.latitude
            known = {
                key: str(value)
                for key, value in (
                    ("name", plant.name),
                    ("category", plant.category.value),
                    ("location", plant.location_type.value),
                    ("scientific_name", plant.scientific_name),
                    ("variety", plant.variety),
                )
                if value and (plant.sources.get(key) is None or key == "name"
                              or plant.sources[key].source is Source.USER)
            }  # fmt: skip
            request = AIRequest(
                feature=Feature.IDENTIFY,
                system=identify_prompt.SYSTEM["de" if language == "de" else "en"],
                messages=[
                    Message(
                        role="user",
                        text=identify_prompt.user_text(
                            language,
                            organs=[organ for _, organ in photos],
                            known=known,
                            season=season_text(latitude, dt_util.now().date(), language),
                            candidates=candidates,
                        ),
                        images=await self.async_images(photos, plant_id, PhotoVariant.MEDIUM),
                    )
                ],
                json_schema=IDENTIFY_SCHEMA,
                max_output_tokens=4000,
                plant_id=plant_id,
                prompt_version=identify_prompt.VERSION,
            )
            response = await self.async_generate(Feature.IDENTIFY, request, llm)
            record["result"] = clean_identification(response.data or {})
            record["model"] = response.model
            record["provider"] = llm.title
        self._data["identifications"][plant_id] = record
        self._save()
        self._manager.notify_ai(plant_id)
        return self.identification(plant_id) or {}

    @staticmethod
    def _care_suggestions(care: dict[str, Any]) -> dict[str, tuple[Any, float]]:
        """Care profile fields from the "care" part of an identification."""
        confidence = care["confidence"]
        suggestions = {
            key: (care[key], confidence) for key in CARE_FIELDS if care.get(key) is not None
        }
        for key, hint in (
            ("care_water", "watering"),
            ("care_fertilize", "fertilizing"),
            ("care_prune", "pruning"),
        ):
            if care.get(hint):
                suggestions[key] = (care[hint], confidence)
        if care.get("mature_crown_diameter_m"):
            suggestions["crown_diameter_m"] = (care["mature_crown_diameter_m"], confidence)
        return suggestions

    def _suggested(self, record: dict[str, Any]) -> dict[str, tuple[Any, float]]:
        """field -> (value, confidence) from an identification record."""
        result = record.get("result")
        suggestions: dict[str, tuple[Any, float]] = {}
        if result and result["candidates"]:
            top = result["candidates"][0]
            confidence = top["confidence"]
            for key in ("scientific_name", "variety", "family"):
                if top.get(key):
                    suggestions[key] = (top[key], confidence)
        elif record.get("plantnet") and record["plantnet"]["candidates"]:
            top = record["plantnet"]["candidates"][0]
            suggestions["scientific_name"] = (top["scientific_name"], top["score"])
            if top.get("family"):
                suggestions["family"] = (top["family"], top["score"])
        if result:
            suggestions.update(self._care_suggestions(result["care"]))
            size = result["size"]
            if size.get("height_cm") or size.get("width_cm"):
                value = {"height_cm": size.get("height_cm"), "width_cm": size.get("width_cm")}
                suggestions["size"] = (value, size["confidence"])
            age = result["age"]
            if age.get("age_months") is not None:
                suggestions["age"] = (age["age_months"], age["confidence"])
        return suggestions

    def identification(self, plant_id: str) -> dict[str, Any] | None:
        """The last identification of a plant with its suggestions compared to the plant."""
        record = self._data["identifications"].get(plant_id)
        if record is None:
            return None
        plant = self._manager.get_plant(plant_id)
        items = []
        for key, (value, confidence) in self._suggested(record).items():
            source = plant.sources.get(key)
            current = getattr(plant, key, None) if key not in ("size", "age") else None
            if key == "age" and plant.age is not None:
                current = plant.age.age_months
            if key in record["accepted"]:
                state = "accepted"
            elif key in record["rejected"]:
                state = "rejected"
            elif current is not None and str(getattr(current, "value", current)) == str(value):
                state = "same"
            elif source is not None and source.source is Source.USER:
                state = "differs"  # the user's value stays; shown as "AI sees it differently"
            else:
                state = "new"
            items.append(
                {
                    "key": key,
                    "value": value,
                    "confidence": confidence,
                    "current": getattr(current, "value", current),
                    "state": state,
                }
            )
        return {**record, "suggestions": items}

    async def async_decide(self, plant_id: str, key: str, *, accept: bool) -> dict[str, Any]:
        """Take over or dismiss one suggestion. The user's own values are never replaced."""
        record = self._data["identifications"].get(plant_id)
        suggestion = self._suggested(record).get(key) if record else None
        if record is None or suggestion is None:
            raise AIError("no such suggestion")
        value, confidence = suggestion
        model = record.get("model") or "plantnet"
        if accept:
            if key == "size":
                await self._manager.async_add_measurement(
                    plant_id,
                    measured_on=dt_util.now().date(),
                    height_cm=value.get("height_cm"),
                    width_cm=value.get("width_cm"),
                    note=model,
                    source=Source.AI,
                    confidence=confidence,
                )
            else:
                field_value = (
                    {"age_months": int(value), "on": dt_util.now().date()}
                    if key == "age"
                    else value
                )
                applied = await self._manager.async_apply_ai_fields(
                    plant_id, {key: field_value}, confidence=confidence, model=model
                )
                if not applied:
                    raise AIError("this field holds your own value")
            record["accepted"].append(key)
        else:
            record["rejected"].append(key)
        self._save()
        self._manager.notify_ai(plant_id)
        return self.identification(plant_id) or {}

    @callback
    def forget_plant(self, plant_id: str) -> None:
        if self._data["identifications"].pop(plant_id, None) is not None:
            self._save()

    # ------------------------------------------------------------ tech page
    async def async_summary(self) -> dict[str, Any]:
        today = dt_util.now().date()
        month = today.replace(day=1)
        manager = self._manager
        return {
            "currency": self.currency(),
            "rate": self._rate(),
            "budget": float(self._entry.options.get(CONF_AI_BUDGET) or 0),
            "budget_stop": bool(self._entry.options.get(CONF_AI_BUDGET_STOP)),
            "today": await manager.async_usage_totals(today),
            "month": await manager.async_usage_totals(month),
            "total": await manager.async_usage_totals(None),
            "by": {
                column: await manager.async_usage_breakdown(month, column)
                for column in ("provider", "model", "feature", "plant_id")
            },
            "daily": await manager.async_usage_daily_cost(today - timedelta(days=29)),
            "providers": self.providers_info(),
        }

    async def _async_purge(self, now: datetime) -> None:
        days = int(self._entry.options.get(CONF_AI_RETENTION_DAYS) or DEFAULT_AI_RETENTION_DAYS)
        await self._manager.async_purge_usage(dt_util.as_local(now).date() - timedelta(days=days))
