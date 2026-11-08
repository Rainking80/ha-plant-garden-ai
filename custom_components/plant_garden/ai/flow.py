"""Config subentry flow for AI providers (spec 6.1). Keys are checked with a cheap call."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import SOURCE_RECONFIGURE, ConfigSubentryFlow, SubentryFlowResult
from homeassistant.helpers import selector
import probatio

from .base import AIError, AuthError, ProviderKind
from .providers import anthropic, gemini
from .providers.openai_compat import PRESETS
from .service import build_provider

AI_KINDS = [kind.value for kind in ProviderKind]
DEFAULT_MODELS = {
    ProviderKind.ANTHROPIC: anthropic.DEFAULT_MODEL,
    ProviderKind.GEMINI: gemini.DEFAULT_MODEL,
}
TITLES = {
    ProviderKind.HA_AI_TASK: "HA AI Task",
    ProviderKind.OPENAI: "OpenAI-compatible",
    ProviderKind.ANTHROPIC: "Claude",
    ProviderKind.GEMINI: "Gemini",
    ProviderKind.PLANTNET: "Pl@ntNet",
}
PRESET_TITLES = {
    "openai": "OpenAI",
    "openrouter": "OpenRouter",
    "ollama": "Ollama",
    "lmstudio": "LM Studio",
    "custom": "OpenAI-compatible",
}


def _password() -> selector.TextSelector:
    return selector.TextSelector(
        selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
    )


class AISubentryFlow(ConfigSubentryFlow):
    """Add an AI provider, or give an existing one a new key or model."""

    _kind: ProviderKind
    _data: dict[str, Any]
    _models: list[str]

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        if user_input is not None:
            self._kind = ProviderKind(user_input["kind"])
            self._data = {}
            self._models = []
            if self._kind is ProviderKind.HA_AI_TASK:
                return await self.async_step_ai_task()
            if self._kind is ProviderKind.OPENAI:
                return await self.async_step_openai()
            return await self.async_step_key()
        return self.async_show_form(
            step_id="user",
            data_schema=probatio.Schema(
                {
                    probatio.Required("kind", default=ProviderKind.HA_AI_TASK.value): (
                        selector.SelectSelector(
                            selector.SelectSelectorConfig(
                                options=AI_KINDS,
                                translation_key="ai_kind",
                                mode=selector.SelectSelectorMode.LIST,
                            )
                        )
                    )
                }
            ),
        )

    async def async_step_ai_task(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            self._data = {"entity_id": user_input["entity_id"]}
            errors = await self._async_check()
            if not errors:
                return self._finish(f"{TITLES[self._kind]} ({user_input['entity_id']})")
        return self.async_show_form(
            step_id="ai_task",
            data_schema=probatio.Schema(
                {
                    probatio.Required("entity_id"): selector.EntitySelector(
                        selector.EntitySelectorConfig(domain="ai_task")
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_openai(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            preset = user_input["preset"]
            base_url = (user_input.get("base_url") or PRESETS.get(preset) or "").strip()
            if not base_url.startswith(("http://", "https://")):
                errors["base_url"] = "invalid_url"
            else:
                self._data = {
                    "preset": preset,
                    "base_url": base_url,
                    "api_key": (user_input.get("api_key") or "").strip(),
                }
                errors = await self._async_check()
                if not errors:
                    return await self.async_step_model()
        return self.async_show_form(
            step_id="openai",
            data_schema=probatio.Schema(
                {
                    probatio.Required("preset", default="openai"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[*PRESETS, "custom"], translation_key="ai_preset"
                        )
                    ),
                    probatio.Optional("base_url"): str,
                    probatio.Optional("api_key"): _password(),
                }
            ),
            errors=errors,
        )

    async def async_step_key(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            self._data = {"api_key": user_input["api_key"].strip()}
            errors = await self._async_check()
            if not errors:
                if self._kind is ProviderKind.PLANTNET:
                    return self._finish(TITLES[self._kind])
                return await self.async_step_model()
        return self.async_show_form(
            step_id="key",
            data_schema=probatio.Schema({probatio.Required("api_key"): _password()}),
            description_placeholders={"provider": TITLES[self._kind]},
            errors=errors,
        )

    async def _async_check(self) -> dict[str, str]:
        """Validate with a cheap call and remember the models the key can use."""
        provider = build_provider(self.hass, {"kind": self._kind.value, **self._data})
        try:
            await provider.async_validate()
            if self._kind not in (ProviderKind.PLANTNET, ProviderKind.HA_AI_TASK):
                self._models = [model.id for model in await provider.async_list_models()]
        except AuthError:
            return {"base": "invalid_auth"}
        except AIError:
            return {"base": "cannot_connect"}
        return {}

    async def async_step_model(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        if user_input is not None:
            self._data["model"] = user_input["model"].strip()
            title = (
                PRESET_TITLES[self._data["preset"]]
                if self._kind is ProviderKind.OPENAI
                else TITLES[self._kind]
            )
            return self._finish(f"{title} ({self._data['model']})")
        default = DEFAULT_MODELS.get(self._kind)
        if default not in self._models:
            default = sorted(self._models)[0] if self._models else ""
        return self.async_show_form(
            step_id="model",
            data_schema=probatio.Schema(
                {
                    probatio.Required("model", default=default): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=sorted(self._models),
                            custom_value=True,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    def _finish(self, title: str) -> SubentryFlowResult:
        data = {"kind": self._kind.value, **{k: v for k, v in self._data.items() if v != ""}}
        if self.source == SOURCE_RECONFIGURE:
            return self.async_update_and_abort(
                self._get_entry(), self._get_reconfigure_subentry(), title=title, data=data
            )
        return self.async_create_entry(title=title, data=data)

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """A new key or model: the same steps for the same kind of provider."""
        return await self.async_step_user({"kind": self._get_reconfigure_subentry().data["kind"]})
