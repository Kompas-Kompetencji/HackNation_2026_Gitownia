"""Testy zawsze na danych w pamięci: nigdy nie łączą się z bazą z backend/.env."""

import os

os.environ["DATA_BACKEND"] = "memory"
os.environ.pop("DATABASE_URL", None)
os.environ["LLM_API_KEY"] = ""
