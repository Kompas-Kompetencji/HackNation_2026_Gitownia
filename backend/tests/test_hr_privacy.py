"""Kadry monitorują statusy i terminy, ale nie widzą treści ocen (minimalizacja danych osobowych)."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.data import settings as data_settings_module  # noqa: E402
from app.data.factory import get_data_service  # noqa: E402
from app.data.memory_repo import MemoryRepository  # noqa: E402
from app.data.service import DataService  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"
SUP1 = {"X-User-Id": "sup-001"}
HR = {"X-User-Id": "hr-001"}

# Pola, które kadry mogą zobaczyć (pracownik, komórka, przełożony, rodzaj oceny, status, terminy, wynik).
HR_EMPLOYEE_FIELDS = {
    "id",
    "supervisor_id",
    "supervisor_name",
    "first_name",
    "last_name",
    "organizational_unit",
    "assessment_kind",
    "contract_end_date",
    "last_assessment_date",
    "last_assessment_result",
    "next_assessment_due",
    "status",
}
SUMMARY_FIELDS = {
    "id",
    "employee_id",
    "employee_name",
    "supervisor_name",
    "kind",
    "form",
    "status",
    "started_at",
    "completed_at",
    "due_date",
    "result",
}
CONTENT_FIELDS = {
    "answers",
    "decisions",
    "justification_draft",
    "evaluation",
    "mean",
    "suggested_levels",
    "stored_mean",
    "position_title",
    "exam_status",
}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    service = DataService(MemoryRepository())
    app.dependency_overrides[get_data_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_supervisor_still_reads_assessment_and_pdf(client: TestClient) -> None:
    detail = client.get(f"{API}/assessments/as-102", headers=SUP1)
    assert detail.status_code == 200
    assert detail.json()["decisions"]
    pdf = client.get(f"{API}/assessments/as-102/pdf", headers=SUP1)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"


@pytest.mark.parametrize("path", ["/assessments/as-102", "/assessments/as-102/pdf", "/assessments/as-001"])
def test_hr_cannot_read_assessment_content(client: TestClient, path: str) -> None:
    r = client.get(f"{API}{path}", headers=HR)
    assert r.status_code == 403
    assert "Kadry nie mają dostępu do treści ocen" in r.json()["detail"]


def test_hr_missing_assessment_is_still_404(client: TestClient) -> None:
    assert client.get(f"{API}/assessments/as-xxx", headers=HR).status_code == 404


def test_hr_cannot_read_notes_or_job_descriptions(client: TestClient) -> None:
    notes = client.get(f"{API}/employees/emp-001/notes", headers=HR)
    assert notes.status_code == 403
    assert "notatek" in notes.json()["detail"]
    docs = client.get(f"{API}/employees/emp-001/job-descriptions", headers=HR)
    assert docs.status_code == 403
    assert "opisów stanowiska" in docs.json()["detail"]
    # przełożony bez zmian
    assert client.get(f"{API}/employees/emp-001/notes", headers=SUP1).status_code == 200
    assert client.get(f"{API}/employees/emp-001/job-descriptions", headers=SUP1).status_code == 200


def test_hr_employee_list_has_only_monitoring_fields(client: TestClient) -> None:
    employees = client.get(f"{API}/employees", headers=HR).json()
    assert len(employees) == 7
    for e in employees:
        assert set(e) == HR_EMPLOYEE_FIELDS
        assert e["supervisor_name"]
    one = client.get(f"{API}/employees/emp-001", headers=HR).json()
    assert set(one) == HR_EMPLOYEE_FIELDS


def test_supervisor_employee_view_unchanged(client: TestClient) -> None:
    e = client.get(f"{API}/employees/emp-001", headers=SUP1).json()
    assert {"position_title", "hire_date", "contract_type", "form"} <= set(e)
    assert "supervisor_name" not in e


def test_hr_assessment_list_and_calendar_without_content(client: TestClient) -> None:
    summaries = client.get(f"{API}/assessments", headers=HR).json()
    assert summaries
    for s in summaries:
        assert set(s) == SUMMARY_FIELDS
        assert not (set(s) & CONTENT_FIELDS)
    events = client.get(f"{API}/calendar", headers=HR, params={"from": "2026-01-01", "to": "2027-01-31"}).json()
    assert events
    for ev in events:
        assert not (set(ev) & CONTENT_FIELDS)
