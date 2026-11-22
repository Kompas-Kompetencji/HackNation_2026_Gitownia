"""Terminy oceny okresowej dla pracownika na czas nieokreślony bez zakończonej oceny (istniejąca logika kalkulatora)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.data.service import periodic_assessment_deadlines
from app.data.schemas import EmployeeRecord
from test_data_routes import API, SUP1, client  # noqa: F401  (fixture)


def indefinite_employee(**over) -> dict:
    base = {
        "first_name": "Jan", "last_name": "Nieokreślony", "hire_date": "2026-11-23", "contract_type": "indefinite",
        "assessment_kind": "periodic", "form": "C", "position_title": "Radca", "organizational_unit": "Wydział Testów",
    }
    base.update(over)
    return base


def test_new_indefinite_employee_has_periodic_due_date(client: TestClient) -> None:
    r = client.post(f"{API}/employees", json=indefinite_employee(), headers=SUP1)
    assert r.status_code == 201, r.text
    body = r.json()
    # 24 miesiące od zatrudnienia na czas nieokreślony (23.11.2028 to czwartek, dzień roboczy).
    assert body["next_assessment_due"] == "2028-11-23"
    assert body["status"] != "awaiting_first_assessment"


def test_periodic_deadlines_helper_uses_existing_calculator() -> None:
    record = EmployeeRecord(
        id="x", supervisor_id="sup-001", first_name="A", last_name="B", position_title="Radca",
        organizational_unit="W", hire_date=date(2026, 11, 23), contract_type="indefinite", assessment_kind="periodic",
    )
    d = periodic_assessment_deadlines(record)
    # § 7 pkt 1 rozporządzenia z 2016 r.: rozmowa rozpoczynająca w ciągu 30 dni (23.12.2026, środa).
    assert d.termin_rozmowy_wstepnej_max == date(2026, 12, 23)
    assert d.termin_dokonania_oceny_max == date(2028, 11, 23)


def test_deadlines_route_periodic_from_hire_date(client: TestClient) -> None:
    """Trasa, z której korzysta podsumowanie kreatora (frontend nie liczy terminów)."""
    r = client.post(
        f"{API}/deadlines/calculate",
        json={"evaluation_type": "PERIODIC_EVALUATION", "data_poprzedniej_oceny_lub_zatrudnienia": "2026-11-23"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["termin_rozmowy_wstepnej_max"] == "2026-12-23"
    assert body["termin_dokonania_oceny_max"] == "2028-11-23"


def test_starting_interview_shifted_from_holiday(client: TestClient) -> None:
    """Art. 115 k.c. z istniejącej logiki: 30 dni od 25.11.2026 to 25.12.2026 (święto) → 28.12.2026."""
    r = client.post(
        f"{API}/deadlines/calculate",
        json={"evaluation_type": "PERIODIC_EVALUATION", "data_poprzedniej_oceny_lub_zatrudnienia": "2026-11-25"},
    )
    assert r.json()["termin_rozmowy_wstepnej_max"] == "2026-12-28"
