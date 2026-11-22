"""Indeks RAG musi obejmować każdy PDF z data/raw, a wyszukiwanie – trafne pytania jury."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import rag_service  # noqa: E402

RAW = BACKEND / "data" / "raw"
CHUNKS = BACKEND / "data" / "processed" / "rag_chunks.json"


def test_every_pdf_in_raw_is_indexed():
    chunks = json.loads(CHUNKS.read_text(encoding="utf-8"))
    indexed = {c.get("source_file") for c in chunks}
    missing = sorted(p.name for p in RAW.glob("*.pdf") if p.name not in indexed)
    assert not missing, f"PDF-y bez fragmentów w rag_chunks.json (uruchom scripts/build_rag_index.py): {missing}"


def test_relevant_questions_find_sources_and_off_topic_does_not():
    relevant = [
        line.strip()
        for line in (BACKEND / "tests" / "data" / "pytania_jury.txt").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    off_topic = {"Przepis na sernik", "Kto wygrał mundial w 2022?", "Ile wynosi trzynastka w służbie cywilnej?"}
    without_sources = [q for q in relevant if q not in off_topic and not rag_service.retrieve_legal_sources(q, top_k=8)]
    assert not without_sources, f"Trafne pytania bez źródeł: {without_sources}"
    for q in off_topic:
        assert rag_service.retrieve_legal_sources(q, top_k=8) == [], q


def test_faq_is_a_named_source():
    hits = rag_service.retrieve_legal_sources("Czy Szef Służby Cywilnej może unieważnić ocenę?", top_k=8)
    assert any("FAQ" in s.dokument for s in hits)


def _top(q: str) -> list[tuple[str, str]]:
    return [(s.dokument, s.strona) for s in rag_service.retrieve_legal_sources(q, top_k=8)][:3]


def test_case_diacritics_and_typos_do_not_change_sources():
    pairs = [
        ("Czym różni się arkusz B od arkusza C?", "czym rozni sie formularz b od c"),
        ("Kto przeprowadza rozmowę wstępną z nowym pracownikiem?", "kto przeprowadza rozmowe wstepna z nowym pracownkiem"),
        ("Czy Szef Służby Cywilnej może unieważnić ocenę?", "CZY SZEF SLUZBY CYWILNEJ MOZE UNIEWAZNIC OCENE"),
        ("Jak przebiega rozmowa oceniająca?", "jak przebiega rozmwa oceniajaca"),
        ("Czy urlop macierzyński wydłuża okres oceny?", "czy urlop macierzynski wydluza okres ocny"),
    ]
    for correct, sloppy in pairs:
        assert _top(correct) == _top(sloppy), sloppy
