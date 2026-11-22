# Zmiany w backendzie na gałęzi `dev_maks` (etap 5: pierwsza ocena)

> **Zapis do Postgresa i Supabase nie był testowany na prawdziwej bazie. Przed wdrożeniem trzeba to
> sprawdzić na kopii bazy.**

Powód wszystkich zmian: bez nich zakończenie pierwszej oceny przez `POST /assessments/{id}/complete`
zawsze kończyło się kodem 422 (silnik `evaluate_first` wymaga informacji o egzaminie i sprawozdaniu,
a trasy danych ich nie przyjmowały). Rozpoznanie: [etap-5-rozpoznanie.md](etap-5-rozpoznanie.md).
Reguły prawne (`app/core/scoring_engine.py`) nie zostały zmienione. Nie dodano tabel, kolumn ani migracji.
Pracownik po pierwszej ocenie **nie** jest przenoszony na ścieżkę okresową (świadomie pominięte).

## 1. Schematy: `backend/app/data/schemas.py`

- Nowy typ `ExamStatus = "passed" | "exempt" | "failed"` (exempt = wyjątek z § 10 ust. 3).
- Nowe **opcjonalne** pola w `AssessmentDraftInput`, `AssessmentDetail` i `AssessmentRecord`:
  `exam_status`, `report_on_time` (bool), `initial_interview_date`, `evaluation_interview_date` (data).
- `AssessmentDetail` usuwa te cztery klucze z odpowiedzi, gdy `form` to `B` albo `C`, więc odpowiedzi
  tras dla ocen okresowych są takie same jak wcześniej (test `test_periodic_response_unchanged`).

## 2. Usługa: `backend/app/data/service.py`

- `save_assessment_draft` i `complete_assessment` zapisują cztery pola (dla `form != "first"` zawsze
  `null`, więc arkusze B i C się nie zmieniają).
- Dla `form == "first"`: decyzje tylko 3, 5 albo 7, inne wartości → 422
  („Element „…”: w pierwszej ocenie można przyznać tylko 3, 5 albo 7 punktów (wybrano …).”).
- Blokada „wszystkie wskaźniki elementu to brak podstaw do oceny” przy zakończeniu działa teraz także
  dla pierwszej oceny (wcześniej tylko B i C).
- `_evaluation_request` dla pierwszej oceny przekazuje do silnika i do PDF:
  `exam_status` (`passed` → `TAK`, `exempt` → `NIE_DOTYCZY`, `failed` → `NIE`),
  `report_on_time` → `sprawozdanie_zlozone_w_terminie`, obie daty rozmów, a z
  `first_assessment_deadlines`: termin sprawozdania (od `termin_zlozenia_sprawozdania_min`
  do `termin_dokonania_oceny_max`) i okres oceny (`termin_dokonania_oceny_min`–`_max`).
  **Założenie:** koniec terminu sprawozdania = ostatni dzień na dokonanie oceny (backend nie miał
  osobnej daty). Błąd liczenia terminów (niepełne dane pracownika) nie blokuje oceny ani PDF.

## 3. Repozytoria

- Pamięć (`memory_repo.py`): bez zmian w kodzie — przechowuje cały `AssessmentRecord`, więc obsługuje
  wszystkie cztery pola.
- Supabase i Postgres (`backend/app/data/supabase_repo.py`; `PostgresRepository` dziedziczy mapowanie):
  - odczyt: `exam_passed` (`TAK`/`NIE`/`NIE_DOTYCZY` → `passed`/`failed`/`exempt`; wartość logiczna też
    obsłużona), `report_on_time`, `initial_talk_date`; brak kolumny lub nieznana wartość → `null`;
  - zapis: osobne polecenie `UPDATE evaluations` po głównym zapisie oceny (`_save_first_eval_fields`),
    tylko dla pierwszej oceny; każdy błąd jest logowany (`ERROR`) i nie przerywa zapisu szkicu ani
    zakończenia oceny;
  - `exam_passed` to `varchar` bez opisanego ograniczenia wartości (`docs/supabase-istniejacy-schemat.md`),
    zapisywane wartości: `TAK`, `NIE`, `NIE_DOTYCZY` (te same co w arkuszu i silniku);
  - `evaluation_interview_date` nie ma kolumny i **nie jest zapisywana** w bazie — prośba nr 10
    w [prosby-dla-kolegi.md](prosby-dla-kolegi.md).

## 4. Testy: `backend/tests/test_first_evaluation.py` (13 testów)

Zapis pól w szkicu; zakończenie pozytywne; negatywne (egzamin niezdany, średnia poniżej 5, dwie oceny 3)
z wymaganym uzasadnieniem; zwolnienie z egzaminu jako warunek spełniony; odrzucenie 1 i 9; blokada przy
samych „brak podstaw”; PDF (200) i wypełnione pola arkusza (daty rozmów, egzamin, sprawozdanie, terminy);
ocena okresowa bez nowych pól; Postgres z atrapą połączenia (awaria zapisu `exam_passed` nie psuje
zapisu oceny) i odporny odczyt kolumn. Całość: `python -m pytest -q` → 76 testów zaliczonych.
