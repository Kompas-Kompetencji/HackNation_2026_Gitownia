from __future__ import annotations

from functools import lru_cache

from app.data.repository import DataRepository
from app.data.service import DataService
from app.data.settings import data_settings


def build_repository() -> DataRepository:
    """DATA_BACKEND=postgres (domyślnie przy DATABASE_URL), supabase (REST) albo memory."""
    backend = data_settings.backend
    if backend == "postgres":
        from app.data.postgres_repo import PostgresRepository

        if not data_settings.DATABASE_URL:
            raise RuntimeError("DATA_BACKEND=postgres wymaga zmiennej DATABASE_URL.")
        return PostgresRepository(
            dsn=data_settings.DATABASE_URL,
            auto_migrate=data_settings.DB_AUTO_MIGRATE,
            timeout=data_settings.SUPABASE_TIMEOUT_SECONDS,
        )
    if backend == "supabase":
        from app.data.supabase_repo import SupabaseRepository

        if not data_settings.SUPABASE_URL or not data_settings.SUPABASE_KEY:
            raise RuntimeError("DATA_BACKEND=supabase wymaga zmiennych SUPABASE_URL i SUPABASE_KEY.")
        return SupabaseRepository(
            url=data_settings.SUPABASE_URL,
            key=data_settings.SUPABASE_KEY,
            timeout=data_settings.SUPABASE_TIMEOUT_SECONDS,
        )
    from app.data.memory_repo import MemoryRepository

    return MemoryRepository()


@lru_cache(maxsize=1)
def get_data_service() -> DataService:
    """Jedna usługa na proces (wersja pamięciowa trzyma dane między zapytaniami)."""
    return DataService(build_repository())
