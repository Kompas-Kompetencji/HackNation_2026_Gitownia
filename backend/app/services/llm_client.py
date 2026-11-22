"""
Jedno miejsce wyboru dostawcy LLM i wywołań modelu.

Konfiguracja (zmienne środowiskowe, bez kluczy w kodzie):
- LLM_API_KEY      – klucz dostawcy (hosting); dostawca rozpoznawany po prefiksie klucza
                     (AIza… → Google Gemini, gsk_… → Groq, sk-or-… → OpenRouter, sk-… → OpenAI),
                     albo wskazany wprost przez LLM_PROVIDER.
- LLM_MODEL_NAME   – nazwa modelu (alias: LLM_MODEL).
- LLM_BASE_URL     – opcjonalnie: własny endpoint zgodny z OpenAI (Ollama/vLLM/Bielik on-premise).
- Zgodność wstecz: GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY.

Brak klucza lub błąd dostawcy NIE przerywa działania: funkcje zwracają `None`, a wywołujący
korzysta z deterministycznej odpowiedzi opartej wyłącznie na źródłach RAG.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_NATIVE = "gemini"

_DEFAULT_MODELS = {
    "gemini": "gemini-3.8-flash",
    "openai": "gpt-4o-mini",
    "groq": "llama-3.3-70b-versatile",
    "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
    "custom": "bielik",
}

_OPENAI_COMPAT_URLS = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}


@dataclass(frozen=True)
class LlmProviderConfig:
    provider: str
    base_url: str | None
    api_key: str | None
    model: str
    fallbacks: tuple[str, ...] = ()


# Modele zapasowe Gemini (szybkie, darmowe w AI Studio), używane gdy główny model jest przeciążony
# (HTTP 429/503) albo nie odpowie w LLM_TIMEOUT_SECONDS. Nadpisanie: LLM_FALLBACK_MODELS=model1,model2
_GEMINI_FALLBACKS = ("gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest")


def _detect_provider(key: str, model: str | None = None) -> str:
    # Prefiks klucza ma pierwszeństwo; nazwa modelu rozstrzyga tylko klucze bez znanego prefiksu.
    if key.startswith("gsk_"):
        return "groq"
    if key.startswith("sk-or-"):
        return "openrouter"
    if key.startswith("sk-"):
        return "openai"
    # AIza… = klasyczny klucz Google AI Studio, AQ.… = nowy format klucza Google (Gemini API)
    if key.startswith(("AIza", "AQ.")) or (model or "").lower().startswith(("gemini", "gemma")):
        return "gemini"
    return "openai"


_PLACEHOLDERS = {"", "placeholder", "changeme", "change-me", "xxx", "todo", "none", "null"}


def _real(value: str | None) -> str | None:
    """Wartości-zaślepki z konfiguracji chmury (np. 'placeholder') traktujemy jak brak ustawienia."""
    return None if value is None or value.strip().lower() in _PLACEHOLDERS else value.strip()


def get_active_llm_provider() -> LlmProviderConfig | None:
    model_override = _real(settings.LLM_MODEL_NAME) or _real(settings.LLM_MODEL)
    if settings.LLM_BASE_URL:
        return LlmProviderConfig(
            provider="custom",
            base_url=settings.LLM_BASE_URL.rstrip("/"),
            api_key=settings.LLM_API_KEY,
            model=model_override or _DEFAULT_MODELS["custom"],
        )

    key = _real(settings.LLM_API_KEY)
    provider = (_real(settings.LLM_PROVIDER) or "").lower() or None
    if not key:
        for legacy_provider, legacy_key in (
            ("gemini", settings.GEMINI_API_KEY),
            ("openai", settings.OPENAI_API_KEY),
            ("groq", settings.GROQ_API_KEY),
        ):
            if legacy_key:
                key, provider = legacy_key, provider or legacy_provider
                break
    if not key:
        return None

    provider = provider or _detect_provider(key, model_override)
    if provider not in _DEFAULT_MODELS:
        logger.warning("Nieznany LLM_PROVIDER=%s – używam API zgodnego z OpenAI.", provider)
        provider = "openai"
    model = (model_override or _DEFAULT_MODELS[provider]).strip()
    if settings.LLM_FALLBACK_MODELS is not None:
        fallbacks = tuple(m.strip() for m in settings.LLM_FALLBACK_MODELS.split(",") if m.strip())
    else:
        fallbacks = _GEMINI_FALLBACKS if provider == GEMINI_NATIVE else ()
    return LlmProviderConfig(
        provider=provider,
        base_url=None if provider == GEMINI_NATIVE else _OPENAI_COMPAT_URLS.get(provider),
        api_key=key,
        model=model,
        fallbacks=tuple(m for m in dict.fromkeys(fallbacks) if m != model),
    )


def llm_status() -> dict[str, Any]:
    """Stan konfiguracji LLM bez ujawniania klucza (dla /health i /ai/status)."""
    cfg = get_active_llm_provider()
    if cfg is None:
        return {"configured": False, "provider": None, "model": None, "mode": "deterministic_rag_only"}
    return {
        "configured": True,
        "provider": cfg.provider,
        "model": cfg.model,
        "fallback_models": list(cfg.fallbacks),
        "temporarily_skipped": sorted(m for m, until in _COOLDOWN.items() if until > time.monotonic()),
        "last_used_model": _LAST_USED.get("model"),
        "mode": "rag_plus_llm",
    }


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


class _RetryableLlmError(Exception):
    """Przeciążenie / limit / przekroczony czas – warto spróbować modelu zapasowego."""


# model -> chwila (monotonic), do której model jest pomijany po przeciążeniu lub przekroczeniu czasu
_COOLDOWN: dict[str, float] = {}
_COOLDOWN_SECONDS = 180.0
_LAST_USED: dict[str, str] = {}


async def _call_once(
    client: httpx.AsyncClient,
    cfg: LlmProviderConfig,
    model: str,
    system_instruction: str,
    user_payload: str,
    json_schema: dict[str, Any],
    temperature: float,
) -> str:
    try:
        if cfg.provider == GEMINI_NATIVE:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": cfg.api_key or ""},
                json={
                    "systemInstruction": {"parts": [{"text": system_instruction}]},
                    "contents": [{"role": "user", "parts": [{"text": user_payload}]}],
                    "generationConfig": {
                        "temperature": temperature,
                        "responseMimeType": "application/json",
                        "responseSchema": json_schema,
                    },
                },
            )
        else:
            headers = {"Content-Type": "application/json"}
            if cfg.api_key:
                headers["Authorization"] = f"Bearer {cfg.api_key}"
            schema_hint = (
                "\n\nZwróć WYŁĄCZNIE poprawny obiekt JSON zgodny ze schematem (typy w notacji OpenAPI): "
                + json.dumps(json_schema, ensure_ascii=False)
            )
            resp = await client.post(
                f"{cfg.base_url}/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "temperature": temperature,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_instruction + schema_hint},
                        {"role": "user", "content": user_payload},
                    ],
                },
            )
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise _RetryableLlmError(f"{type(exc).__name__}") from exc

    if resp.status_code in (408, 429, 500, 502, 503, 504):
        raise _RetryableLlmError(f"HTTP {resp.status_code}")
    if resp.status_code == 404:
        raise _RetryableLlmError("HTTP 404 (model niedostępny)")
    resp.raise_for_status()
    data = resp.json()
    if cfg.provider == GEMINI_NATIVE:
        candidates = data.get("candidates") or []
        parts = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
        # modele "myślące" mogą zwrócić kilka części; odpowiedź JSON jest w ostatniej części tekstowej
        texts = [p.get("text", "") for p in parts if p.get("text") and not p.get("thought")]
        return texts[-1] if texts else ""
    return data["choices"][0]["message"]["content"] or ""


async def call_structured_llm(
    system_instruction: str,
    user_payload: str,
    json_schema: dict[str, Any],
    temperature: float = 0.1,
) -> tuple[dict[str, Any] | None, str]:
    """
    Wywołuje skonfigurowany model i wymusza odpowiedź JSON zgodną z `json_schema`.
    Kolejność: LLM_MODEL_NAME, potem modele zapasowe (przy 429/503/404/przekroczeniu czasu);
    model, który zawiódł, jest pomijany przez 3 minuty. Łączny czas ograniczony przez LLM_TOTAL_BUDGET_SECONDS.
    Zwraca `(dict | None, provider_label)`. `None` = brak klucza / wszystkie modele zawiodły → fallback deterministyczny.
    Tekst wejściowy musi być wcześniej zanonimizowany (pii_guard.sanitize_pii).
    """
    cfg = get_active_llm_provider()
    if cfg is None:
        return None, "deterministic_local"

    now = time.monotonic()
    chain = [m for m in (cfg.model, *cfg.fallbacks) if _COOLDOWN.get(m, 0.0) <= now]
    if not chain:  # wszystkie w przerwie – spróbuj mimo to najszybszego zapasowego
        chain = [(cfg.fallbacks or (cfg.model,))[0]]

    deadline = now + settings.LLM_TOTAL_BUDGET_SECONDS
    async with httpx.AsyncClient() as client:
        for model in chain:
            remaining = deadline - time.monotonic()
            if remaining < 3:
                break
            timeout = min(settings.LLM_TIMEOUT_SECONDS, remaining)
            client.timeout = httpx.Timeout(timeout, connect=10.0)
            label = f"{cfg.provider}:{model}"
            try:
                text = await _call_once(client, cfg, model, system_instruction, user_payload, json_schema, temperature)
            except _RetryableLlmError as exc:
                _COOLDOWN[model] = time.monotonic() + _COOLDOWN_SECONDS
                logger.warning("LLM %s niedostępny (%s) – próbuję kolejnego modelu.", label, exc)
                continue
            except Exception as exc:  # zły klucz (400/401/403), nieoczekiwana odpowiedź
                logger.warning("Błąd dostawcy LLM (%s): %s – fallback deterministyczny.", label, exc)
                break
            parsed = _extract_json(text)
            if parsed is not None:
                _COOLDOWN.pop(model, None)
                _LAST_USED["model"] = model
                return parsed, label
            logger.warning("LLM (%s) zwrócił odpowiedź bez poprawnego JSON – próbuję kolejnego modelu.", label)
    return None, "deterministic_local"
