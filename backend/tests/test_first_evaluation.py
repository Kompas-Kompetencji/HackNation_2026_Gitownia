"""Pierwsza ocena przez trasy danych (dev_maks): zapis pól, skala 3/5/7, wynik, PDF, odporność Postgresa."""

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

from app.data import settings as data_settings_module  # noqa: E402
from app.data.factory import get_data_service  # noqa: E402
from app.data.memory_repo import MemoryRepository  # noqa: E402
from app.data.postgres_repo import PostgresRepository  # noqa: E402
from app.data.schemas import AssessmentRecord, CriterionDecision  # noqa: E402
from app.data.service import DataService  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.models import TriStateOption  # noqa: E402
from app.services.pdf_generator import render_evaluation_html  # noqa: E402
from app.core.scoring_engine import evaluate  # noqa: E402

API = "/api/v1"
SUP2 = {"X-User-Id": "sup-002"}  # przełożony pracownika emp-004 (pierwsza ocena, ocena as-004)
SUP1 = {"X-User-Id": "sup-001"}
ELEMENTS = ["C01", "C03", "C04", "C02", "C06"]  # rzetelność, wiedza, organizacja, komunikacja, współpraca


@pytest.fixture()
def service(monkeypatch: pytest.MonkeyPatch) -> DataService:
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    return DataService(MemoryRepository())


@pytest.fixture()
def client(service: DataService):
    app.dependency_overrides[get_data_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.clear()


def payload(levels: list[int | None], *, exam: str | None = "passed", report: bool | None = True,
            justification: str = "", answers: list[dict] | None = None) -> dict:
    return {
        "form": "first",
        "additional_competency_ids": None,
        "answers": answers or [],
        "decisions": [
            {"competency_id": cid, "is_mandatory": True, "selected_level": lvl, "decision_note": ""}
            for cid, lvl in zip(ELEMENTS, levels)
        ],
        "justification_draft": justification,
        "last_step": "podsumowanie",
        "exam_status": exam,
        "report_on_time": report,
        "initial_interview_date": "2026-11-30",
        "evaluation_interview_date": "2027-07-20",
    }


def start(client: TestClient) -> str:
    r = client.post(f"{API}/assessments", headers=SUP2, json={"employee_id": "emp-004", "kind": "first"})
    assert r.status_code == 201
    return r.json()["id"]


def test_draft_stores_first_eval_fields(client: TestClient) -> None:
    aid = start(client)
    r = client.put(f"{API}/assessments/{aid}/draft", headers=SUP2, json=payload([7, None, None, None, None], exam=None))
    assert r.status_code == 200
    body = r.json()
    assert body["exam_status"] is None
    assert body["report_on_time"] is True
    assert body["initial_interview_date"] == "2026-11-30"
    assert body["evaluation_interview_date"] == "2027-07-20"
    again = client.get(f"{API}/assessments/{aid}", headers=SUP2).json()
    assert again["initial_interview_date"] == "2026-11-30"


def test_complete_positive(client: TestClient) -> None:
    aid = start(client)
    r = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload([7, 5, 5, 5, 3]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed"
    assert body["result"] == "positive"
    assert body["evaluation"]["mean"] == 5.0
    assert body["exam_status"] == "passed"


@pytest.mark.parametrize(
    ("levels", "exam", "reason_fragment"),
    [
        ([7, 7, 7, 7, 7], "failed", "egzaminu"),
        ([5, 5, 5, 5, 3], "passed", "niższą niż wymagane 5,00"),
        ([7, 7, 7, 3, 3], "passed", "więcej niż jedną ocenę"),
    ],
)
def test_complete_negative(client: TestClient, levels: list[int], exam: str, reason_fragment: str) -> None:
    aid = start(client)
    without = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload(levels, exam=exam))
    assert without.status_code == 422
    assert "Uzasadnienie" in without.json()["detail"]
    r = client.post(
        f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload(levels, exam=exam, justification="Uzasadnienie oceny.")
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["result"] == "negative"
    assert any(reason_fragment in reason for reason in body["evaluation"]["reasons"])


def test_exempt_exam_counts_as_passed(client: TestClient) -> None:
    aid = start(client)
    r = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload([5, 5, 5, 5, 5], exam="exempt"))
    assert r.status_code == 200
    assert r.json()["result"] == "positive"


@pytest.mark.parametrize("bad", [1, 9])
def test_scale_outside_3_5_7_rejected(client: TestClient, bad: int) -> None:
    aid = start(client)
    draft = client.put(f"{API}/assessments/{aid}/draft", headers=SUP2, json=payload([bad, 5, 5, 5, 5]))
    assert draft.status_code == 422
    assert "3, 5 albo 7" in draft.json()["detail"]
    done = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload([bad, 5, 5, 5, 5]))
    assert done.status_code == 422


def test_all_no_basis_blocks_completion(client: TestClient) -> None:
    aid = start(client)
    answers = [
        {"competency_id": "C01", "indicator_id": "C01_I01", "selected_level": None, "star_note": None},
        {"competency_id": "C01", "indicator_id": "C01_I02", "selected_level": None, "star_note": None},
    ]
    r = client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload([5, 5, 5, 5, 5], answers=answers))
    assert r.status_code == 422
    assert "brak podstaw do oceny" in r.json()["detail"]


def test_pdf_has_first_eval_fields(client: TestClient, service: DataService) -> None:
    aid = start(client)
    assert client.post(f"{API}/assessments/{aid}/complete", headers=SUP2, json=payload([7, 5, 5, 5, 5])).status_code == 200
    pdf = client.get(f"{API}/assessments/{aid}/pdf", headers=SUP2)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"

    record = service.repo.get_assessment(aid)
    employee = service.repo.get_employee(record.employee_id)
    users = {u.id: u for u in service.repo.list_users()}
    request = service._evaluation_request(record, employee, users)
    assert request.egzamin_sluzba_przygotowawcza == TriStateOption.TAK
    assert request.sprawozdanie_zlozone_w_terminie is True
    assert request.data_rozmowy_wstepnej == date(2026, 11, 30)
    assert request.data_rozmowy_oceniajacej == date(2027, 7, 20)
    assert request.termin_zlozenia_sprawozdania_od is not None
    assert request.okres_oceny_do is not None
    html = render_evaluation_html(request, evaluate(request))
    assert "30.11.2026" in html
    assert "20.07.2027" in html


def test_periodic_response_unchanged(client: TestClient) -> None:
    detail = client.get(f"{API}/assessments/as-001", headers=SUP1).json()
    for key in ("exam_status", "report_on_time", "initial_interview_date", "evaluation_interview_date"):
        assert key not in detail
    body = {
        "form": "C",
        "additional_competency_ids": [],
        "answers": [],
        "decisions": [],
        "justification_draft": "",
        "last_step": None,
        "exam_status": "failed",  # ignorowane dla arkusza C
    }
    saved = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=body)
    assert saved.status_code == 200
    assert "exam_status" not in saved.json()


# --- Postgres: awaria osobnego zapisu pól pierwszej oceny nie psuje zapisu oceny ------------------


class FakeCursor:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.description = [("id",)] if rows else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


class FakeConnection:
    def __init__(self, db: "FakeDb") -> None:
        self.db = db

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def execute(self, sql: str, values: list[Any] | None = None) -> FakeCursor:
        return self.db.execute(sql, values or [])


class FakeDb:
    """Atrapa połączenia: jedna ocena; polecenie z kolumną exam_passed kończy się błędem bazy."""

    def __init__(self) -> None:
        self.statements: list[str] = []
        self.row = {
            "id": 7, "employee_id": 4, "supervisor_id": 2, "eval_path": "PIERWSZA", "sheet_type": "PIERWSZA",
            "status": "ROBOCZA", "due_date": date(2027, 10, 15), "justification": None, "last_step": None,
        }

    def connection(self) -> FakeConnection:
        return FakeConnection(self)

    def check(self) -> None:
        return None

    def execute(self, sql: str, values: list[Any]) -> FakeCursor:
        self.statements.append(sql)
        if '"exam_passed"' in sql:
            raise RuntimeError('column "exam_passed" is of type boolean')
        if sql.startswith('update public."evaluations"'):
            self.row = {**self.row, "last_step": "podsumowanie"}
            return FakeCursor([self.row])
        if sql.startswith('select * from public."evaluations"'):
            return FakeCursor([self.row])
        return FakeCursor([])


def test_postgres_first_eval_fields_failure_does_not_break_save(caplog: pytest.LogCaptureFixture) -> None:
    repo = PostgresRepository.__new__(PostgresRepository)
    db = FakeDb()
    repo._pool = db  # type: ignore[attr-defined]
    record = AssessmentRecord(
        id="7", employee_id="4", kind="first", form="first", status="draft", due_date=date(2027, 10, 15),
        decisions=[CriterionDecision(competency_id="C01", is_mandatory=True, selected_level=5)],
        last_step="podsumowanie", exam_status="passed", report_on_time=True, initial_interview_date=date(2026, 11, 30),
    )
    with caplog.at_level("ERROR"):
        saved = repo.save_assessment(record)
    assert saved.id == "7"
    assert saved.last_step == "podsumowanie"
    assert any('"exam_passed"' in s for s in db.statements)
    assert "Nie zapisano pól pierwszej oceny" in caplog.text


def test_postgres_reads_first_eval_columns() -> None:
    record = PostgresRepository._assessment(
        {"id": 1, "employee_id": 2, "sheet_type": "PIERWSZA", "eval_path": "PIERWSZA", "status": "ROBOCZA",
         "due_date": "2027-10-15", "exam_passed": "NIE_DOTYCZY", "report_on_time": False, "initial_talk_date": "2026-11-30"},
        [], [],
    )
    assert (record.exam_status, record.report_on_time, record.initial_interview_date) == ("exempt", False, date(2026, 11, 30))
    missing = PostgresRepository._assessment(
        {"id": 1, "employee_id": 2, "sheet_type": "PIERWSZA", "status": "ROBOCZA", "due_date": "2027-10-15", "exam_passed": "?"},
        [], [],
    )
    assert (missing.exam_status, missing.report_on_time, missing.initial_interview_date) == (None, None, None)
