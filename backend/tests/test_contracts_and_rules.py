"""Odstępstwa od zwykłej umowy (zastępstwo, przedłużenie art. 35 ust. 4) i reguła „brak podstaw do oceny”."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from test_data_routes import API, SUP1, answer, client  # noqa: F401  (fixture)


def new_employee(**over) -> dict:
    base = {
        "first_name": "Ewa", "last_name": "Zastępcza", "hire_date": "2026-03-01", "contract_type": "replacement",
        "contract_end_date": "2027-06-30", "first_eval_agreement_date": "2026-04-01", "assessment_kind": "first",
        "form": "first", "position_title": "Specjalista", "organizational_unit": "Wydział Testów",
    }
    base.update(over)
    return base


def test_replacement_first_eval_counts_from_agreement(client: TestClient) -> None:
    r = client.post(f"{API}/employees", json=new_employee(), headers=SUP1)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["contract_type"] == "replacement"
    assert body["first_eval_agreement_date"] == "2026-04-01"
    # najpóźniej miesiąc przed końcem umowy (30.06.2027 → 30.05.2027, art. 112 KC)
    assert body["next_assessment_due"] == "2027-05-31" or body["next_assessment_due"].startswith("2027-05")


def test_replacement_requires_agreement_and_long_enough_contract(client: TestClient) -> None:
    r = client.post(f"{API}/employees", json=new_employee(first_eval_agreement_date=None), headers=SUP1)
    assert r.status_code == 422 and "porozumieniem" in r.json()["detail"]
    r = client.post(f"{API}/employees", json=new_employee(contract_end_date="2026-10-31"), headers=SUP1)
    assert r.status_code == 422 and "zastępstwa nie pozwala" in r.json()["detail"]


def test_periodic_only_for_indefinite_or_appointment(client: TestClient) -> None:
    r = client.post(f"{API}/employees", json=new_employee(assessment_kind="periodic", form="C"), headers=SUP1)
    assert r.status_code == 422 and "art. 81 ust. 1" in r.json()["detail"]
    r = client.post(
        f"{API}/employees",
        json=new_employee(contract_type="indefinite", assessment_kind="first", contract_end_date=None),
        headers=SUP1,
    )
    assert r.status_code == 422


def test_contract_extension_moves_first_eval_deadline(client: TestClient) -> None:
    emp = client.post(
        f"{API}/employees",
        json=new_employee(contract_type="fixed_term_first", first_eval_agreement_date=None, contract_end_date="2027-02-28"),
        headers=SUP1,
    ).json()
    before = emp["next_assessment_due"]
    r = client.post(
        f"{API}/employees/{emp['id']}/contract-extension",
        json={"new_end_date": "2027-06-30", "absence_days": 130},
        headers=SUP1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["contract_end_date"] == "2027-06-30" and r.json()["next_assessment_due"] > before
    too_long = client.post(
        f"{API}/employees/{emp['id']}/contract-extension",
        json={"new_end_date": "2028-06-30", "absence_days": 100},
        headers=SUP1,
    )
    assert too_long.status_code == 422
    short = client.post(
        f"{API}/employees/{emp['id']}/contract-extension", json={"new_end_date": "2027-08-30", "absence_days": 60}, headers=SUP1
    )
    assert short.status_code == 422


def test_criterion_cannot_be_completed_with_only_no_basis(client: TestClient) -> None:
    assessments = client.get(f"{API}/assessments", headers=SUP1).json()
    draft = next(a for a in assessments if a["status"] in ("draft", "not_started") and a["form"] in ("B", "C"))
    detail = client.get(f"{API}/assessments/{draft['id']}", headers=SUP1).json()
    payload = {
        "form": detail["form"], "additional_competency_ids": [], "justification_draft": "x",
        "answers": [answer("C01_I01", None), answer("C01_I02", None)],
        "decisions": [{"competency_id": "C01", "is_mandatory": True, "selected_level": 5, "decision_note": ""}],
    }
    r = client.post(f"{API}/assessments/{draft['id']}/complete", json=payload, headers=SUP1)
    assert r.status_code == 422 and "brak podstaw" in r.json()["detail"]


# --- kalendarz ------------------------------------------------------------------------------

from test_data_routes import HR, SUP2  # noqa: E402


def test_calendar_scoped_by_role(client: TestClient) -> None:
    params = {"from": "2026-06-01", "to": "2027-06-30"}
    hr = client.get(f"{API}/calendar", params=params, headers=HR)
    sup1 = client.get(f"{API}/calendar", params=params, headers=SUP1)
    sup2 = client.get(f"{API}/calendar", params=params, headers=SUP2)
    assert hr.status_code == sup1.status_code == sup2.status_code == 200
    assert {e["supervisor_id"] for e in sup1.json()} <= {"sup-001"}
    assert {e["supervisor_id"] for e in sup2.json()} <= {"sup-002"}
    assert len(hr.json()) == len(sup1.json()) + len(sup2.json())
    kinds = {e["kind"] for e in hr.json()}
    assert {"first_due", "periodic_due"} & kinds
    assert all(e["legal_basis"] for e in hr.json())
    dates = [e["date"] for e in hr.json()]
    assert dates == sorted(dates)


def test_calendar_requires_user_and_valid_range(client: TestClient) -> None:
    assert client.get(f"{API}/calendar", params={"from": "2026-01-01", "to": "2026-02-01"}).status_code == 401
    bad = client.get(f"{API}/calendar", params={"from": "2026-03-01", "to": "2026-02-01"}, headers=HR)
    assert bad.status_code == 422
