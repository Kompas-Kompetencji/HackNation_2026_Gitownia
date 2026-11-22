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

---

# Wnioski rozwojowe w arkuszu (gałąź `dev_maks`)

> **Nietestowane na prawdziwej bazie, wymaga uruchomienia skryptu 004 w Supabase**
> (`supabase/schema-additions-004.sql`). Sprawdzone tylko w pamięci i na atrapie połączenia Postgres.

Podstawa: § 11 pkt 5 rozporządzenia o ocenach okresowych z 2016 r. (wnioski dotyczące indywidualnego
programu rozwoju zawodowego wpisywane do arkusza) oraz sekcja VI arkusza pierwszej oceny (wnioski
dotyczące rozwoju zawodowego ocenianego, tylko przy ocenie pozytywnej — § 10 ust. 6 rozporządzenia z 2015 r.).
Silnik i szablony PDF miały już te pola (`wnioski_iprz`, `wnioski_rozwojowe_pierwsza_ocena`), ale trasy
danych ich nie przyjmowały, więc sekcja w PDF była zawsze pusta.

## 7. Pole `development_conclusions`

- `schemas.py`: opcjonalne pole w `AssessmentDraftInput` (najwyżej 2000 znaków, dłuższe → 422),
  `AssessmentDetail` i `AssessmentRecord`. Pole jest w odpowiedzi dla wszystkich arkuszy (B, C, pierwsza).
- `service.py`: szkic i zakończenie zapisują pole (puste lub same spacje → `null`). `_evaluation_request`
  przekazuje je do silnika i PDF jako `wnioski_iprz` (B i C) albo `wnioski_rozwojowe_pierwsza_ocena`
  (pierwsza ocena). Przy negatywnej pierwszej ocenie z wpisanymi wnioskami zakończenie daje 422
  z komunikatem silnika (reguła § 10 ust. 6 istniała, teraz jest osiągalna).
- Supabase i Postgres: odczyt kolumny `evaluations.development_conclusions` (brak kolumny → `null`);
  zapis osobnym poleceniem `UPDATE` po głównym zapisie (`_save_development_conclusions`), dla każdego
  arkusza. Błąd (np. kolumna jeszcze nie istnieje) trafia tylko do logu (`ERROR`) i nie psuje zapisu oceny.
- Baza: `supabase/schema-additions-004.sql` i kopia `backend/app/data/migrations/004_development_conclusions.sql`
  (`alter table public.evaluations add column if not exists development_conclusions text`). Migracja 004
  jest na liście `OPTIONAL_MIGRATIONS`: jej błąd nie zatrzymuje startu backendu.
- Frontend: pole tekstowe w podsumowaniu formularza (oba rodzaje ocen, licznik znaków, ostrzeżenie przy
  negatywnej pierwszej ocenie), zapis w szkicu i zakończeniu, widok tylko do odczytu, makieta PDF.

Testy: `backend/tests/test_development_conclusions.py` (szkic, limit 2000, PDF arkusza C i pierwszej oceny,
odrzucenie wniosków przy negatywnej pierwszej ocenie, awaria brakującej kolumny w Postgresie, odczyt, skrypt 004).

---

# Opis stanowiska: nazwa z pkt 1.3 i kryteria dodatkowe z wykazu (gałąź `dev_maks`)

## 8. Parser `backend/app/services/osp_parser.py` (prośba 2.1)

- Przyczyna błędu: w plikach OSP wartość pkt 1.3 to lista rozwijana Worda zapisana jako kontrolka
  zawartości obejmująca całą komórkę (`w:sdt` → `w:sdtContent` → `w:tc`). python-docx takich komórek nie
  zwraca, więc ostatnią „komórką” wiersza była etykieta i parser oddawał nagłówek „NAZWA STANOWISKA PRACY”.
- Poprawka: komórki części I czytane wprost z XML wiersza (`_row_cell_lines`), także te w kontrolkach;
  wartość to wyłącznie komórki **po** komórce z etykietą (nigdy sama etykieta); tekst zastępczy listy
  („wybierz … z listy”) traktowany jak puste pole; wiersz kontynuacji z pionowo scaloną etykietą
  (wydział pod departamentem w pkt 1.2) dopisywany do poprzedniego punktu, jak wcześniej.
- Wynik dla plików z `backend/data/raw`: „starszy specjalista”, „radca”, „naczelnik wydziału”; komórka
  organizacyjna i symbol bez zmian względem poprzedniej wersji. Nazwa pliku nie ma wpływu na wynik.
- Frontend (`analyzeOsp`): usunięte zgadywanie nazwy stanowiska z nazwy pliku; gdy dokument nie zawiera
  nazwy, pole zostaje puste do uzupełnienia przez przełożonego.

Testy: `backend/tests/test_osp_parser.py` (trzy pliki, te same pliki pod zmienioną nazwą, trasa
`/osp/parse` z plikiem wysłanym jako „opis.docx”).

## 9. Kryteria dodatkowe w kreatorze (frontend)

- Krok opisu stanowiska: zamiast trzech pól tekstowych wybór od 0 do 3 kryteriów z wykazu 14 kompetencji
  (§ 5 ust. 2 rozporządzenia z 2016 r.), bez kompetencji obowiązkowych wybranego arkusza (z
  `GET /competencies?form_type=…`). Podpowiedź z analizy (pkt 13 opisu) jest zaznaczona na start
  i opisana; przełożony może ją zmienić. Po zmianie arkusza wybór, który stał się obowiązkowy, jest odznaczany.
- Backend bez zmian w tej części (limit 3 nadal po stronie frontendu — prośba 3).
