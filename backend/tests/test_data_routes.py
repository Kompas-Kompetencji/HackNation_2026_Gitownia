"""Testy tras danych i POST /calculate-score na wersji pamięciowej (dane przykładowe)."""

from __future__ import annotations

import json
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
SUP2 = {"X-User-Id": "sup-002"}
HR = {"X-User-Id": "hr-001"}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    # Stała „dzisiejsza data”, żeby statusy terminów nie zależały od dnia uruchomienia testów.
    monkeypatch.setattr(data_settings_module.data_settings, "DATA_TODAY", date(2026, 11, 21))
    service = DataService(MemoryRepository())
    app.dependency_overrides[get_data_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.clear()


def answer(indicator_id: str, level: int | None) -> dict:
    return {"competency_id": indicator_id.split("_")[0], "indicator_id": indicator_id, "selected_level": level, "star_note": None}


# --- calculate-score ------------------------------------------------------------------------


def test_calculate_score_skips_no_basis(client: TestClient) -> None:
    r = client.post(f"{API}/calculate-score", json={"answers": [answer("C01_I01", 7), answer("C01_I02", None)]})
    assert r.status_code == 200
    assert r.json() == {"mean": 7.0, "suggested_level": 7, "counted_indicators": 1}


def test_calculate_score_tie_uses_thresholds(client: TestClient) -> None:
    r = client.post(f"{API}/calculate-score", json={"answers": [answer("C01_I01", 3), answer("C01_I02", 5)]})
    assert r.json() == {"mean": 4.0, "suggested_level": 3, "counted_indicators": 2}


def test_calculate_score_all_no_basis(client: TestClient) -> None:
    r = client.post(f"{API}/calculate-score", json={"answers": [answer("C01_I01", None)]})
    assert r.json() == {"mean": None, "suggested_level": None, "counted_indicators": 0}


@pytest.mark.parametrize("answers", [[answer("C01_I01", 4)], []])
def test_calculate_score_validation(client: TestClient, answers: list) -> None:
    r = client.post(f"{API}/calculate-score", json={"answers": answers})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


# --- użytkownicy i dostęp -------------------------------------------------------------------


def test_demo_users_and_user(client: TestClient) -> None:
    users = client.get(f"{API}/auth/demo-users").json()
    assert {u["id"]: u["role"] for u in users} == {"sup-001": "supervisor", "sup-002": "supervisor", "hr-001": "hr"}
    hr = {"X-User-Id": "hr-001"}
    assert client.get(f"{API}/users/hr-001").status_code == 401  # bez logowania
    assert client.get(f"{API}/users/hr-001", headers=hr).json()["last_name"] == "Ślęzak"
    assert client.get(f"{API}/users/brak", headers=hr).status_code == 404
    assert client.get(f"{API}/users/hr-001", headers={"X-User-Id": "sup-001"}).status_code == 403


def test_jwt_login_flow(client: TestClient, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "AUTH_ALLOW_DEMO_HEADER", False)
    assert client.post(f"{API}/auth/login", json={"user_id": "brak"}).status_code == 401
    login = client.post(f"{API}/auth/login", json={"user_id": "sup-001"}).json()
    assert login["token_type"] == "bearer" and login["user"]["id"] == "sup-001"
    auth = {"Authorization": f"Bearer {login['access_token']}"}
    assert client.get(f"{API}/auth/me", headers=auth).json()["id"] == "sup-001"
    assert client.get(f"{API}/employees", headers=auth).status_code == 200
    # Nagłówek X-User-Id bez tokenu nie wystarcza (produkcja), podrobiony token też nie.
    assert client.get(f"{API}/employees", headers={"X-User-Id": "sup-001"}).status_code == 401
    forged = login["access_token"][:-4] + "AAAA"
    assert client.get(f"{API}/employees", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_expired_token_rejected() -> None:
    import pytest

    from app.core.security import TokenError, create_access_token, decode_access_token

    token, _ = create_access_token("sup-001", "supervisor", ttl_minutes=-1)
    with pytest.raises(TokenError):
        decode_access_token(token)


def test_requires_user_header(client: TestClient) -> None:
    assert client.get(f"{API}/employees").status_code == 401
    assert client.get(f"{API}/employees", headers={"X-User-Id": "nieznany"}).status_code == 401


def test_supervisor_sees_only_own_employees(client: TestClient) -> None:
    employees = client.get(f"{API}/employees", headers=SUP1).json()
    by_id = {e["id"]: e for e in employees}
    assert set(by_id) == {"emp-001", "emp-002", "emp-003", "emp-007"}
    assert by_id["emp-001"]["status"] == "assessment_due_soon"
    assert by_id["emp-001"]["next_assessment_due"] == "2026-12-09"
    assert by_id["emp-002"]["status"] == "up_to_date"
    assert by_id["emp-002"]["next_assessment_due"] == "2027-05-20"
    assert by_id["emp-003"]["status"] == "assessment_overdue"
    assert by_id["emp-003"]["form"] is None

    assert client.get(f"{API}/employees/emp-004", headers=SUP1).status_code == 403
    assert client.get(f"{API}/employees/emp-999", headers=SUP1).status_code == 404
    emp4 = client.get(f"{API}/employees/emp-004", headers=SUP2).json()
    assert emp4["status"] == "awaiting_first_assessment"
    assert emp4["contract_type"] == "fixed_term_first"


def test_hr_sees_all_but_cannot_change(client: TestClient) -> None:
    assert len(client.get(f"{API}/employees", headers=HR).json()) == 7
    assert client.get(f"{API}/employees/emp-001", headers=HR).status_code == 200
    assert client.post(f"{API}/employees/emp-001/notes", headers=HR, json={"text": "x"}).status_code == 403
    assert client.post(f"{API}/assessments", headers=HR, json={"employee_id": "emp-001", "kind": "periodic"}).status_code == 403


def test_create_employee_first_assessment(client: TestClient) -> None:
    payload = {
        "first_name": "Anna", "last_name": "Nowa", "hire_date": "2026-11-02", "contract_type": "fixed_term_first",
        "contract_end_date": "2027-11-01", "assessment_kind": "first", "form": "first",
        "position_title": "Referent", "organizational_unit": None,
    }
    r = client.post(f"{API}/employees", headers=SUP2, json=payload)
    assert r.status_code == 201
    employee = r.json()
    assert employee["supervisor_id"] == "sup-002"
    assert employee["organizational_unit"] == "Wydział Zamówień Publicznych"
    assert employee["status"] == "awaiting_first_assessment"
    assert employee["next_assessment_due"] is not None
    listed = client.get(f"{API}/assessments", headers=SUP2, params={"employee_id": employee["id"]}).json()
    assert [(a["kind"], a["status"]) for a in listed] == [("first", "not_started")]
    assert client.get(f"{API}/employees", headers=SUP1).json().__len__() == 4


# --- notatki i opisy stanowiska ---------------------------------------------------------------


def test_notes(client: TestClient) -> None:
    notes = client.get(f"{API}/employees/emp-001/notes", headers=SUP1).json()
    assert len(notes) == 4
    assert notes[0]["created_at"] >= notes[-1]["created_at"]
    r = client.post(f"{API}/employees/emp-001/notes", headers=SUP1, json={"text": "Nowa obserwacja."})
    assert r.status_code == 201
    assert r.json()["employee_id"] == "emp-001"
    assert len(client.get(f"{API}/employees/emp-001/notes", headers=SUP1).json()) == 5
    assert client.get(f"{API}/employees/emp-001/notes", headers=SUP2).status_code == 403


def test_job_descriptions_versions_and_form(client: TestClient) -> None:
    docs = client.get(f"{API}/employees/emp-001/job-descriptions", headers=SUP1).json()
    assert [d["version"] for d in docs] == [1, 2]
    assert docs[1]["analysis"]["suggested_form"] == "C"

    analysis = {
        "filename": "osp_naczelnik.docx", "position_title": "Naczelnik wydziału", "organizational_unit": "Wydział Obsługi Interesantów",
        "has_management_duties": True, "subordinates_count": 12, "suggested_form": "B",
        "additional_criteria": [{"criterion_id": "C12", "name": "Zarządzanie strategiczne", "rationale": "Planowanie celów."}],
    }
    r = client.post(
        f"{API}/employees/emp-003/job-descriptions",
        headers=SUP1,
        files={"file": ("osp_naczelnik.docx", b"PK fake", "application/octet-stream")},
        data={"confirmed_analysis": json.dumps(analysis)},
    )
    assert r.status_code == 201
    assert r.json()["version"] == 1
    assert client.get(f"{API}/employees/emp-003", headers=SUP1).json()["form"] == "B"


# --- oceny ----------------------------------------------------------------------------------


def test_list_assessments_visibility_and_filters(client: TestClient) -> None:
    assert len(client.get(f"{API}/assessments", headers=HR).json()) == 14
    own = client.get(f"{API}/assessments", headers=SUP2).json()
    assert sorted(a["id"] for a in own) == ["as-004", "as-005", "as-006"]
    overdue = client.get(f"{API}/assessments", headers=SUP1, params={"status": "overdue"}).json()
    assert [a["id"] for a in overdue] == ["as-003"]
    assert overdue[0]["employee_name"] == "Małgorzata Wróbel-Sośnicka"
    assert client.get(f"{API}/assessments/as-004", headers=SUP1).status_code == 403
    assert client.get(f"{API}/assessments/as-xxx", headers=SUP1).status_code == 404


def test_completed_history_has_evaluation(client: TestClient) -> None:
    detail = client.get(f"{API}/assessments/as-102", headers=SUP1).json()
    assert detail["status"] == "completed"
    assert detail["evaluation"]["result"] == "negative"
    assert detail["evaluation"]["justification_required"] is True
    assert detail["additional_competency_ids"] == ["C10"]


def test_draft_requires_form(client: TestClient) -> None:
    r = client.post(f"{API}/assessments", headers=SUP1, json={"employee_id": "emp-003", "kind": "periodic"})
    assert r.status_code == 409


def periodic_c_payload(levels: dict[str, int | None], justification: str = "") -> dict:
    mandatory = ["C03", "C01", "C04", "C06", "C02"]
    return {
        "form": "C",
        "additional_competency_ids": ["C07"],
        "answers": [answer("C01_I01", 7), answer("C01_I02", None)],
        "decisions": [
            {"competency_id": cid, "is_mandatory": cid in mandatory, "selected_level": levels.get(cid), "decision_note": ""}
            for cid in mandatory + ["C07"]
        ],
        "justification_draft": justification,
        "last_step": "summary",
    }


def test_draft_save_and_complete_flow(client: TestClient) -> None:
    # Istniejący szkic as-001 (Joanna Pietrzyk) zostaje zwrócony zamiast tworzenia nowego.
    created = client.post(f"{API}/assessments", headers=SUP1, json={"employee_id": "emp-001", "kind": "periodic"})
    assert created.status_code == 201
    assert created.json()["id"] == "as-001"

    saved = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_c_payload({"C01": 7}))
    assert saved.status_code == 200
    body = saved.json()
    assert body["status"] == "draft"
    assert body["last_step"] == "summary"
    assert body["answers"][1]["selected_level"] is None
    assert body["updated_at"] is not None

    # Brak decyzji → 422
    incomplete = client.post(f"{API}/assessments/as-001/complete", headers=SUP1, json=periodic_c_payload({"C01": 7}))
    assert incomplete.status_code == 422

    # Ocena negatywna bez uzasadnienia → 422
    negative = {"C03": 5, "C01": 1, "C04": 5, "C06": 5, "C02": 5, "C07": 5}
    r = client.post(f"{API}/assessments/as-001/complete", headers=SUP1, json=periodic_c_payload(negative))
    assert r.status_code == 422
    assert "Uzasadnienie" in r.json()["detail"]

    positive = {"C03": 5, "C01": 7, "C04": 5, "C06": 3, "C02": 5, "C07": 7}
    r = client.post(f"{API}/assessments/as-001/complete", headers=SUP1, json=periodic_c_payload(positive))
    assert r.status_code == 200
    done = r.json()
    assert done["status"] == "completed"
    assert done["result"] == "positive"
    assert done["evaluation"]["mean"] == 5.33
    assert done["completed_at"] is not None

    employee = client.get(f"{API}/employees/emp-001", headers=SUP1).json()
    assert employee["last_assessment_result"] == "positive"
    assert employee["status"] == "up_to_date"
    assert employee["next_assessment_due"] > "2028-11-01"

    again = client.put(f"{API}/assessments/as-001/draft", headers=SUP1, json=periodic_c_payload(positive))
    assert again.status_code == 409


def test_overdue_not_started_becomes_draft(client: TestClient) -> None:
    # Ocena pierwsza nierozpoczęta (as-004) zamienia się w szkic.
    r = client.post(f"{API}/assessments", headers=SUP2, json={"employee_id": "emp-004", "kind": "first"})
    assert r.status_code == 201
    assert r.json()["id"] == "as-004"
    assert r.json()["status"] == "draft"
    assert r.json()["started_at"] is not None


def test_assessment_pdf(client: TestClient) -> None:
    r = client.get(f"{API}/assessments/as-101/pdf", headers=SUP1)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert client.get(f"{API}/assessments/as-101/pdf", headers=SUP2).status_code == 403
