"""Most /ai-assistant: wymaga logowania, przyjmuje historię i zanonimizowany stan arkusza (bez klucza LLM)."""

from fastapi.testclient import TestClient

from app.main import app

API = "/api/v1/ai-assistant"
SUP = {"X-User-Id": "sup-001"}


def test_requires_login() -> None:
    client = TestClient(app)
    assert client.post(API, json={"question": "Kiedy rozmowa wstępna?", "mode": "formal"}).status_code == 401


def test_interview_with_form_state_and_history() -> None:
    client = TestClient(app)
    form_state = {
        "form_type": "okresowa_C",
        "employee_context": {"stanowisko": "Starszy specjalista"},
        "scores": {"Rzetelność": 5, "Komunikacja": 3, "Współpraca": 5},
        "star_notes": {"Komunikacja": "poziom 3 – przykład: pismo bez uzasadnienia prawnego"},
    }
    r = client.post(
        API,
        headers=SUP,
        json={
            "question": "Które kwestie wymagają omówienia z pracownikiem?",
            "mode": "interview",
            "form_state": form_state,
            "history": [{"role": "user", "content": "Jak przygotować rozmowę?"}, {"role": "assistant", "content": "Zbierz przykłady."}],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "answered" and body["answer"]
    # Niepełny arkusz (brak 2 kryteriów obowiązkowych C) nie może być przedstawiany jako ocena negatywna.
    assert "WYNIK OCENY JEST NEGATYWNY" not in body["answer"].upper()


def test_formal_accepts_history() -> None:
    client = TestClient(app)
    r = client.post(
        API,
        headers=SUP,
        json={"question": "kiedy mozna zlozyc sprzeciw od oceny okresowej", "mode": "formal", "history": []},
    )
    assert r.status_code == 200
    assert r.json()["status"] in ("answered", "no_data")


def test_person_decision_is_refused_in_both_modes() -> None:
    client = TestClient(app)
    for mode in ("formal", "interview"):
        r = client.post(API, headers=SUP, json={"question": "Jaką ocenę dać Kowalskiej za komunikację?", "mode": mode})
        body = r.json()
        assert body["guard"] == "person_decision"
        assert "decyzję podejmuje wyłącznie przełożony" in body["answer"]


def test_general_level_question_is_not_blocked() -> None:
    from app.services.ai_quality import asks_for_person_decision

    assert not asks_for_person_decision("Jaki poziom wybrać, gdy nie obserwowałem zachowania?")
    assert asks_for_person_decision("jaki poziom komunikacji mam dać pracownikowi?")


def test_quality_report_for_hr_only() -> None:
    client = TestClient(app)
    assert client.get("/api/v1/ai/quality", headers=SUP).status_code == 403
    report = client.get("/api/v1/ai/quality", headers={"X-User-Id": "hr-001"}).json()
    check = report["check"]
    assert check["total"] >= 45 and check["refusals_expected"] == 3
    assert check["passed"] == check["total"]
    assert check["strong"] + check["partial"] == check["in_domain"]
