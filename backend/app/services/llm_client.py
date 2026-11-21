from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LlmProviderConfig:
    provider: str
    base_url: str
    api_key: str
    model: str


def get_active_llm_provider() -> LlmProviderConfig | None:
    if settings.LLM_BASE_URL and settings.LLM_API_KEY:
        return LlmProviderConfig(
            provider="custom_llm",
            base_url=settings.LLM_BASE_URL.rstrip("/"),
            api_key=settings.LLM_API_KEY,
            model=settings.LLM_MODEL or "gpt-4o-mini",
        )
    if settings.OPENAI_API_KEY:
        return LlmProviderConfig(
            provider="openai",
            base_url="https://api.openai.com/v1",
            api_key=settings.OPENAI_API_KEY,
            model=settings.LLM_MODEL or "gpt-4o-mini",
        )
    if settings.GEMINI_API_KEY:
        return LlmProviderConfig(
            provider="gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            api_key=settings.GEMINI_API_KEY,
            model=settings.LLM_MODEL or "gemini-2.0-flash",
        )
    if settings.GROQ_API_KEY:
        return LlmProviderConfig(
            provider="groq",
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.GROQ_API_KEY,
            model=settings.LLM_MODEL or "llama-3.3-70b-versatile",
        )
    return None


async def generate_chat_completion(
    system_prompt: str,
    messages: list[dict[str, str]],
    fallback_reply: str,
) -> tuple[str, str, str]:
    cfg = get_active_llm_provider()
    if cfg is None:
        return fallback_reply, "m1_smart_fallback", "m1-legal-expert-local"

    payload: dict[str, Any] = {
        "model": cfg.model,
        "temperature": settings.LLM_TEMPERATURE,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
    }

    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{cfg.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {cfg.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if text:
                return text, cfg.provider, cfg.model
    except Exception as exc:
        logger.warning("Błąd dostawcy LLM (%s): %s – użyto fallbacku M1.", cfg.provider, exc)

    return fallback_reply, "m1_smart_fallback", "m1-legal-expert-local"
