FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Instalacja bibliotek systemowych wymaganych przez WeasyPrint (Pango, Cairo, HarfBuzz, GDK-PixBuf)
# oraz polskich czcionek szeryfowych i bezszeryfowych UTF-8 (DejaVu / Liberation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libharfbuzz0b \
    libffi-dev \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    fonts-dejavu-core \
    fonts-liberation \
    fontconfig \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Upewnienie się, że pakiety mają pliki __init__.py oraz że competency_model.json
# jest zawsze gotowy w obrazie przed startem aplikacji
RUN touch app/__init__.py app/core/__init__.py app/schemas/__init__.py app/services/__init__.py && \
    if [ ! -f data/processed/competency_model.json ]; then \
        python scripts/parse_excel.py --seed-from-spec; \
    fi

EXPOSE 8000

# Użycie powłoki sh -c pozwala dynamicznie odczytać zmienną $PORT na Render / Railway / Cloud Run
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]