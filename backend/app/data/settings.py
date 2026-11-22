from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DataSettings(BaseSettings):
    """Ustawienia warstwy danych (osobno od app.core.config)."""

    # postgres = baza Supabase przez DATABASE_URL (hosting, domyślnie, gdy DATABASE_URL jest ustawione)
    # supabase = baza Supabase przez REST (SUPABASE_URL + SUPABASE_KEY)
    # memory   = dane przykładowe w pamięci procesu (znikają po restarcie; domyślnie bez DATABASE_URL)
    DATA_BACKEND: Literal["memory", "supabase", "postgres"] | None = None

    # Połączenie Postgres (Supabase → Project Settings → Database → Connection string, URI)
    DATABASE_URL: str | None = None
    # Automatyczne, idempotentne uzupełnienie schematu (app/data/migrations/*.sql) przy starcie
    DB_AUTO_MIGRATE: bool = True

    # Alternatywa REST: adres projektu Supabase (bez /rest/v1) i klucz service_role. Nigdy nie commitować.
    SUPABASE_URL: str | None = None
    SUPABASE_KEY: str | None = None
    SUPABASE_TIMEOUT_SECONDS: float = 15.0

    # Opcjonalna „dzisiejsza data” do demonstracji i testów (statusy terminów). Domyślnie date.today().
    DATA_TODAY: date | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _strip_quotes(cls, data: Any) -> Any:
        """`--env-file` (podman/docker) i panele chmurowe przekazują cudzysłowy dosłownie: KEY="wartość"."""
        if isinstance(data, dict):
            return {
                k: (v.strip().strip("'\"").strip() if isinstance(v, str) else v)
                for k, v in data.items()
            }
        return data

    @property
    def backend(self) -> str:
        if self.DATA_BACKEND:
            return self.DATA_BACKEND
        return "postgres" if self.DATABASE_URL else "memory"


data_settings = DataSettings()


def today() -> date:
    return data_settings.DATA_TODAY or date.today()
