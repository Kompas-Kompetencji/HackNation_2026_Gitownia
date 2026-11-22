from __future__ import annotations

import re
from typing import Any

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


# Wywołanie modelu przeniesione do app.services.llm_client (jeden wybór dostawcy: LLM_API_KEY /
# LLM_MODEL_NAME). Re-eksport dla zgodności z istniejącymi importami.
from app.services.llm_client import call_structured_llm  # noqa: E402,F401
