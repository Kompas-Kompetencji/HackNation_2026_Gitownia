from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402

client = TestClient(app)


def test_list_five_ai_assistants() -> None:
    r = client.get("/api/v1/ai/assistants")
    assert r.status_code == 200
    assert len(r.json()["assistants"]) == 5


def test_ai_chat_enforces_m1_verdict() -> None:
    r = client.post(
        "/api/v1/ai/chat",
        json={
            "assistant_type": "FORMAL_ASSISTANT",
            "evaluation_type": "PERIODIC_EVALUATION",
            "messages": [{"role": "user", "content": "Sprawdź moją ocenę"}],
            "evaluation_context": {
                "evaluation_type": "PERIODIC_EVALUATION",
                "form_type": "FORM_C",
                "oceny_czastkowe": [
                    {"name": "Wykorzystywanie wiedzy i doskonalenie zawodowe", "score": 9, "is_mandatory": True},
                    {"name": "Rzetelność", "score": 9, "is_mandatory": True},
                    {"name": "Organizacja pracy i orientacja na osiąganie celów", "score": 9, "is_mandatory": True},
                    {"name": "Współpraca", "score": 9, "is_mandatory": True},
                    {"name": "Komunikacja", "score": 1, "is_mandatory": True},
                ],
            },
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["m1_evaluation_check"]["werdykt"] == "NEGATYWNA"
    assert "Komunikacja" in body["m1_evaluation_check"]["iprz_mandatory_criteria"]


def test_auto_draft_blocks_dev_notes_on_negative_first_eval() -> None:
    r = client.post(
        "/api/v1/ai/auto-draft",
        json={
            "evaluation": {
                "evaluation_type": "FIRST_EVALUATION",
                "form_type": "FIRST_EVAL_FORM",
                "oceny_czastkowe": [
                    {"name": "Rzetelność", "score": 3, "is_mandatory": True},
                    {"name": "Wykorzystywanie wiedzy i doskonalenie zawodowe", "score": 3, "is_mandatory": True},
                    {"name": "Organizacja pracy i orientacja na osiąganie celów", "score": 5, "is_mandatory": True},
                    {"name": "Komunikacja", "score": 5, "is_mandatory": True},
                    {"name": "Współpraca", "score": 5, "is_mandatory": True},
                ],
                "egzamin_sluzba_przygotowawcza": "TAK",
                "sprawozdanie_zlozone_w_terminie": True,
            }
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["m1_validation"]["werdykt"] == "NEGATYWNA"
    assert body["wnioski_rozwojowe_draft"] is None
