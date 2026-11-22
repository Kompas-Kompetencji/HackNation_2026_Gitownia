"""Przypomnienia od kadr dla przełożonych: POST/GET /reminders (pamięć) i odporność repozytorium Supabase."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import httpx
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.data import settings as data_settings_module  # noqa: E402
from app.data.factory import get_data_service  # noqa: E402
from app.data.memory_repo import MemoryRepository  # noqa: E402
from app.data.postgres_repo import OPTIONAL_MIGRATIONS  # noqa: E402
from app.data.service import DataService  # noqa: E402
from app.data.supabase_repo import SupabaseRepository  # noqa: E402
from app.main import app  # noqa: E402
from tests.test_supabase_adapter import FakePostgrest, existing_tables  # noqa: E402

API = "/api/v1"
SUP1 = {"X-User-Id": "sup-001"}
SUP2 = {"X-User-Id": "sup-002"}
HR = {"X-User-Id": "hr-001"}


def make_client(service: DataService) -> TestClient:
    app.dependency_overrides[get_data_service] = lambda: service
    return TestClient(app)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    yield make_client(DataService(MemoryRepository()))
    app.dependency_overrides.clear()


def send(client: TestClient, **body) -> httpx.Response:
    payload = {"supervisor_id": "sup-001", "employee_ids": ["emp-001"], "message": "Proszę o ocenę."} | body
    return client.post(f"{API}/reminders", headers=HR, json=payload)


def test_hr_sends_and_lists_reminders(client: TestClient) -> None:
    r = send(client, employee_ids=["emp-001", "emp-002"], message="  Przypominamy o terminie oceny.  ")
    assert r.status_code == 201
    body = r.json()
    assert body["supervisor_id"] == "sup-001"
    assert body["supervisor_name"] == "Halina Zawadzka-Nowicka"
    assert body["author_id"] == "hr-001"
    assert body["author_name"]
    assert body["employee_ids"] == ["emp-001", "emp-002"]
    assert body["employee_names"] == ["Joanna Pietrzyk", "Grzegorz Łuczak"]
    assert body["message"] == "Przypominamy o terminie oceny."
    assert body["created_at"]

    assert send(client, supervisor_id="sup-002", employee_ids=["emp-004"]).status_code == 201
    # ogólne przypomnienie bez pracowników
    assert send(client, employee_ids=[]).status_code == 201

    listed = client.get(f"{API}/reminders", headers=HR).json()
    assert len(listed) == 3
    stamps = [r["created_at"] for r in listed]
    assert stamps == sorted(stamps, reverse=True)


def test_supervisor_sees_only_own_reminders(client: TestClient) -> None:
    send(client)
    send(client, supervisor_id="sup-002", employee_ids=["emp-004"], message="Dla drugiego przełożonego.")
    own = client.get(f"{API}/reminders", headers=SUP1).json()
    assert [r["supervisor_id"] for r in own] == ["sup-001"]
    other = client.get(f"{API}/reminders", headers=SUP2).json()
    assert [r["message"] for r in other] == ["Dla drugiego przełożonego."]


def test_supervisor_cannot_send_reminders(client: TestClient) -> None:
    r = client.post(f"{API}/reminders", headers=SUP1, json={"supervisor_id": "sup-001", "employee_ids": [], "message": "x"})
    assert r.status_code == 403
    assert "kadry" in r.json()["detail"]


def test_reminders_require_login(client: TestClient) -> None:
    assert client.get(f"{API}/reminders").status_code == 401


@pytest.mark.parametrize(
    ("body", "fragment"),
    [
        ({"supervisor_id": "sup-999"}, "Nie znaleziono przełożonego"),
        ({"supervisor_id": "hr-001"}, "Nie znaleziono przełożonego"),
        ({"employee_ids": ["emp-999"]}, "Nie znaleziono pracownika"),
        ({"employee_ids": ["emp-004"]}, "nie podlega przełożonemu"),
        ({"message": "   "}, "nie może być pusta"),
        ({"message": "x" * 1001}, "najwyżej 1000 znaków"),
        ({"message": "PESEL 85010112345 do sprawdzenia"}, "PESEL"),
    ],
)
def test_validation_errors_in_polish(client: TestClient, body: dict, fragment: str) -> None:
    r = send(client, **body)
    assert r.status_code == 422
    assert fragment in r.json()["detail"]
    assert client.get(f"{API}/reminders", headers=HR).json() == []


def test_message_of_exactly_1000_chars_is_accepted(client: TestClient) -> None:
    assert send(client, message="y" * 1000).status_code == 201


def test_duplicate_employee_ids_are_collapsed(client: TestClient) -> None:
    assert send(client, employee_ids=["emp-001", "emp-001"]).json()["employee_ids"] == ["emp-001"]


# --- Supabase / Postgres: zapis i odczyt na atrapie, awaria nie psuje reszty aplikacji ---------


def supabase_service(tables: dict) -> DataService:
    fake = FakePostgrest(tables)
    return DataService(SupabaseRepository(url="https://przyklad.supabase.co", key="k", transport=httpx.MockTransport(fake)))


def test_supabase_reminders_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    tables = existing_tables() | {"reminders": []}
    client = make_client(supabase_service(tables))
    try:
        r = client.post(
            f"{API}/reminders", headers={"X-User-Id": "2"}, json={"supervisor_id": "1", "employee_ids": ["1", "2"], "message": "Termin."}
        )
        assert r.status_code == 201, r.text
        assert tables["reminders"][0]["employee_ids"] == [1, 2]
        assert tables["reminders"][0]["supervisor_id"] == 1
        listed = client.get(f"{API}/reminders", headers={"X-User-Id": "1"}).json()
        assert listed[0]["employee_names"] == ["Jan Zieliński", "Ewa Mała"]
    finally:
        app.dependency_overrides.clear()


def test_supabase_reminders_failure_is_readable_and_isolated(monkeypatch: pytest.MonkeyPatch) -> None:
    """Brak tabeli reminders (np. migracja nie przeszła): 503 z komunikatem, reszta tras działa."""
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    fake = FakePostgrest(existing_tables())
    original = fake.__call__

    def broken(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/reminders"):
            return httpx.Response(404, json={"message": 'relation "public.reminders" does not exist'})
        return original(request)

    service = DataService(SupabaseRepository(url="https://przyklad.supabase.co", key="k", transport=httpx.MockTransport(broken)))
    client = make_client(service)
    try:
        listed = client.get(f"{API}/reminders", headers={"X-User-Id": "2"})
        assert listed.status_code == 503
        assert "Nie udało się wczytać przypomnień" in listed.json()["detail"]
        sent = client.post(
            f"{API}/reminders", headers={"X-User-Id": "2"}, json={"supervisor_id": "1", "employee_ids": [], "message": "Termin."}
        )
        assert sent.status_code == 503
        assert "Nie udało się zapisać przypomnienia" in sent.json()["detail"]
        # reszta aplikacji działa
        assert client.get(f"{API}/employees", headers={"X-User-Id": "2"}).status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_reminders_migration_is_optional() -> None:
    migration = BACKEND_ROOT / "app" / "data" / "migrations" / "003_reminders.sql"
    assert migration.is_file()
    assert "003_reminders.sql" in OPTIONAL_MIGRATIONS
    sql = migration.read_text(encoding="utf-8").lower()
    assert "create table if not exists public.reminders" in sql
    assert "drop " not in sql and "alter table public.employees" not in sql
