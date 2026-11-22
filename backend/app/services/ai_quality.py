"""
Wiarygodność asystenta AI:
- ocena pokrycia odpowiedzi źródłami (z trafności wyszukiwania, a nie z deklaracji modelu),
- blokada pytań o ocenę konkretnej osoby (AI nie podejmuje decyzji kadrowych),
- rejestr pytań bez odpowiedzi w bazie wiedzy (luki do uzupełnienia, bez danych osobowych),
- test kontrolny na banku pytań (`data/eval/pytania_kontrolne.txt`).
"""

from __future__ import annotations

import re
import threading
import time
import unicodedata
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.schemas.form_contract import RagSourceCitation
from app.services.pii_guard import sanitize_pii

BANK_PATH = Path(__file__).resolve().parents[2] / "data" / "eval" / "pytania_kontrolne.txt"

STRONG_SCORE = 0.70
STRONG_MIN_SOURCES = 3

Coverage = Literal["strong", "partial"]


def coverage_of(sources: list[RagSourceCitation]) -> Coverage | None:
    """Mocne: najlepszy fragment trafny ≥ 0,70 i co najmniej 3 źródła; częściowe: pozostałe trafienia."""
    if not sources:
        return None
    best = max(s.score for s in sources)
    return "strong" if best >= STRONG_SCORE and len(sources) >= STRONG_MIN_SOURCES else "partial"


# --- pytania o ocenę konkretnej osoby -----------------------------------------------------


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().replace("ł", "l"))
    return "".join(c for c in text if not unicodedata.combining(c))


_DECIDE_VERB = r"(dac|wystawic|przyznac|postawic|wybrac|zaznaczyc)"
# Pytanie o decyzję (poziom / wynik / punkty)…
_DECISION_RES = [
    re.compile(rf"\bjak(a|i|ie)\s+(ocen\w*|poziom\w*|punkt\w*|wynik\w*)\s+(\w+\s+){{0,3}}{_DECIDE_VERB}\b"),
    re.compile(rf"\bile\s+punkt\w*\s+(\w+\s+){{0,3}}{_DECIDE_VERB}\b"),
    re.compile(rf"\b{_DECIDE_VERB}\s+(\w+\s+){{0,2}}(ocen\w*|poziom\w*|punkt\w*)\b"),
]
# …odniesione do konkretnej osoby.
_PERSON_RE = re.compile(
    r"\b(mu|jej|jemu|go|ja|niej|niego|pracownik\w*|pracownic\w*|pani|pania|panu|pana|kolega|kolegi|koledze|"
    r"kolezank\w*|podwladn\w*|referent\w*|specjalist\w*|naczelnik\w*)\b"
)
_NAME_RE = re.compile(r"(?<!^)(?<![.?!]\s)\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}")
# Zawsze o osobie: „oceń go / ją / pracownika”, „czy … zasługuje na …”.
_DIRECT_RES = [
    re.compile(r"\b(ocen|wystaw|zdecyduj)\s+(go|ja|jego|jej|pracownik\w*|pracownic\w*|pani\w*|pana)\b"),
    re.compile(r"\bczy\s+(\w+\s+){0,3}zasluguje\s+na\b"),
]

PERSON_DECISION_ANSWER = (
    "Nie wskazuję poziomu ani wyniku oceny konkretnej osoby – tę decyzję podejmuje wyłącznie przełożony "
    "(asystent ma charakter doradczy). Mogę natomiast pomóc ją dobrze przygotować:\n"
    "• wyjaśnić, co oznacza dany wskaźnik i opisy poziomów w modelu kompetencji,\n"
    "• podpowiedzieć, jakie zachowania i przykłady (STAR) z całego okresu warto zestawić,\n"
    "• przypomnieć warunki oceny pozytywnej i negatywnej oraz kiedy uzasadnienie jest obowiązkowe.\n"
    "Sugerowany poziom kryterium liczy formularz na podstawie zachowań wybranych przy wskaźnikach."
)


def asks_for_person_decision(question: str) -> bool:
    folded = _fold(question)
    if any(r.search(folded) for r in _DIRECT_RES):
        return True
    if not any(r.search(folded) for r in _DECISION_RES):
        return False
    return bool(_PERSON_RE.search(folded) or _NAME_RE.search(question.strip()))


# --- rejestr pytań bez odpowiedzi ----------------------------------------------------------

_UNANSWERED: deque[dict[str, Any]] = deque(maxlen=100)
_LOCK = threading.Lock()


def record_unanswered(question: str, mode: str) -> None:
    clean, _ = sanitize_pii(question)
    with _LOCK:
        _UNANSWERED.appendleft(
            {"question": clean[:300], "mode": mode, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        )


def unanswered_log() -> list[dict[str, Any]]:
    with _LOCK:
        return list(_UNANSWERED)


# --- test kontrolny ----------------------------------------------------------------------

_CACHE: dict[str, Any] = {}


def load_bank() -> list[tuple[str, bool]]:
    """(pytanie, czy_spoza_dziedziny)."""
    if not BANK_PATH.is_file():
        return []
    out: list[tuple[str, bool]] = []
    for line in BANK_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.append((line.lstrip("!").strip(), line.startswith("!")))
    return out


def run_quality_check() -> dict[str, Any]:
    """Wyszukiwanie na banku pytań (bez wywołań modelu językowego – szybkie i bezkosztowe)."""
    from app.services.rag_service import retrieve_legal_sources

    if _CACHE.get("result") and time.time() - _CACHE.get("at", 0) < 600:
        return _CACHE["result"]

    items: list[dict[str, Any]] = []
    for question, off_topic in load_bank():
        sources = retrieve_legal_sources(question, top_k=8)
        cov = coverage_of(sources)
        ok = (not sources) if off_topic else bool(sources)
        items.append(
            {
                "question": question,
                "expected": "refusal" if off_topic else "answer",
                "ok": ok,
                "coverage": cov,
                "sources": len(sources),
                "top_document": sources[0].dokument if sources else None,
            }
        )
    in_domain = [i for i in items if i["expected"] == "answer"]
    result = {
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(items),
        "passed": sum(1 for i in items if i["ok"]),
        "in_domain": len(in_domain),
        "strong": sum(1 for i in in_domain if i["coverage"] == "strong"),
        "partial": sum(1 for i in in_domain if i["coverage"] == "partial"),
        "refusals_ok": sum(1 for i in items if i["expected"] == "refusal" and i["ok"]),
        "refusals_expected": sum(1 for i in items if i["expected"] == "refusal"),
        "items": items,
    }
    _CACHE.update(result=result, at=time.time())
    return result
