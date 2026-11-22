"""
Testy adapterów repozytorium Supabase na atrapie PostgREST (httpx.MockTransport).
Nie łączą się z żadną bazą; sprawdzają tłumaczenie kolumn i wartości w obie strony.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl

import httpx
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.data import settings as data_settings_module  # noqa: E402
from app.data.schemas import AssessmentDraftInput, CreateAssessmentInput, CreateEmployeeInput  # noqa: E402
from app.data.service import DataService  # noqa: E402
from app.data.supabase_repo import SupabaseRepository  # noqa: E402


class FakePostgrest:
    """Minimalna atrapa PostgREST: select z filtrami eq/in/not.in, insert, upsert, patch, delete."""

    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self.tables = tables
        self.next_id = {name: max((r["id"] for r in rows), default=0) + 1 for name, rows in tables.items()}

    @staticmethod
    def _match(row: dict[str, Any], filters: list[tuple[str, str]]) -> bool:
        for column, expr in filters:
            value = row.get(column)
            if expr.startswith("eq."):
                if str(value) != expr[3:]:
                    return False
            elif expr.startswith("in.("):
                if str(value) not in expr[4:-1].split(","):
                    return False
            elif expr.startswith("not.in.("):
                if str(value) in expr[8:-1].split(","):
                    return False
        return True

    def __call__(self, request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        rows = self.tables.setdefault(table, [])
        self.next_id.setdefault(table, 1)
        params = parse_qsl(request.url.query.decode())
        filters = [(k, v) for k, v in params if k not in {"select", "order", "limit", "on_conflict"}]
        options = dict(params)

        if request.method == "GET":
            found = [r for r in rows if self._match(r, filters)]
            if "order" in options:
                column, _, direction = options["order"].partition(".")
                found.sort(key=lambda r: (r.get(column) is None, r.get(column)), reverse=direction == "desc")
            if "limit" in options:
                found = found[: int(options["limit"])]
            return httpx.Response(200, json=found)

        body = json.loads(request.content) if request.content else None
        if request.method == "POST":
            items = body if isinstance(body, list) else [body]
            conflict = options.get("on_conflict", "").split(",") if "merge-duplicates" in request.headers.get("prefer", "") else []
            created = []
            for item in items:
                existing = next((r for r in rows if conflict and all(r.get(c) == item.get(c) for c in conflict)), None)
                if existing:
                    existing.update(item)
                    created.append(existing)
                    continue
                row = {"id": self.next_id[table], **item}
                self.next_id[table] += 1
                rows.append(row)
                created.append(row)
            return httpx.Response(201, json=created)
        if request.method == "PATCH":
            changed = [r for r in rows if self._match(r, filters)]
            for r in changed:
                r.update(body)
            return httpx.Response(200, json=changed)
        if request.method == "DELETE":
            self.tables[table] = [r for r in rows if not self._match(r, filters)]
            return httpx.Response(204)
        return httpx.Response(405)


def existing_tables() -> dict[str, list[dict[str, Any]]]:
    """Wiersze w kształcie istniejących tabel Supabase (wartości po polsku, id liczbowe)."""
    return {
        "users": [
            {"id": 1, "email": "a@urzad.example", "full_name": "Anna Kowalska", "role": "PRZELOZONY", "department": "Departament Kadr", "position": "Dyrektor"},
            {"id": 2, "email": "k@urzad.example", "full_name": "Karol Nowak", "role": "HR_ADMIN", "department": "Biuro Kadr", "position": "Specjalista"},
        ],
        "employees": [
            {"id": 1, "first_name": "Jan", "last_name": "Zieliński", "department": "Departament Kadr", "unit": "Wydział A",
             "position": "Specjalista", "osp_symbol": None, "employment_type": "CZAS_NIEOKRESLONY", "civil_service_degree": None,
             "hire_date": "2020-01-15", "eval_path": "OKRESOWA", "sheet_type": "C", "status": "DO_OCENY", "supervisor_id": 1},
            {"id": 2, "first_name": "Ewa", "last_name": "Mała", "department": "Departament Kadr", "unit": None,
             "position": "Referent", "osp_symbol": None, "employment_type": "CZAS_OKRESLONY_12M", "civil_service_degree": None,
             "hire_date": "2026-10-01", "eval_path": "PIERWSZA", "sheet_type": "PIERWSZA", "status": "W_TRAKCIE_OBSERWACJI",
             "supervisor_id": 1, "contract_end_date": "2027-09-30"},
            {"id": 3, "first_name": "Piotr", "last_name": "Wielki", "department": "Departament Kadr", "unit": "Wydział B",
             "position": "Dyrektor", "osp_symbol": None, "employment_type": "MIANOWANY_URZEDNIK", "civil_service_degree": None,
             "hire_date": "2015-05-05", "eval_path": "OKRESOWA", "sheet_type": "A", "status": "DO_OCENY", "supervisor_id": 1},
        ],
        "evaluations": [
            {"id": 1, "employee_id": 1, "supervisor_id": 1, "eval_path": "OKRESOWA", "sheet_type": "C", "status": "ROBOCZA",
             "due_date": "2026-12-31", "average_score": None, "overall_level": None, "final_result": None, "justification": None},
            {"id": 2, "employee_id": 3, "supervisor_id": 1, "eval_path": "OKRESOWA", "sheet_type": "A", "status": "ROBOCZA",
             "due_date": "2026-12-31"},
        ],
        "evaluation_criteria": [
            {"id": 1, "evaluation_id": 1, "competency_id": 1, "is_mandatory": True, "suggested_score": 5, "approved_score": 5},
        ],
        "evaluation_indicator_answers": [],
        "employee_notes": [],
        "job_descriptions": [],
    }


@pytest.fixture()
def fake() -> FakePostgrest:
    return FakePostgrest(existing_tables())


@pytest.fixture()
def repo(fake: FakePostgrest) -> SupabaseRepository:
    return SupabaseRepository(url="https://przyklad.supabase.co", key="klucz-testowy", transport=httpx.MockTransport(fake))


def test_users_mapping(repo: SupabaseRepository) -> None:
    users = repo.list_users()
    assert [(u.id, u.role, u.first_name, u.last_name, u.organizational_unit, u.job_title) for u in users] == [
        ("1", "supervisor", "Anna", "Kowalska", "Departament Kadr", "Dyrektor"),
        ("2", "hr", "Karol", "Nowak", "Biuro Kadr", "Specjalista"),
    ]
    assert repo.get_user("emp-x") is None


def test_employees_mapping(repo: SupabaseRepository) -> None:
    employees = {e.id: e for e in repo.list_employees("1")}
    assert employees["1"].assessment_kind == "periodic"
    assert employees["1"].form == "C"
    assert employees["1"].contract_type == "indefinite"
    assert employees["1"].organizational_unit == "Wydział A"
    assert employees["2"].assessment_kind == "first"
    assert employees["2"].form == "first"
    assert employees["2"].contract_type == "fixed_term_first"
    assert employees["2"].organizational_unit == "Departament Kadr"  # brak unit → department
    assert employees["2"].contract_end_date == date(2027, 9, 30)
    assert employees["3"].form is None  # arkusz A pomijany
    assert employees["3"].contract_type == "appointment"


def test_assessments_skip_sheet_a_and_map_criteria(repo: SupabaseRepository) -> None:
    records = repo.list_assessments(None)
    assert [r.id for r in records] == ["1"]
    record = records[0]
    assert record.status == "draft"
    assert record.decisions[0].competency_id == "C01"
    assert record.decisions[0].selected_level == 5
    assert record.suggested_levels == {"C01": 5}


def test_full_flow_through_service(repo: SupabaseRepository, fake: FakePostgrest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    service = DataService(repo)
    supervisor = service.current_user("1")

    created = service.create_employee(
        supervisor,
        CreateEmployeeInput(first_name="Ola", last_name="Nowa", hire_date=date(2026, 11, 2), contract_type="indefinite",
                            assessment_kind="periodic", form="B", position_title="Naczelnik", organizational_unit="Wydział C"),
    )
    row = next(r for r in fake.tables["employees"] if str(r["id"]) == created.id)
    assert (row["eval_path"], row["sheet_type"], row["employment_type"], row["unit"], row["department"]) == (
        "OKRESOWA", "B", "CZAS_NIEOKRESLONY", "Wydział C", "Departament Kadr")

    note = service.add_note(supervisor, created.id, "Obserwacja")
    assert fake.tables["employee_notes"][0]["author_id"] == 1
    assert service.list_notes(supervisor, created.id)[0].id == note.id

    draft = service.create_assessment_draft(supervisor, CreateAssessmentInput(employee_id=created.id, kind="periodic"))
    evaluation_row = next(r for r in fake.tables["evaluations"] if str(r["id"]) == draft.id)
    assert (evaluation_row["status"], evaluation_row["eval_path"], evaluation_row["sheet_type"]) == ("ROBOCZA", "OKRESOWA", "B")

    mandatory = ["C13", "C14", "C04", "C06", "C02"]
    payload = AssessmentDraftInput(
        form="B",
        additional_competency_ids=["C12"],
        answers=[
            {"competency_id": "C13", "indicator_id": "C13_I01", "selected_level": 7, "star_note": {"situation": "s", "action": "a", "result": "r"}},
            {"competency_id": "C13", "indicator_id": "C13_I02", "selected_level": None, "star_note": None},
        ],
        decisions=[{"competency_id": c, "is_mandatory": True, "selected_level": 5} for c in mandatory]
        + [{"competency_id": "C12", "is_mandatory": False, "selected_level": 7}],
        justification_draft="",
        last_step="summary",
    )
    saved = service.save_assessment_draft(supervisor, draft.id, payload)
    assert saved.additional_competency_ids == ["C12"]
    assert len(saved.answers) == 2 and saved.answers[1].selected_level is None
    criteria = {c["competency_id"]: c for c in fake.tables["evaluation_criteria"] if str(c["evaluation_id"]) == draft.id}
    assert criteria[13]["approved_score"] == 5 and criteria[13]["suggested_score"] == 7  # wskazówka z odpowiedzi
    assert criteria[12]["is_mandatory"] is False
    answers = [a for a in fake.tables["evaluation_indicator_answers"] if str(a["evaluation_id"]) == draft.id]
    assert {a["indicator_id"]: a["selected_level"] for a in answers} == {"C13_I01": 7, "C13_I02": None}

    done = service.complete_assessment(supervisor, draft.id, payload)
    assert done.status == "completed" and done.result == "positive"
    evaluation_row = next(r for r in fake.tables["evaluations"] if str(r["id"]) == draft.id)
    assert evaluation_row["status"] == "ZATWIERDZONA"
    assert evaluation_row["final_result"] == "POZYTYWNA"
    assert evaluation_row["average_score"] == 5.33
    assert evaluation_row["completed_at"] is not None

    # Dane demonstracyjne innych wierszy nietknięte
    assert next(r for r in fake.tables["evaluation_criteria"] if r["id"] == 1)["approved_score"] == 5
