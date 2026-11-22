"""Testy zawsze na danych w pamięci: nigdy nie łączą się z bazą z backend/.env."""

import os

os.environ["DATA_BACKEND"] = "memory"
os.environ["AUTH_ALLOW_DEMO_HEADER"] = "true"  # testy tras danych używają nagłówka X-User-Id
os.environ["JWT_SECRET"] = "testowy-sekret-do-podpisu-tokenow"
os.environ.pop("DATABASE_URL", None)
os.environ["LLM_API_KEY"] = ""
