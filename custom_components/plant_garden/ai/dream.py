"""Dream garden: a photo of the garden, a conversation about what to change, a
planting concept that fits the site, and - if the user wants it - a picture.

Three steps, each started by the user:
1. look: the AI describes the photo and asks back (photo provider, vision).
2. concept: wishes, style and site data become steps and a plant list (text).
3. picture: the photo is edited after the concept (image provider). The panel
   shows the estimated cost before this step; it is by far the dearest one.

Designs are kept in a Store, their photo and pictures as JPEG files under
<config>/plant_garden/dreams/<id>/. Nothing here changes the garden until the
user takes plants of a concept over.
"""

from __future__ import annotations

from datetime import date, timedelta
import io
import logging
from pathlib import Path
import shutil
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid_now
from PIL import Image as PILImage

from .. import sun
from ..care import CareManager
from ..const import DOMAIN
from ..garden import GardenManager, NotFoundError
from ..models import PlantStatus, ShapeKind
from ..photos import process_dream, valid_id
from . import planner
from .base import AIError, AIRequest, Feature, Image, Message
from .prompts import assistant as assistant_prompts, dream as prompts
from .schemas import (
    DREAM_CONCEPT_SCHEMA,
    DREAM_LOOK_SCHEMA,
    DREAM_STRENGTHS,
    DREAM_STYLES,
    clean_dream_concept,
    clean_dream_look,
)
from .service import AIService

_LOGGER = logging.getLogger(__name__)

STORE_KEY = f"{DOMAIN}.dreams"
STORE_VERSION = 1
PHOTO = "photo"
MAX_PICTURES = 12  # per design
MAX_DESIGNS = 60
TEXT_LIMIT = 600
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December")  # fmt: skip


def climate_facts(weather: list[Any], latitude: float, today: date) -> dict[str, Any]:
    """What the stored weather of the last year says about the climate (no place names)."""
    lows = [day.t_min for day in weather if day.t_min is not None]
    highs = [day.t_max for day in weather if day.t_max is not None]
    rain = [day.precip_mm for day in weather if day.precip_mm is not None]
    facts: dict[str, Any] = {
        "hemisphere": "north" if latitude >= 0 else "south",
        "month": today.month,
        "coldest_night_last_year_c": min(lows) if lows else None,
        "hottest_day_last_year_c": max(highs) if highs else None,
    }
    if len(rain) >= 300:  # only a (nearly) full year is a yearly sum
        facts["rain_last_year_mm"] = round(sum(rain))
    return {key: value for key, value in facts.items() if value is not None}


def _to_jpeg(data: bytes) -> tuple[bytes, int, int]:
    """A provider's picture as a plain JPEG (blocking)."""
    with PILImage.open(io.BytesIO(data)) as picture:
        rgb = picture.convert("RGB")
        buffer = io.BytesIO()
        rgb.save(buffer, format="JPEG", quality=90)
        return buffer.getvalue(), rgb.width, rgb.height


class DreamGarden:
    """Keeps the designs and runs their three steps."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        *,
        manager: GardenManager,
        care: CareManager,
        ai: AIService,
        root: Path,
    ) -> None:
        self.hass = hass
        self._entry = entry
        self._manager = manager
        self._care = care
        self._ai = ai
        self._root = root
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._designs: dict[str, dict[str, Any]] = {}

    async def async_setup(self) -> None:
        data = await self._store.async_load() or {}
        self._designs = data.get("designs", {})

    def _save(self) -> None:
        self._store.async_delay_save(lambda: {"designs": self._designs}, 1)

    async def async_shutdown(self) -> None:
        """Write what is pending (a reload must not lose a fresh design)."""
        await self._store.async_save({"designs": self._designs})

    def _language(self) -> str:
        return assistant_prompts.lang(self.hass.config.language)

    # ------------------------------------------------------------ designs and files
    def designs(self) -> list[dict[str, Any]]:
        """Newest first."""
        return sorted(self._designs.values(), key=lambda d: d["created"], reverse=True)

    def get(self, design_id: str) -> dict[str, Any]:
        try:
            return self._designs[design_id]
        except KeyError:
            raise NotFoundError(design_id) from None

    def file_path(self, design_id: str, name: str) -> Path:
        """Path of a design's photo ("photo") or of one of its pictures (its id)."""
        design = self.get(design_id)
        if name != PHOTO and name not in {picture["id"] for picture in design["pictures"]}:
            raise NotFoundError(name)
        if not valid_id(design_id) or (name != PHOTO and not valid_id(name)):
            raise NotFoundError(name)
        return self._root / design_id / f"{name}.jpg"

    async def _async_write(self, design_id: str, name: str, content: bytes) -> None:
        def write() -> None:
            folder = self._root / design_id
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f"{name}.jpg").write_bytes(content)

        await self.hass.async_add_executor_job(write)

    async def async_create(
        self, data: bytes, *, x: float | None = None, y: float | None = None
    ) -> dict[str, Any]:
        """A new design from a garden photo (and, optionally, where on the plan it is)."""
        if len(self._designs) >= MAX_DESIGNS:
            raise ValueError(f"at most {MAX_DESIGNS} designs; delete one first")
        photo, width, height = await self.hass.async_add_executor_job(process_dream, data)
        design: dict[str, Any] = {
            "id": ulid_now(),
            "created": dt_util.utcnow().isoformat(),
            "width": width,
            "height": height,
            "place": {"x": x, "y": y} if x is not None and y is not None else None,
            "look": None,
            "brief": None,
            "concept": None,
            "pictures": [],
            "planted": [],
        }
        await self._async_write(design["id"], PHOTO, photo)
        self._designs[design["id"]] = design
        self._save()
        return design

    async def async_delete(self, design_id: str) -> None:
        self.get(design_id)
        del self._designs[design_id]
        await self.hass.async_add_executor_job(
            lambda: shutil.rmtree(self._root / design_id, ignore_errors=True)
        )
        self._save()

    async def _async_read(self, design_id: str, name: str) -> bytes:
        path = self.file_path(design_id, name)
        return await self.hass.async_add_executor_job(path.read_bytes)

    # ------------------------------------------------------------ step 1: look
    async def async_look(self, design_id: str) -> dict[str, Any]:
        """The AI describes the photo and asks what should change."""
        design = self.get(design_id)
        language = self._language()
        photo = await self._async_read(design_id, PHOTO)
        request = AIRequest(
            feature=Feature.DREAM,
            system=prompts.ANALYSIS_SYSTEM[language],
            messages=[
                Message(
                    role="user",
                    text=prompts.look_text(language, DREAM_STYLES),
                    images=[Image(data=photo)],
                )
            ],
            json_schema=DREAM_LOOK_SCHEMA,
            max_output_tokens=2000,
            prompt_version=prompts.ANALYSIS_VERSION,
        )
        response = await self._ai.async_generate(Feature.DREAM, request)
        design["look"] = {**clean_dream_look(response.data or {}), "model": response.model}
        self._save()
        return design

    # ------------------------------------------------------------ step 2: concept
    async def _async_site(self, design: dict[str, Any]) -> dict[str, Any]:
        """Climate, soil and - with a place on the plan - sun, room and neighbours."""
        manager = self._manager
        origin = manager.layout.origin
        latitude = origin.latitude if origin else self.hass.config.latitude
        today = dt_util.now().date()
        weather = await manager.async_stored_weather(today - timedelta(days=365))
        site = climate_facts(weather, latitude, today)
        shapes, plants = manager.shapes(), manager.plants
        place = design.get("place")
        if place:
            heights = await manager.async_latest_heights()
            widths = await manager.async_latest_widths()
            blockers = sun.obstacles(shapes, plants, heights, widths)
            lows = [day.t_min for day in weather if day.t_min is not None]
            site.update(
                await self.hass.async_add_executor_job(
                    lambda: planner.site_facts(
                        place["x"],
                        place["y"],
                        plants=plants,
                        shapes=shapes,
                        blockers=blockers,
                        widths_cm=widths,
                        heights_cm=heights,
                        latitude=latitude,
                        winter_low=min(lows) if lows else None,
                        today=today,
                    )
                )
            )
        else:
            soils = [
                s.soil_type.value for s in shapes if s.soil_type and s.kind is not ShapeKind.ZONE
            ]
            if soils:
                site["soil_of_the_beds"] = max(set(soils), key=soils.count)
            site["garden_plants"] = sorted(
                {p.scientific_name or p.name for p in plants if p.status is not PlantStatus.REMOVED}
            )[: planner.MAX_GARDEN_PLANTS]
            site["irrigation_available"] = any(s.kind is ShapeKind.ZONE for s in shapes)
        return site

    async def async_concept(self, design_id: str, brief: dict[str, Any]) -> dict[str, Any]:
        """Wishes, style and site data become steps and a plant list."""
        design = self.get(design_id)
        language = self._language()
        clean_brief = {
            "wish": str(brief.get("wish") or "").strip()[:TEXT_LIMIT],
            "style": brief.get("style") if brief.get("style") in DREAM_STYLES else None,
            "strength": brief.get("strength")
            if brief.get("strength") in DREAM_STRENGTHS
            else "medium",
            "keep": [str(k).strip()[:80] for k in brief.get("keep") or [] if str(k).strip()][:12],
            "answers": [
                {
                    "question": str(a.get("question") or "")[:300],
                    "answer": str(a.get("answer") or "")[:300],
                }
                for a in brief.get("answers") or []
                if str(a.get("answer") or "").strip()
            ][:6],
        }
        site = await self._async_site(design)
        photo = await self._async_read(design_id, PHOTO)
        request = AIRequest(
            feature=Feature.DREAM,
            system=prompts.CONCEPT_SYSTEM[language],
            messages=[
                Message(
                    role="user",
                    text=prompts.concept_text(language, site, clean_brief),
                    images=[Image(data=photo)],
                )
            ],
            json_schema=DREAM_CONCEPT_SCHEMA,
            max_output_tokens=5000,
            prompt_version=prompts.CONCEPT_VERSION,
        )
        response = await self._ai.async_generate(Feature.DREAM, request)
        concept = clean_dream_concept(response.data or {})
        concept["plants"] = [{"id": ulid_now(), **plant} for plant in concept["plants"]]
        design["brief"] = clean_brief
        design["concept"] = {**concept, "model": response.model, "site": site}
        self._save()
        return design

    # ------------------------------------------------------------ step 3: picture
    async def async_picture(
        self,
        design_id: str,
        *,
        plant_ids: list[str] | None = None,
        instruction: str | None = None,
        base: str | None = None,
    ) -> dict[str, Any]:
        """Create a picture of the concept (costs money: the panel asks first).

        `plant_ids`: the plants of the concept to show (default: all). `base`: a
        picture to refine with `instruction`; without it the photo is edited.
        """
        design = self.get(design_id)
        concept = design.get("concept")
        if not concept:
            raise ValueError("the design has no concept yet")
        if len(design["pictures"]) >= MAX_PICTURES:
            raise ValueError(f"at most {MAX_PICTURES} pictures per design")
        chosen = [
            plant for plant in concept["plants"] if plant_ids is None or plant["id"] in plant_ids
        ]
        instruction = (instruction or "").strip()[:TEXT_LIMIT] or None
        brief = design.get("brief") or {}
        prompt = prompts.picture_prompt(
            description=concept["image_prompt"] or concept["summary"],
            plants=chosen,
            keep=brief.get("keep") or [],
            strength=brief.get("strength") or "medium",
            month_name=MONTHS[dt_util.now().month - 1],
            instruction=instruction,
        )
        source = await self._async_read(design_id, base or PHOTO)
        result = await self._ai.async_edit_image(
            Feature.DREAM_IMAGE, prompt, source, portrait=design["height"] > design["width"]
        )
        try:
            content, _w, _h = await self.hass.async_add_executor_job(_to_jpeg, result.data)
        except OSError as err:
            raise AIError("The provider sent a picture that cannot be read") from err
        picture: dict[str, Any] = {
            "id": ulid_now(),
            "created": dt_util.utcnow().isoformat(),
            "model": result.model,
            "cost": self._ai.display_cost(result.cost),
            "instruction": instruction,
            "base": base,
            "plants": [plant["id"] for plant in chosen],
        }
        await self._async_write(design_id, picture["id"], content)
        design["pictures"].append(picture)
        self._save()
        return design

    async def async_delete_picture(self, design_id: str, picture_id: str) -> dict[str, Any]:
        design = self.get(design_id)
        path = self.file_path(design_id, picture_id)
        design["pictures"] = [p for p in design["pictures"] if p["id"] != picture_id]
        await self.hass.async_add_executor_job(lambda: path.unlink(missing_ok=True))
        self._save()
        return design

    # ------------------------------------------------------------ taking plants over
    async def async_plant(self, design_id: str, plant_ids: list[str]) -> dict[str, Any]:
        """Take plants of the concept over: planned plants (not placed yet) with a task each."""
        design = self.get(design_id)
        concept = design.get("concept") or {}
        language = self._language()
        planned = "geplant" if language == "de" else "planned"
        today = dt_util.now().date()
        created = []
        for chosen in concept.get("plants", []):
            if chosen["id"] not in plant_ids or chosen["id"] in design["planted"]:
                continue
            plant = await self._manager.async_create_plant(
                {"name": chosen["name"], "tags": [planned]}
            )
            fields = {
                key: chosen[key]
                for key in (
                    "scientific_name",
                    "category",
                    "light",
                    "water_need",
                    "min_temperature_c",
                )
                if chosen[key] is not None
            }
            if chosen["width_cm"]:
                fields["crown_diameter_m"] = round(min(max(chosen["width_cm"] / 100, 0.05), 100), 2)
            await self._manager.async_apply_ai_fields(
                plant.id, fields, confidence=None, model=concept.get("model") or ""
            )
            count = f"{chosen['quantity']} x " if chosen["quantity"] > 1 else ""
            title = f"{count}{chosen['name']} " + ("pflanzen" if language == "de" else "to plant")
            await self._care.async_create_task(
                {
                    "kind": "other",
                    "title": title,
                    "plant_id": plant.id,
                    "due": planner.planting_day(chosen["planting_months"], today),
                },
                source="ai",
            )
            design["planted"].append(chosen["id"])
            created.append(plant.id)
        self._save()
        return {"design": design, "plants": created}
