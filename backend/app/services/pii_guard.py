from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Wzorce minimalizacji danych osobowych (RODO art. 5 ust. 1 lit. c)
_PESEL_RE = re.compile(r"\b\d{11}\b")
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?:\+48[\s-]?)?\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b")
_TITLED_NAME_RE = re.compile(
    r"\b(?:Pan(?:i|a|u|ią)?|Imię\s+i\s+nazwisko\s*:)\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+"
    r"(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+)?\b"
)


def sanitize_pii(text: str) -> tuple[str, bool]:
    """
    Usuwa dane identyfikujące (PESEL, e-mail, telefon, zwroty 'Pan/Pani Imię Nazwisko')
    przed wysłaniem jakiegokolwiek tekstu do zewnętrznego modelu LLM.
    """
    if not text:
        return "", False

    redacted = text
    redacted = _PESEL_RE.sub("[PESEL-UKRYTY]", redacted)
    redacted = _EMAIL_RE.sub("[EMAIL-UKRYTY]", redacted)
    redacted = _PHONE_RE.sub("[TEL-UKRYTY]", redacted)
    redacted = _TITLED_NAME_RE.sub("Osoba oceniana", redacted)

    return redacted, (redacted != text)


def sanitize_dict_values(data: Any) -> tuple[Any, bool]:
    """Rekurencyjnie anonimizuje wartości tekstowe w słownikach i listach."""
    any_changed = False
    if isinstance(data, str):
        return sanitize_pii(data)
    if isinstance(data, list):
        out_list = []
        for item in data:
            clean_item, ch = sanitize_dict_values(item)
            any_changed = any_changed or ch
            out_list.append(clean_item)
        return out_list, any_changed
    if isinstance(data, dict):
        out_dict = {}
        # Pomijamy klucze mogące wprost zawierać imię/nazwisko
        blocked_keys = {"imie", "nazwisko", "first_name", "last_name", "pesel"}
        for k, v in data.items():
            if str(k).lower() in blocked_keys:
                any_changed = True
                continue
            clean_v, ch = sanitize_dict_values(v)
            any_changed = any_changed or ch
            out_dict[k] = clean_v
        return out_dict, any_changed
    return data, False


async def call_structured_llm(
    system_instruction: str,
    user_payload: str,
    json_schema: dict[str, Any],
    temperature: float = 0.1,
) -> tuple[dict[str, Any] | None, str]:
    """
    Wywołuje w pierwszej kolejności lokalny model on-premise (np. Ollama/Bielik przez LLM_BASE_URL),
    a następnie darmowe Google Gemini API z wymuszeniem `responseMimeType = application/json`
    oraz `responseSchema` (oszczędność tokenów i 100% poprawny JSON).
    Zwraca `(parsed_dict | None, provider_name)`.
    """
    # 1. Wsparcie on-premise (np. Ollama / vLLM / Bielik w sieci urzędu)
    if settings.LLM_BASE_URL:
        model_name = settings.LLM_MODEL or "bielik"
        headers = {"Content-Type": "application/json"}
        if settings.LLM_API_KEY:
            headers["Authorization"] = f"Bearer {settings.LLM_API_KEY}"
        body = {
            "model": model_name,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_payload},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=body,
                )
                resp.raise_for_status()
                raw_txt = resp.json()["choices"][0]["message"]["content"]
                return json.loads(raw_txt), f"onprem:{model_name}"
        except Exception as exc:
            logger.warning("Błąd modelu on-premise (%s) – fallback.", exc)

    # 2. Darmowe Google Gemini API (Free Tier - natywne Structured Outputs)
    if settings.GEMINI_API_KEY:
        gemini_model = settings.LLM_MODEL or "gemini-2.0-flash"
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
            f"?key={settings.GEMINI_API_KEY}"
        )
        gemini_body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": [{"text": user_payload}]}],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
                "responseSchema": json_schema,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=gemini_body)
                resp.raise_for_status()
                candidates = resp.json().get("candidates", [])
                if candidates:
                    raw_json = candidates[0]["content"]["parts"][0]["text"]
                    return json.loads(raw_json), f"gemini:{gemini_model}"
        except Exception as exc:
            logger.warning("Błąd wywołania Gemini API (%s) – przełączenie na deterministyczny silnik lokalny.", exc)

    return None, "deterministic_local"