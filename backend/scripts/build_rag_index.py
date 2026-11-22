#!/usr/bin/env python3
"""
Buduje indeks RAG z plików PDF w `backend/data/raw/`:
- `backend/data/processed/rag_chunks.json` – fragmenty tekstu (zawsze; używa ich backend),
- opcjonalnie ChromaDB w `backend/chroma_db/` (jeśli zainstalowano chromadb + sentence-transformers).

Każdy PDF z `data/raw` trafia do indeksu automatycznie – nazwa pliku nie musi być znana skryptowi
(nieznany plik dostaje tytuł z nazwy). Backend sam przebudowuje indeks przy starcie, gdy w `data/raw`
pojawi się PDF, którego nie ma w `rag_chunks.json` (app/services/rag_service.py).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RAW_DIR = BACKEND_ROOT / "data" / "raw"
PROCESSED_CHUNKS_PATH = BACKEND_ROOT / "data" / "processed" / "rag_chunks.json"
CHROMA_DIR = BACKEND_ROOT / "chroma_db"
EMBEDDING_MODEL_NAME = "sdadas/mmlw-retrieval-roberta-base"
COLLECTION_NAME = "kompas_sluzba_cywilna_docs"

TARGET_CHUNK_CHARS = 900  # docelowa długość fragmentu
MAX_CHUNK_CHARS = 1300  # twardy limit (bardzo długie zdania/tabele)
OVERLAP_SENTENCES = 1  # zakładka między fragmentami (kontekst na granicy)
MIN_CHUNK_CHARS = 80

_SECTION_RE = re.compile(
    r"((?:art\.|§)\s*\d+[a-z]?(?:\s*ust\.\s*\d+)?(?:\s*pkt\s*\d+)?)",
    flags=re.IGNORECASE,
)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?;:])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ0-9§•–-])")


def friendly_doc_title(filename: str) -> str:
    """Czytelny tytuł źródła dla cytowania; nieznane pliki – tytuł z nazwy pliku."""
    low = filename.lower()
    if "faq" in low or "pytania" in low:
        return "Departament Służby Cywilnej KPRM: najczęściej zadawane pytania – oceny pracownicze (FAQ)"
    if "ustawa" in low:
        return "Ustawa z dnia 21 listopada 2008 r. o służbie cywilnej"
    if "2015" in low and "rozporz" in low:
        return "Rozporządzenie PRM z dnia 23 lipca 2015 r. w sprawie pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144)"
    if "2016" in low and "rozporz" in low:
        return "Rozporządzenie PRM z dnia 4 kwietnia 2016 r. w sprawie ocen okresowych w służbie cywilnej (Dz. U. poz. 470)"
    if "pierwsza ocena" in low and "poradnik" in low:
        return "Poradnik KPRM: Pierwsza ocena w służbie cywilnej (wrzesień 2016)"
    if "oceny okresowe" in low and "poradnik" in low:
        return "Poradnik KPRM: Oceny okresowe w służbie cywilnej (wrzesień 2016)"
    stem = Path(filename).stem
    stem = re.sub(r"\s*\(\d+\)\s*$", "", stem)  # " (2)" z pobranych duplikatów
    return re.sub(r"[_]+", " ", stem).strip() or filename


# Zgodność wsteczna (stara nazwa funkcji)
_friendly_doc_title = friendly_doc_title


def _clean_page_text(raw: str) -> str:
    text = raw.replace("­", "")  # miękkie dywizy
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # dzielenie wyrazów na końcu wiersza
    text = re.sub(r"[•●]", "•", text)  # znaki wypunktowań z czcionek symboli
    return re.sub(r"\s+", " ", text).strip()


def _split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_SPLIT_RE.split(text) if p.strip()]
    out: list[str] = []
    for part in parts:  # bardzo długie "zdania" (tabele, wyliczenia) tniemy twardo
        while len(part) > MAX_CHUNK_CHARS:
            cut = part.rfind(" ", 0, MAX_CHUNK_CHARS)
            cut = cut if cut > MAX_CHUNK_CHARS // 2 else MAX_CHUNK_CHARS
            out.append(part[:cut].strip())
            part = part[cut:].strip()
        if part:
            out.append(part)
    return out


def _chunks_from_sentences(sentences: list[str]) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for sentence in sentences:
        if current and size + len(sentence) + 1 > TARGET_CHUNK_CHARS:
            chunks.append(" ".join(current))
            current = current[-OVERLAP_SENTENCES:] if OVERLAP_SENTENCES else []
            size = sum(len(s) + 1 for s in current)
        current.append(sentence)
        size += len(sentence) + 1
    if current:
        tail = " ".join(current)
        if not chunks or tail not in chunks[-1]:
            chunks.append(tail)
    return [c for c in chunks if len(c) >= MIN_CHUNK_CHARS]


def extract_chunks_from_pdf(pdf_path: Path) -> list[dict[str, Any]]:
    from pypdf import PdfReader

    doc_title = friendly_doc_title(pdf_path.name)
    reader = PdfReader(str(pdf_path))
    chunks: list[dict[str, Any]] = []
    for page_idx, page in enumerate(reader.pages, start=1):
        cleaned = _clean_page_text(page.extract_text() or "")
        if len(cleaned) < MIN_CHUNK_CHARS:
            continue
        for n, window in enumerate(_chunks_from_sentences(_split_sentences(cleaned))):
            matches = _SECTION_RE.findall(window)
            sec_label = ", ".join(dict.fromkeys(m.strip() for m in matches[:2])) if matches else f"str. {page_idx}"
            chunks.append(
                {
                    "id": f"{pdf_path.stem}_p{page_idx}_{n}",
                    "source_file": pdf_path.name,
                    "dokument": doc_title,
                    "paragraf_artykul": sec_label,
                    "strona": str(page_idx),
                    "text": window,
                }
            )
    return chunks


def extract_chunks_from_pdfs(raw_dir: Path = RAW_DIR) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    if not raw_dir.is_dir():
        return chunks
    for pdf_path in sorted(raw_dir.glob("*.pdf")):
        try:
            chunks.extend(extract_chunks_from_pdf(pdf_path))
        except Exception as exc:  # uszkodzony PDF nie blokuje reszty
            print(f"[RAG] Pominięto {pdf_path.name}: {exc}")
    return chunks


def write_chunks(chunks: list[dict[str, Any]], path: Path = PROCESSED_CHUNKS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(chunks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    chunks = extract_chunks_from_pdfs(RAW_DIR)
    per_file: dict[str, int] = {}
    for c in chunks:
        per_file[c["source_file"]] = per_file.get(c["source_file"], 0) + 1
    for name in sorted(p.name for p in RAW_DIR.glob("*.pdf")):
        print(f"[RAG] {per_file.get(name, 0):4d} fragmentów  {name}")
    print(f"[RAG] Razem {len(chunks)} fragmentów z {len(per_file)} plików PDF.")

    if chunks:
        write_chunks(chunks)
        print(f"[RAG] Zapisano indeks tekstowy: {PROCESSED_CHUNKS_PATH}")

    try:
        import chromadb
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("[RAG] chromadb / sentence-transformers niezainstalowane – backend użyje indeksu z rag_chunks.json.")
        return 0

    if not chunks:
        return 0

    print(f"[RAG] Ładowanie modelu embeddingów '{EMBEDDING_MODEL_NAME}'...")
    embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
    passages = [f"passage: {c['text']}" for c in chunks]
    embeddings = embedder.encode(passages, normalize_embeddings=True, show_progress_bar=True).tolist()

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    collection = client.create_collection(name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
    for i in range(0, len(chunks), 100):
        batch = chunks[i : i + 100]
        collection.add(
            ids=[c["id"] for c in batch],
            documents=[c["text"] for c in batch],
            embeddings=embeddings[i : i + 100],
            metadatas=[{k: c[k] for k in ("dokument", "paragraf_artykul", "strona")} for c in batch],
        )
    print(f"[OK] Zbudowano bazę wektorową ChromaDB ({len(chunks)} wektorów) w {CHROMA_DIR}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
