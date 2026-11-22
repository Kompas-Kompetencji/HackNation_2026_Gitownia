# =============================================================================
# Kompas Kompetencji – jeden obraz: frontend (React/Vite) + backend (FastAPI, RAG, PDF)
# Azure Container Apps: port 8000, start: uvicorn app.main:app (WORKDIR /app/backend)
# Zmienne (w chmurze, nie w obrazie): DATABASE_URL, JWT_SECRET, LLM_API_KEY, LLM_MODEL_NAME, ALLOWED_ORIGINS
# =============================================================================

# --- Etap 1: build frontendu ------------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Domyślnie frontend pyta backend z tego samego adresu (/api/v1); można nadpisać przy budowaniu.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL} VITE_USE_MOCKS=false VITE_REAL_API=*
RUN npm run build

# --- Etap 2: backend --------------------------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Biblioteki systemowe WeasyPrint (PDF) + czcionki z polskimi znakami
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 libharfbuzz0b \
    libcairo2 libgdk-pixbuf-2.0-0 libffi-dev shared-mime-info \
    fonts-dejavu-core fonts-liberation fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./backend/static

WORKDIR /app/backend
# Model kompetencji z oficjalnego xlsx (gdy brak w repo) i indeks RAG – ZAWSZE budowany od nowa
# ze wszystkich PDF-ów w data/raw, więc dodanie/zmiana nazwy pliku nie wymaga ręcznej przebudowy.
RUN test -f data/processed/competency_model.json || python scripts/parse_excel.py; \
    python scripts/build_rag_index.py

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
