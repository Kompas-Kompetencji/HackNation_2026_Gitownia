"""Eksport dla systemu kadrowego, paczka EZD i dziennik zdarzeń."""

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.data.factory import get_data_service
from app.main import app

API = "/api/v1"
SUP1 = {"X-User-Id": "sup-001"}
HR = {"X-User-Id": "hr-001"}


def _client() -> TestClient:
    get_data_service.cache_clear()
    return TestClient(app)


def test_export_for_hr_only_without_content() -> None:
    client = _client()
    assert client.get(f"{API}/export/assessments", headers=SUP1).status_code == 403
    r = client.get(f"{API}/export/assessments", headers=HR, params={"format": "json"})
    rows = r.json()
    assert len(rows) == 14
    assert set(rows[0]) >= {"pracownik", "status", "termin", "wynik", "przelozony"}
    assert not any(k in rows[0] for k in ("answers", "decisions", "justification_draft"))
    csv_text = client.get(f"{API}/export/assessments", headers=HR).content.decode("utf-8-sig")
    assert csv_text.splitlines()[0].startswith("id_oceny;")


def test_ezd_package_completed_only_and_not_for_hr() -> None:
    client = _client()
    r = client.get(f"{API}/assessments/as-101/ezd-package", headers=SUP1)
    assert r.status_code == 200, r.text
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        names = zf.namelist()
        meta = json.loads(zf.read("metadane.json"))
    assert any(n.endswith(".pdf") for n in names)
    assert meta["wynik"] == "POZYTYWNA" and meta["akta"]["klasa_jrwa"] is None
    assert client.get(f"{API}/assessments/as-001/ezd-package", headers=SUP1).status_code == 409  # szkic
    assert client.get(f"{API}/assessments/as-101/ezd-package", headers=HR).status_code == 403


def test_audit_log_records_actions_for_hr() -> None:
    client = _client()
    client.get(f"{API}/assessments/as-001", headers=SUP1)
    client.get(f"{API}/assessments/as-101/pdf", headers=SUP1)
    assert client.get(f"{API}/audit-log", headers=SUP1).status_code == 403
    log = client.get(f"{API}/audit-log", headers=HR).json()
    actions = [(e["action"], e["entity_id"], e["user_name"]) for e in log]
    assert ("assessment.viewed", "as-001", "Halina Zawadzka-Nowicka") in actions
    assert ("assessment.pdf_downloaded", "as-101", "Halina Zawadzka-Nowicka") in actions
    assert log[0]["at"] >= log[-1]["at"]
