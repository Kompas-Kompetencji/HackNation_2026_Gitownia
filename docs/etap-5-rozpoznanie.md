# Etap 5 (pierwsza ocena): rozpoznanie backendu

Stan na 22 listopada 2026, gałąź `dev_maks` (od `main`, commit `c853161`). Sprawdzone czytaniem kodu
i próbą na osobnej kopii backendu w pamięci (`TestClient`, `DATA_BACKEND=memory`, bez `DATABASE_URL`);
działającego serwera na porcie 8010 nie dotykano.

## Wniosek

**Backend nie ma pełnej obsługi pierwszej oceny.** Silnik reguł ją ma (`evaluate_first`), ale warstwa
danych (szkic, zakończenie, PDF zapisanej oceny) nie przyjmuje ani nie przechowuje danych o egzaminie,
sprawozdaniu i datach rozmów. Skutek sprawdzony próbą: `POST /assessments/{id}/complete` dla pierwszej
oceny **zawsze** kończy się kodem 422:

> Nie wskazano informacji o zaliczeniu egzaminu ze służby przygotowawczej (TAK / NIE / NIE_DOTYCZY).
> Nie wskazano informacji, czy sprawozdanie zostało złożone w wyznaczonym terminie.

Formularz po stronie frontendu nie obejdzie tego sam: wynik oceny liczy backend przy zakończeniu,
a pola, których brakuje, są wymagane przez silnik.

## 1. Jak backend modeluje pierwszą ocenę

- **Silnik** (`app/core/scoring_engine.py`, `evaluate_first`), arkusz `FIRST_EVAL_FORM`, typ
  `FIRST_EVALUATION`:
  - dokładnie pięć elementów obowiązkowych (`MANDATORY_CRITERIA_FIRST_EVAL`): rzetelność, wykorzystywanie
    wiedzy, organizacja pracy, komunikacja, współpraca; kryteria dodatkowe = błąd;
  - skala tylko 3, 5, 7 (`FIRST_EVAL_ALLOWED_SCORES`), inna ocena = błąd;
  - średnia z pięciu elementów, zaokrąglenie `ROUND_HALF_UP` do 2 miejsc;
  - pozytywna, gdy łącznie: egzamin `TAK` lub `NIE_DOTYCZY`, sprawozdanie w terminie (`True`),
    najwyżej jedna ocena 3, średnia (surowa) ≥ 5 i komplet pięciu ocen; inaczej negatywna
    z powodami (paragrafy § 10 ust. 1 pkt 1–4 rozporządzenia z 2015 r.);
  - uzasadnienie obowiązkowe przy negatywnej; wnioski rozwojowe tylko przy pozytywnej;
  - brak informacji o egzaminie albo sprawozdaniu (`None`) = **błąd** (nie tylko warunek niespełniony).
- **Pola wejścia silnika** (`EvaluationRequest` w `app/schemas/models.py`):
  `egzamin_sluzba_przygotowawcza: TAK | NIE | NIE_DOTYCZY | None`,
  `sprawozdanie_zlozone_w_terminie: bool | None`, `data_rozmowy_wstepnej`, `data_rozmowy_oceniajacej`,
  `termin_zlozenia_sprawozdania_od/do`, `okres_oceny_od/do`, `uzasadnienie`,
  `wnioski_rozwojowe_pierwsza_ocena`.
- **Trasy**:
  - `POST /evaluations/evaluate` i `POST /evaluations/pdf` przyjmują pełny `EvaluationRequest`
    (także pierwszą ocenę) — bezstanowo, bez zapisu.
  - `POST /calculate-score` — wskazówka dla jednego kryterium w skali 1/3/5/7/9 (progi § 11 ust. 1 pkt 2
    rozporządzenia z 2016 r.; remis daje niższy poziom). **Nie ma** wersji dla skali 3/5/7.
  - `GET /competencies?form_type=FIRST_EVAL_FORM` — model z flagą `is_mandatory_for_selected_form`
    (sprawdzone: prawda dla C01, C02, C03, C04, C06).
  - Trasy danych `/assessments*` — opis niżej.

## 2. Skąd pięć elementów i wskaźniki

Z modelu kompetencji (`data/processed/competency_model.json`), flaga `mandatory_for_first_eval`:
C01 Rzetelność (2 wskaźniki), C02 Komunikacja (4), C03 Wykorzystywanie wiedzy i doskonalenie zawodowe (3),
C04 Organizacja pracy i orientacja na osiąganie celów (5), C06 Współpraca (6). Osobnej struktury nie ma.
Wskaźniki mają poziomy 1/3/5/7/9 jak w ocenie okresowej. Nazwy z modelu backend mapuje na nazwy
z rozporządzenia przez `normalize_criterion_name` (przy zakończeniu idą nazwy, nie identyfikatory).

## 3. Szkic pierwszej oceny w trasach danych

- `POST /assessments` `{employee_id, kind: "first"}` — zamienia istniejącą nierozpoczętą ocenę w szkic
  albo tworzy nową; `form: "first"`, termin z `first_assessment_deadlines`. Działa.
- `PUT /assessments/{id}/draft` (`AssessmentDraftInput`): `form` (`"first"` dozwolone), `answers`,
  `decisions`, `justification_draft`, `last_step`, `additional_competency_ids`. Dodatkowe pola są
  **po cichu ignorowane** (`extra="ignore"`). Decyzje sprawdzane tylko względem skali 1/3/5/7/9, więc
  szkic przyjmie też 1 i 9. **Brak pól**: egzamin, sprawozdanie w terminie, data rozmowy wstępnej,
  data rozmowy oceniającej.
- `POST /assessments/{id}/complete` — ten sam kształt; buduje `EvaluationRequest` w
  `DataService._evaluation_request` **bez** egzaminu, sprawozdania i dat → `evaluate_first` zwraca
  błędy → 422 (patrz „Wniosek”). Blokada „wszystkie wskaźniki = brak podstaw” działa tylko dla B i C.
- `AssessmentRecord` (pamięć, Supabase, Postgres) też nie ma tych pól.
- **Baza ma już kolumny** w `evaluations`: `initial_talk_date` (date), `exam_passed` (varchar),
  `report_on_time` (boolean) — według `docs/supabase-istniejacy-schemat.md`; repozytoria Supabase/Postgres
  ich dziś nie czytają ani nie zapisują. Nie ma kolumny na datę rozmowy oceniającej.

## 4. Co po zakończeniu pierwszej oceny

Backend **nie przenosi** pracownika na ścieżkę okresową: `assessment_kind` zostaje `"first"`,
`form` zostaje `"first"`. W widoku pracownika (`_employee_view`) po zakończeniu: ostatnia ocena i wynik
są widoczne, a kolejny termin = data zakończenia + 24 miesiące (po negatywnej + 6) — reguła oceny
okresowej (§ 7 rozporządzenia z 2016 r.). Status `up_to_date`. Utworzenie potem oceny okresowej
(`POST /assessments` z `kind: "periodic"`) dostałoby arkusz `"first"`, bo bierze `employee.form`.
(Prawnie: po pozytywnej pierwszej ocenie umowa przechodzi w czas nieokreślony, po negatywnej stosunek
pracy się rozwiązuje — backend tego nie modeluje.)

## 5. PDF pierwszej oceny

`GET /assessments/{id}/pdf` działa dla szkicu pierwszej oceny (sprawdzone: 200, `application/pdf`,
ok. 140 kB), szablon `app/templates/pierwsza_ocena.html`. Pola egzaminu, sprawozdania, dat rozmów
i terminu sprawozdania będą jednak puste, bo `_evaluation_request` ich nie przekazuje; wynik w PDF
będzie negatywny z powodami „brak rozstrzygnięcia” (silnik dostaje `None`).

## Różnice między promptem etapu 5 a backendem

1. „Rozmowa oceniająca w ciągu 21 dni (§ 3)” — w backendzie 21 dni dotyczy **rozmowy wstępnej**
   (`FIRST_EVAL_INITIAL_INTERVIEW_DAYS`, `termin_rozmowy_wstepnej_max`). Rozmowa oceniająca to osobna
   data w arkuszu, bez terminu 21 dni.
2. Mapowanie 1/3 → 3, 5 → 5, 7/9 → 7 nie istnieje w backendzie; `/calculate-score` zwraca poziom
   w skali 1–9. Mapowanie byłoby regułą po stronie frontendu (tylko wskazówka) albo nową trasą.
3. „Wyjątek z § 10 ust. 3” w backendzie to wartość `NIE_DOTYCZY` pola egzaminu.
4. Warunek średniej: backend wymaga też kompletu pięciu ocen (brak elementu = negatywna).

## Najmniejsza zmiana backendu, która odblokuje formularz (propozycja, niewprowadzona)

Bez nowych tabel i kolumn:
1. `AssessmentDraftInput`, `AssessmentDetail`, `AssessmentRecord`: nowe **opcjonalne** pola
   `exam_status: "passed" | "exempt" | "failed" | None`, `report_on_time: bool | None`,
   `initial_interview_date: date | None`, `evaluation_interview_date: date | None`.
2. `save_assessment_draft` i `complete_assessment` zapisują je; dla `form == "first"` sprawdzanie skali
   3/5/7 w decyzjach i blokada „wszystkie wskaźniki = brak podstaw”.
3. `_evaluation_request` przekazuje je do silnika (`passed`→`TAK`, `exempt`→`NIE_DOTYCZY`,
   `failed`→`NIE`) oraz terminy sprawozdania i okres z `first_assessment_deadlines`.
4. Repozytorium Supabase/Postgres: mapowanie na istniejące kolumny `exam_passed`, `report_on_time`,
   `initial_talk_date`. Data rozmowy oceniającej — tylko w pamięci albo prośba o kolumnę
   (do `prosby-dla-kolegi.md`).
5. Opcjonalnie (krok 5): po zakończeniu pierwszej oceny z wynikiem pozytywnym ustawić pracownikowi
   `assessment_kind: "periodic"` i `form: null` (arkusz B/C wybierany z opisu stanowiska). To już
   decyzja o regule — do potwierdzenia.
