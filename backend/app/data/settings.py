from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class DataSettings(BaseSettings):
    """Ustawienia warstwy danych (osobno od app.core.config, żeby nie zmieniać istniejących ustawień)."""

    # memory = dane w pamięci procesu (znikają po restarcie), supabase = istniejąca baza Supabase
    DATA_BACKEND: Literal["memory", "supabase"] = "memory"

    # Adres projektu Supabase, np. https://abcd1234.supabase.co (bez /rest/v1)
    SUPABASE_URL: str | None = None
    # Klucz service_role albo anon z odpowiednimi politykami RLS. Nigdy nie commitować.
    SUPABASE_KEY: str | None = None
    SUPABASE_TIMEOUT_SECONDS: float = 15.0

    # Opcjonalna „dzisiejsza data” do demonstracji i testów (statusy terminów). Domyślnie date.today().
    DATA_TODAY: date | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")


data_settings = DataSettings()


def today() -> date:
    return data_settings.DATA_TODAY or date.today()
