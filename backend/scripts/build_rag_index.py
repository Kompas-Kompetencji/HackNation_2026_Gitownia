#!/usr/bin/env python3
"""
Buduje lokalny indeks wektorowy ChromaDB w `backend/chroma_db/` przy użyciu polskiego modelu
embeddingów `sdadas/mmlw-retrieval-roberta-base` oraz plików PDF z `backend/data/raw/`.
Zapisuje również lekki zrzut chunków w `backend/data/processed/rag_chunks.json`.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from pypdf import PdfReader

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RAW_DIR = BACKEND_ROOT / "data" / "raw"
PROCESSED_CHUNKS_PATH = BACKEND_ROOT / "data" / "processed" / "rag_chunks.json"
CHROMA_DIR = BACKEND_ROOT / "chroma_db"
EMBEDDING_MODEL_NAME = "sdadas/mmlw-retrieval-roberta-base"
COLLECTION_NAME = "kompas_sluzba_cywilna_docs"

_SECTION_RE = re.compile(
    r"((?:art\.|§)\s*\d+[a-z]?(?:\s*ust\.\s*\d+)?(?:\s*pkt\s*\d+)?)",
    flags=re.IGNORECASE,
)


def _friendly_doc_title(filename: str) -> str:
    low = filename.lower()
    if "2015" in low and "rozporz" in low:
        return "Rozporządzenie PRM z dnia 23 lipca 2015 r. w sprawie pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144)"
    if "2016" in low and "rozporz" in low:
        return "Rozporządzenie PRM z dnia 4 kwietnia 2016 r. w sprawie ocen okresowych w służbie cywilnej (Dz. U. poz. 470)"
    if "pierwsza ocena" in low and "poradnik" in low:
        return "Poradnik KPRM: Pierwsza ocena w służbie cywilnej (wrzesień 2016)"
    if "oceny okresowe" in low and "poradnik" in low:
        return "Poradnik KPRM: Oceny okresowe w służbie cywilnej (wrzesień 2016)"
    return filename


def extract_chunks_from_pdfs(raw_dir: Path) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    if not raw_dir.is_dir():
        return chunks

    for pdf_path in sorted(raw_dir.glob("*.pdf")):
        doc_title = _friendly_doc_title(pdf_path.name)
        reader = PdfReader(str(pdf_path))
        for page_idx, page in enumerate(reader.pages, start=1):
            raw_text = page.extract_text() or ""
            cleaned = re.sub(r"\s+", " ", raw_text).strip()
            if len(cleaned) < 60:
                continue

            # Podział strony na spójne okna ~750 znaków z zakładką 120 znaków
            step = 630
            for start in range(0, len(cleaned), step):
                window = cleaned[start : start + 750].strip()
                if len(window) < 60:
                    continue
                matches = _SECTION_RE.findall(window)
                sec_label = ", ".join(dict.fromkeys(m.strip() for m in matches[:2])) if matches else f"Rozdział / str. {page_idx}"
                chunk_id = f"{pdf_path.stem}_p{page_idx}_{start}"
                chunks.append(
                    {
                        "id": chunk_id,
                        "dokument": doc_title,
                        "paragraf_artykul": sec_label,
                        "strona": str(page_idx),
                        "text": window,
                    }
                )
    return chunks


def main() -> int:
    chunks = extract_chunks_from_pdfs(RAW_DIR)
    print(f"[RAG] Wyekstrahowano {len(chunks)} fragmentów z plików PDF w {RAW_DIR}.")

    if chunks:
        PROCESSED_CHUNKS_PATH.parent.mkdir(parents=True, exist_ok=True)
        PROCESSED_CHUNKS_PATH.write_text(
            json.dumps(chunks, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"[RAG] Zapisano indeks tekstowy: {PROCESSED_CHUNKS_PATH}")

    try:
        import chromadb
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print(
            "[RAG] Uwaga: pakiety 'chromadb' / 'sentence-transformers' nie są zainstalowane w tym venv. "
            "Zapisano rag_chunks.json (silnik użyje lokalnego indeksu kosinusowego n-gramów)."
        )
        return 0

    if not chunks:
        print("[RAG] Brak plików PDF do zaindeksowania w ChromaDB.")
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

    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    batch_size = 100
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        collection.add(
            ids=[c["id"] for c in batch],
            documents=[c["text"] for c in batch],
            embeddings=embeddings[i : i + batch_size],
            metadatas=[
                {
                    "dokument": c["dokument"],
                    "paragraf_artykul": c["paragraf_artykul"],
                    "strona": c["strona"],
                }
                for c in batch
            ],
        )

    print(f"[OK] Zbudowano bazę wektorową ChromaDB ({len(chunks)} wektorów) w {CHROMA_DIR}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())