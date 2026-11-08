"""Home Assistant's own AI Task (`ai_task.generate_data`): no key of ours.

Uses whatever AI integration the user set up in HA. Photos go as attachments
through our media source (media-source://plant_garden/<photo_id>). The service
returns no token or cost data (checked in HA 2026.10): requests are counted,
costs show as unknown.
"""

from __future__ import annotations

import json
import time
from typing import Any, cast

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from ..base import AIError, AIRequest, AIResponse, ModelInfo, ProviderKind, Usage, parse_json

MEDIA_PREFIX = "media-source://plant_garden/"


class AITaskProvider:
    kind = ProviderKind.HA_AI_TASK

    def __init__(self, hass: HomeAssistant, entity_id: str) -> None:
        self._hass = hass
        self.entity_id = entity_id
        self.model = entity_id

    async def async_validate(self) -> None:
        if self._hass.states.get(self.entity_id) is None:
            raise AIError(f"{self.entity_id} does not exist")

    async def async_list_models(self) -> list[ModelInfo]:
        state = self._hass.states.get(self.entity_id)
        return [ModelInfo(id=self.entity_id, name=state.name if state else self.entity_id)]

    async def async_generate(self, req: AIRequest) -> AIResponse:
        prompt = "\n\n".join([req.system, *(f"{m.role}: {m.text}" for m in req.messages)])
        if req.json_schema is not None:
            prompt += (
                "\n\nAnswer with one JSON object in the field `result`, following this JSON "
                f"schema:\n{json.dumps(req.json_schema, separators=(',', ':'))}"
            )
        attachments = [
            {
                "media_content_id": f"{MEDIA_PREFIX}{image.photo_id}",
                "media_content_type": "image/jpeg",
            }
            for message in req.messages
            for image in message.images
            if image.photo_id
        ]
        data: dict[str, object] = {
            "task_name": f"plant_garden {req.feature.value}",
            "entity_id": self.entity_id,
            "instructions": prompt,
        }
        if attachments:
            data["attachments"] = attachments
        if req.json_schema is not None:
            data["structure"] = {
                "result": {
                    "description": "The answer as a JSON object",
                    "required": True,
                    "selector": {"object": {}},
                }
            }
        start = time.monotonic()
        try:
            response = await self._hass.services.async_call(
                "ai_task", "generate_data", data, blocking=True, return_response=True
            )
        except HomeAssistantError as err:
            raise AIError(str(err)) from err
        result = (response or {}).get("data")
        if isinstance(result, dict) and isinstance(result.get("result"), dict):
            parsed: dict[str, Any] | None = cast("dict[str, Any]", result["result"])
            text = json.dumps(parsed, ensure_ascii=False)
        else:
            text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
            parsed = parse_json(text) if req.json_schema is not None else None
        return AIResponse(
            text=text,
            data=parsed,
            usage=Usage(images=len(attachments)),
            model=self.entity_id,
            latency_ms=int((time.monotonic() - start) * 1000),
        )
