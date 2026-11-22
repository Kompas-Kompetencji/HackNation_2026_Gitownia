"""Wnioski rozwojowe w arkuszu (dev_maks): szkic, zakończenie, PDF, limit, osłonięty zapis w Postgresie."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Any

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.scoring_engine import evaluate  # noqa: E402
from app.data import settings as data_settings_module  # noqa: E402
from app.data.factory import get_data_service  # noqa: E402
from app.data.memory_repo import MemoryRepository  # noqa: E402
from app.data.postgres_repo import OPTIONAL_MIGRATIONS, PostgresRepository  # noqa: E402
from app.data.schemas import AssessmentRecord, CriterionDecision  # noqa: E402
from app.data.service import DataService  # noqa: E402
from app.main import app  # noqa: E402
from app.services.pdf_generator import render_evaluation_html  # noqa: E402

API = "/api/v1"
SUP1 = {"X-User-Id": "sup-001"}
SUP2 = {"X-User-Id": "sup-002"}
ELEMENTS = ["C01", "C03", "C04", "C02", "C06"]
TEXT = "Szkolenie z legislacji w I półroczu; mentoring przy projektach ustaw."


@pytest.fixture()
def service(monkeypatch: pytest.MonkeyPatch) -> DataService:
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    return DataService(MemoryRepository())


@pytest.fixture()
def client(service: DataService):
    app.dependency_overrides[get_data_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.clear()


def first_payload(levels: list[int], conclusions: str | None, exam: str = "passed", justification: str = "") -> dict:
    return {
        "form": "first",
        "answers": [],
        "decisions": [
            {"competency_id": cid, "is_mandatory": True, "selected_level": lvl, "decision_note": ""}
            for cid, lvl in zip(ELEMENTS, levels)
        ],
        "justification_draft": justification,
        "last_step": "podsumowanie",
        "exam_status": exam,
        "report_on_time": True,
        "initial_interview_date": "2026-11-30",
        "evaluation_interview_date": "2027-07-20",
        "development_conclusions": conclusions,
    }


def periodic_payload(conclusions: str | None) -> dict:
    return {
        "form": "C",
        "additional_competency_ids": [],
        "answers": [],
        "decisions": [],
        "justification_draft": "",
        "last_step": "podsumowanie",
        "development_conclusions": conclusions,
    }


def start_first(client: TestClient) -> str:
    r = client.post(f"{API}/assessments", headers=SUP2, json={"employee_id": "emp-004", "kind": "first"})
    assert r.status_code == 201
    return r.json()["id"]


def test_periodic_draft_stores_conclusions(client: TestClient) -> None:
    r = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_payload(f"  {TEXT}  "))
    assert r.status_code == 200, r.text
    assert r.json()["development_conclusions"] == TEXT
    assert client.get(f"{API}/assessments/as-001", headers=SUP1).json()["development_conclusions"] == TEXT
    # puste pole = brak wniosków
    cleared = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_payload("   "))
    assert cleared.json()["development_conclusions"] is None


def test_conclusions_limit_2000(client: TestClient) -> None:
    ok = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_payload("a" * 2000))
    assert ok.status_code == 200
    too_long = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_payload("a" * 2001))
    assert too_long.status_code == 422


def test_periodic_pdf_has_iprz_conclusions(client: TestClient, service: DataService) -> None:
    client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_payload(TEXT))
    record = service.repo.get_assessment("as-001")
    record = record.model_copy(
        update={"decisions": [CriterionDecision(competency_id="C01", is_mandatory=True, selected_level=5)]}
    )
    employee = service.repo.get_employee(record.employee_id)
    users = {u.id: u for u in service.repo.list_users()}
    request = service._evaluation_request(record, employee, users)
    assert request.wnioski_iprz == TEXT
    assert request.wnioski_rozwojowe_pierwsza_ocena is None
    html = render_evaluation_html(request, evaluate(request))
    assert "WNIOSKI DOTYCZĄCE INDYWIDUALNEGO PROGRAMU ROZWOJU ZAWODOWEGO" in html
    assert TEXT in html
    assert client.get(f"{API}/assessments/as-001/pdf", headers=SUP1).status_code == 200


def test_first_eval_complete_with_conclusions_and_pdf(client: TestClient, service: DataService) -> None:
    aid = start_first(client)
    r = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=first_payload([7, 5, 5, 5, 5], TEXT))
    assert r.status_code == 200, r.text
    assert r.json()["development_conclusions"] == TEXT
    record = service.repo.get_assessment(aid)
    employee = service.repo.get_employee(record.employee_id)
    users = {u.id: u for u in service.repo.list_users()}
    request = service._evaluation_request(record, employee, users)
    assert request.wnioski_rozwojowe_pierwsza_ocena == TEXT
    assert request.wnioski_iprz is None
    html = render_evaluation_html(request, evaluate(request))
    assert "WNIOSKI DOTYCZĄCE ROZWOJU ZAWODOWEGO OCENIANEGO" in html
    assert TEXT in html
    assert client.get(f"{API}/assessments/{aid}/pdf", headers=SUP2).status_code == 200


def test_first_eval_negative_rejects_conclusions(client: TestClient) -> None:
    """§ 10 ust. 6 rozporządzenia z 2015 r.: przy ocenie negatywnej wniosków się nie sporządza (reguła silnika)."""
    aid = start_first(client)
    body = first_payload([7, 7, 7, 7, 7], TEXT, exam="failed", justification="Egzamin niezdany.")
    r = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=body)
    assert r.status_code == 422
    assert "Wniosków dotyczących rozwoju zawodowego" in r.json()["detail"]
    ok = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json={**body, "development_conclusions": ""})
    assert ok.status_code == 200, ok.text


# --- Postgres/Supabase: osobne, osłonięte polecenie zapisu kolumny development_conclusions ---------


class FakeCursor:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.description = [("id",)] if rows else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


class FakeDb:
    """Atrapa bazy bez kolumny development_conclusions (skrypt 004 nieuruchomiony)."""

    def __init__(self) -> None:
        self.statements: list[str] = []
        self.row = {
            "id": 9, "employee_id": 1, "supervisor_id": 1, "eval_path": "OKRESOWA", "sheet_type": "C",
            "status": "ROBOCZA", "due_date": date(2027, 3, 1), "justification": None, "last_step": None,
        }

    def connection(self) -> "FakeDb":
        return self

    def __enter__(self) -> "FakeDb":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def execute(self, sql: str, values: list[Any] | None = None) -> FakeCursor:
        self.statements.append(sql)
        if '"development_conclusions"' in sql:
            raise RuntimeError('column "development_conclusions" does not exist')
        if sql.startswith('update public."evaluations"'):
            self.row = {**self.row, "last_step": "podsumowanie"}
            return FakeCursor([self.row])
        if sql.startswith('select * from public."evaluations"'):
            return FakeCursor([self.row])
        return FakeCursor([])


def test_postgres_missing_column_does_not_break_save(caplog: pytest.LogCaptureFixture) -> None:
    repo = PostgresRepository.__new__(PostgresRepository)
    db = FakeDb()
    repo._pool = db  # type: ignore[attr-defined]
    record = AssessmentRecord(
        id="9", employee_id="1", kind="periodic", form="C", status="draft", due_date=date(2027, 3, 1),
        last_step="podsumowanie", development_conclusions=TEXT,
    )
    with caplog.at_level("ERROR"):
        saved = repo.save_assessment(record)
    assert saved.id == "9" and saved.last_step == "podsumowanie"
    assert any('"development_conclusions"' in s for s in db.statements)
    assert "Nie zapisano wniosków rozwojowych" in caplog.text


def test_postgres_reads_conclusions_column() -> None:
    row = {"id": 1, "employee_id": 2, "sheet_type": "B", "eval_path": "OKRESOWA", "status": "ROBOCZA",
           "due_date": "2027-03-01", "development_conclusions": TEXT}
    assert PostgresRepository._assessment(row, [], []).development_conclusions == TEXT
    row.pop("development_conclusions")
    assert PostgresRepository._assessment(row, [], []).development_conclusions is None


def test_migration_004_is_additive_and_optional() -> None:
    copy = BACKEND_ROOT / "app" / "data" / "migrations" / "004_development_conclusions.sql"
    script = BACKEND_ROOT.parent / "supabase" / "schema-additions-004.sql"
    expected = "alter table public.evaluations add column if not exists development_conclusions text"
    for path in (copy, script):
        sql = path.read_text(encoding="utf-8").lower()
        assert expected in sql
        assert "drop " not in sql
    assert "004_development_conclusions.sql" in OPTIONAL_MIGRATIONS
