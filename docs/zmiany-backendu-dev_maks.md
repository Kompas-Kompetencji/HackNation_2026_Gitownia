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

---

# Etap 6: ochrona danych w panelu kadr (gałąź `dev_maks`)

Kadry monitorują statusy i terminy oraz wysyłają przypomnienia, ale **nie oceniają i nie widzą treści
ocen** (minimalizacja danych osobowych). Przełożeni widzą wszystko tak jak wcześniej.

## 5. Dostęp kadr (`backend/app/data/service.py`, `app/routers/data_router.py`)

- `GET /assessments/{id}` i `GET /assessments/{id}/pdf`: rola kadr → **403**
  „Kadry nie mają dostępu do treści ocen. Widzą tylko status, terminy, rodzaj oceny i wynik końcowy.”
  (nieistniejąca ocena dalej daje 404).
- `GET /employees/{id}/notes` → 403 („Kadry nie mają dostępu do notatek przełożonego.”),
  `GET /employees/{id}/job-descriptions` → 403 („Kadry nie mają dostępu do opisów stanowiska pracy.”).
- `GET /employees` i `GET /employees/{id}` dla kadr zwracają nowy model `EmployeeMonitoring`
  (`schemas.py`): `id`, `supervisor_id`, `supervisor_name`, `first_name`, `last_name`,
  `organizational_unit`, `assessment_kind`, `contract_end_date`, `last_assessment_date`,
  `last_assessment_result`, `next_assessment_due`, `status`. **Bez** `position_title`, `hire_date`,
  `contract_type`, `first_eval_agreement_date`, `form`. Przełożony dostaje pełny `Employee` jak dotąd.
- `GET /assessments` (`AssessmentSummary`) i `GET /calendar` (`CalendarEvent`) już wcześniej nie miały
  punktów, średnich, uzasadnień, notatek ani odpowiedzi — bez zmian. `AssessmentSummary.form` (arkusz)
  zostaje, bo to rodzaj arkusza, nie treść oceny.
- Frontend: panel kadr używa nowej funkcji `listMonitoredEmployees` (typ `EmployeeMonitoring`)
  zamiast `listEmployees` i `listDemoUsers`; kolumna stanowiska zastąpiona komórką.

Testy: `backend/tests/test_hr_privacy.py` (przełożony ma dostęp, kadry dostają 403 albo okrojone pola).

## 6. Przypomnienia od kadr: `POST /reminders`, `GET /reminders`

> **Zapis i odczyt przypomnień w Postgresie i Supabase są nietestowane na prawdziwej bazie.**
> Sprawdzone tylko na atrapie PostgREST w testach. Przed wdrożeniem uruchomić na kopii bazy.

- `POST /api/v1/reminders` (tylko kadry, inaczej 403 „Przypomnienia wysyłają wyłącznie kadry.”).
  Treść żądania: `supervisor_id`, `employee_ids` (lista, może być pusta = przypomnienie ogólne), `message`.
  Walidacja z komunikatami po polsku (422): przełożony istnieje i ma rolę przełożonego, każdy pracownik
  istnieje i podlega temu przełożonemu, treść niepusta, najwyżej 1000 znaków, bez numeru PESEL
  (11 cyfr). Powtórzone identyfikatory pracowników są scalane. Odpowiedź 201: `Reminder`.
- `GET /api/v1/reminders`: kadry widzą wszystkie, przełożony tylko skierowane do niego; najnowsze pierwsze.
- Model `Reminder` (`schemas.py`): `id`, `created_at`, `author_id`, `author_name`, `supervisor_id`,
  `supervisor_name`, `employee_ids`, `employee_names`, `message`. Nazwiska dołącza usługa przy odczycie
  (w bazie zapisywane są tylko identyfikatory).
- Repozytoria: nowe metody `list_reminders` i `add_reminder` w `DataRepository`.
  - Pamięć (`memory_repo.py`): pełna obsługa (dane znikają po restarcie, jak reszta).
  - Supabase (`supabase_repo.py`) i Postgres (dziedziczy; tabela `reminders` dopisana do `_TABLES`):
    każdy błąd zapisu i odczytu jest logowany (`ERROR`) i zamieniany na `StorageError`; usługa odpowiada
    wtedy kodem 503 „Nie udało się zapisać przypomnienia…” / „Nie udało się wczytać przypomnień…”.
    Pozostałe trasy działają normalnie (test `test_supabase_reminders_failure_is_readable_and_isolated`).

### Baza: nowa tabela `reminders` (skrypt addytywny)

- `supabase/schema-additions-003.sql` i kopia `backend/app/data/migrations/003_reminders.sql`:
  `create table if not exists public.reminders` (`id` serial, `author_id` → `users`, `supervisor_id`
  → `users`, `employee_ids` jsonb z listą liczb, `message` text 1–1000 znaków, `created_at`), indeks
  `(supervisor_id, created_at desc)`, RLS włączone bez polityk. Nic poza tym; istniejące tabele bez zmian.
- **Uwaga o wdrożeniu**: `postgres_repo.py` uruchamia migracje przy każdym starcie (`DB_AUTO_MIGRATE`),
  więc po wdrożeniu tej gałęzi tabela powstanie automatycznie. Błąd migracji `003_reminders.sql`
  (lista `OPTIONAL_MIGRATIONS`) jest tylko logowany i **nie zatrzymuje startu** backendu — nie działają
  wtedy jedynie przypomnienia. Błędy migracji 001 i 002 nadal zatrzymują start, jak wcześniej.

Testy: `backend/tests/test_reminders.py` (16 testów: obie role, walidacja, kolejność, atrapa Supabase,
awaria tabeli, migracja tylko dodająca).
