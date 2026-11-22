# Kompas Kompetencji – HackNation 2026 (Ministerstwo Cyfryzacji)

Narzędzie dla przełożonych w służbie cywilnej: prowadzi krok po kroku przez **pierwszą ocenę** i **ocenę okresową**
(arkusz B/C), ocenę wskaźników behawioralnych z oficjalnego modelu kompetencji, **sugerowany poziom** kryterium
(decyzja zawsze należy do przełożonego), terminy, urzędowy **PDF** arkusza oraz **asystenta AI** z RAG i cytowaniem źródeł.

## Architektura

```
frontend/   React 19 + Vite + Tailwind (gałąź maxxw28) – build serwowany przez backend z tego samego adresu
backend/    FastAPI (Python 3.12)
  app/core       reguły prawne (scoring, terminy art. 112/115 KC)
  app/data       repozytoria: Postgres/Supabase (DATABASE_URL) | REST Supabase | pamięć; migracje tylko dodające
  app/routers    /api/v1: dane (pracownicy, notatki, OSP, oceny), AI (/ai-assistant, /ai/formal-chat, /ai/coaching-assistant)
  app/services   RAG, LLM (Gemini/OpenAI-compatible), anonimizacja RODO, parser OSP, generator PDF
  data/raw       baza wiedzy: rozporządzenia 2015/2016, poradniki KPRM, Model_kompetencji.xlsx, przykładowe OSP
  data/processed competency_model.json (z xlsx), rag_chunks.json (z PDF)
supabase/   schema-additions.sql (uzupełnienie schematu), seed.sql (dane demo, opcjonalnie)
Dockerfile  jeden obraz: build frontendu + backend (Azure Container Apps, port 8000)
```

Dokumentacja API (Swagger): `/docs`. Stan usług (baza, LLM, rozmiar bazy wiedzy): `/api/v1/health`.

## Asystent AI (gdzie i jak użyto AI)

- **Asystent formalny** – RAG: pytanie → anonimizacja danych osobowych → wyszukanie fragmentów (rozporządzenia, poradniki KPRM,
  model kompetencji; indeks n-gramowy, opcjonalnie ChromaDB) → LLM odpowiada *wyłącznie* na podstawie znalezionych źródeł
  i podaje dokument / § / stronę. Brak źródeł → jawna odmowa (bez halucynacji). Brak klucza lub błąd LLM → odpowiedź z cytatu źródła.
- **Asystent rozmowy** – pytania do rozmowy, argumenty STAR, szkic uzasadnienia, IPRZ; werdykt liczy deterministyczny silnik,
  AI nie ustala poziomu oceny.
- **Analiza OSP** – dobór arkusza B/C i kryteriów dodatkowych (do akceptacji przełożonego).

## Uruchomienie lokalne

```bash
# backend
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env    # uzupełnij DATABASE_URL i LLM_API_KEY (bez DATABASE_URL: dane przykładowe w pamięci)
.venv/bin/uvicorn app.main:app --reload --port 8000

# frontend (drugi terminal) – wszystkie funkcje z prawdziwego API przez proxy Vite
cd frontend && npm ci && npm run dev:mixed     # http://localhost:5173

# albo całość jak na hostingu
docker compose up --build                       # http://localhost:8000
# Podman (Fedora): podman build -t kompas-kompetencji . && \
#   podman run --rm -p 127.0.0.1:8000:8000 --env-file backend/.env kompas-kompetencji
# (otwieraj http://127.0.0.1:8000 – rootless podman zrywa połączenia IPv6 na "localhost")
```

## Wdrożenie (Azure Container Apps)

```bash
# 1. build obrazu w Azure Container Registry (backend/.env NIE jest wysyłany – .dockerignore)
az acr build -r acrkompas2026pw -t kompas-api:<wersja> .
# 2. sekrety i zmienne (raz, albo przy zmianie)
az containerapp secret set -n kompas-api -g rg-kompas-kompetencji \
  --secrets llm-api-key=<klucz> database-url=<uri> jwt-secret=<losowy>
az containerapp update -n kompas-api -g rg-kompas-kompetencji \
  --image acrkompas2026pw.azurecr.io/kompas-api:<wersja> --min-replicas 1 \
  --set-env-vars LLM_API_KEY=secretref:llm-api-key DATABASE_URL=secretref:database-url \
    JWT_SECRET=secretref:jwt-secret LLM_MODEL_NAME=gemini-3.5-flash \
    ALLOWED_ORIGINS=https://kompas-api.calmwater-95f16d05.swedencentral.azurecontainerapps.io,http://localhost:5173
```

`--min-replicas 1` usuwa zimny start (pierwsze wejście po przerwie). Diagnostyka: `/api/v1/health`, `/api/v1/ai/status`.

Testy: `cd backend && .venv/bin/python -m pytest -q` (zawsze na danych w pamięci, bez sieci).
