# Kompas Kompetencji – Moduł M1 (Silnik Reguł Prawnych, Parsery i Generator PDF)

Niezależny, bezbazodanowy backend REST API (Python 3.11+, FastAPI, Pydantic v2) realizujący 100% deterministycznej logiki prawnej dla **Pierwszej oceny** (Dz.U. 2015 poz. 1144) oraz **Oceny okresowej** (Dz.U. 2016 poz. 470) w służbie cywilnej.

---

## 1. Uruchomienie lokalne (czysty Python)

```bash
cd backend
python -m venv .venv

# Aktywacja środowiska:
# Linux / macOS:
source .venv/bin/activate
# Windows (PowerShell):
.venv\Scripts\Activate.ps1

pip install -r requirements.txt

# Wygenerowanie pliku data/processed/competency_model.json (14 kompetencji, 49 wskaźników, 5 poziomów):
python scripts/parse_excel.py --seed-from-spec

# Uruchomienie testów jednostkowych reguł prawnych:
pytest tests/test_backend_rules.py -v

# Start serwera deweloperskiego (Swagger UI pod http://localhost:8000/docs):
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000