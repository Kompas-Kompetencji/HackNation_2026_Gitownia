# Spięcie frontendu z backendem

Stan na 21 listopada 2026. Backend: gałąź `feature/wspolne-klejenie` (commit `7df87ca`), FastAPI,
trasy pod `/api/v1`, bez bazy danych. Na `main` kodu backendu nie ma (pusty odnośnik do podmodułu).
Prośby o zmiany po stronie backendu: [prosby-dla-kolegi.md](prosby-dla-kolegi.md).

## Uruchomienie trybu mieszanego

```
# backend (katalog backend/ z gałęzi feature/wspolne-klejenie)
python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# frontend
cd frontend
npm run dev:mixed      # .env.mixed: makiety + funkcje z VITE_REAL_API na backendzie
```

Zmienne (`frontend/.env.*`):

| Zmienna | Znaczenie |
|---|---|
| `VITE_USE_MOCKS` | `false` = wszystkie funkcje z backendu; `true` = makiety poza `VITE_REAL_API` |
| `VITE_REAL_API` | lista funkcji `api.ts` na prawdziwym API, po przecinku; `*` = wszystkie gotowe w backendzie |
| `VITE_API_URL` | adres backendu z przeglądarki, domyślnie `/api/v1` (proxy Vite, bez CORS) |
| `BACKEND_PROXY_TARGET` | dokąd proxy Vite przekazuje `/api` (domyślnie `http://localhost:8000`) |

Błąd sieci (backend wyłączony, proxy zwraca pusty 500/502) → `ApiError` ze `status: 0`; ekrany
pokazują swój komunikat i „Spróbuj ponownie” (bez zmian w komponentach).

W trybie mieszanym flaga `USE_MOCKS` (etykiety „dane przykładowe” w komponentach) jest `false`,
więc etykiety znikają także przy funkcjach, które nadal są na makietach (np. logowanie).

## Funkcje `api.ts` → backend

| Funkcja `api.ts` | Trasa backendu | Stan |
|---|---|---|
| `getCompetencies()` | `GET /competencies` | podłączona, adapter id 1–14 → `C01`–`C14` |
| `getAssessmentTemplate(form)` | `GET /competencies?form_type=FORM_B\|FORM_C` | podłączona, limit dodatkowych na sztywno (3) |
| `analyzeOsp(file)` | `POST /osp/parse` (multipart `file`) | podłączona, adapter pól po polsku |
| `calculateScore(answers)` | brak; obejście przez `POST /evaluations/evaluate` | podłączona tymczasowo |
| `evaluateAssessment(input)` | `POST /evaluations/evaluate` | podłączona |
| `askAiAssistant(question, mode)` | `POST /ai-assistant` (most zgodności) | podłączona |
| `exportAssessmentPdf(id)` | `POST /evaluations/pdf` (pełny `EvaluationRequest`) | podłączona |
| `getFirstAssessmentSchedule(input)` | `POST /deadlines/calculate` | podłączona |
| `listDemoUsers`, `getUser` | brak | makieta |
| `listEmployees`, `getEmployee`, `createEmployee` | brak | makieta |
| `listNotes`, `addNote` | brak | makieta |
| `listJobDescriptions`, `attachJobDescription` | brak | makieta |
| `listAssessments`, `getAssessment`, `createAssessmentDraft`, `saveAssessmentDraft`, `completeAssessment` | brak | makieta |

Nieużywane przez frontend: `GET /health`, `POST /ai/formal-chat`, `POST /ai/coaching-assistant`
(pełniejsze kontrakty asystentów z `form_state` i `form_patches`).

## Różnice: typy frontendu a odpowiedzi backendu

### `getCompetencies` (`CompetencyModel`)

| Frontend | Backend | Adapter |
|---|---|---|
| `competency_id: "C01"` | `id: 1` (liczba) | `C` + dwie cyfry |
| `indicators[].indicator_id: "C01_I01"` | `indicators[].id` | bez zmian |
| `indicators[].description` | `indicators[].indicator` | zmiana nazwy |
| `level_descriptions: {1: "…"}` | `levels: {"1": "…"}` | klucze tekstowe → liczby |
| `definition` | brak | `null` |
| — | `upper_name`, `indicator_count`, `mandatory_for_B/C/first_eval`, `rating_scale`, `summary`, `title` | pomijane (flagi obowiązkowości idą do `getAssessmentTemplate`, `rating_scale` do `calculateScore`) |

### `analyzeOsp` (`OspAnalysis` ← `OspParseResult`)

| Frontend | Backend | Adapter / różnica |
|---|---|---|
| `filename` | brak | nazwa wysłanego pliku |
| `position_title` | `stanowisko_pracy` | **backend zwraca nagłówek „NAZWA STANOWISKA PRACY”**; adapter bierze wtedy nazwę z nazwy pliku |
| `organizational_unit` | `komorka_organizacyjna` | `""` → `null` |
| `has_management_duties` | `kieruje_pracownikami` | zmiana nazwy |
| `subordinates_count: number \| null` | `liczba_podleglych_tekst` (tekst opcji) | „brak” → `0`; przedział („od 5 do 9”) → `null`, przełożony wpisuje |
| `suggested_form: "B" \| "C"` | `zalecany_arkusz: "FORM_B" \| "FORM_C"` | `FORM_X` → `X` |
| `additional_criteria` (3 × `{criterion_id, name, rationale}`) | brak; jest `kompetencje_miekkie_z_osp` (nazwy) | kompetencje z pkt 13 bez obowiązkowych, do 3; **zwykle 0–1 zamiast 3**, uzasadnienie ogólne |
| — | `nazwa_urzedu`, `symbol_stanowiska`, `cel_stanowiska`, `zadania_*`, `warnings` | pomijane |

### `calculateScore` (`ScoreResult`)

| Frontend | Backend (obejście `/evaluations/evaluate`) | Różnica |
|---|---|---|
| `mean` | `srednia_arytmetyczna` | zgodne (2 miejsca po przecinku) |
| `suggested_level` | `ogolny_poziom` (etykieta) → poziom z `rating_scale` | **remisy w dół**: średnia 2/4/6/8 → 1/3/5/7 (makieta: w górę) |
| `counted_indicators` | brak | liczone w adapterze (liczba wskaźników z poziomem) |
| 422 przy złym poziomie | 200 z `errors: ["Niedozwolona ocena…"]` | adapter zamienia na `ApiError(422)` |
| „brak podstaw” = `selected_level: null` | brak pojęcia na poziomie wskaźnika | wskaźniki z `null` nie są wysyłane; same `null` → wynik pusty bez zapytania |

### `evaluateAssessment` (`AssessmentEvaluation` ← `EvaluationResponse`)

| Frontend | Backend |
|---|---|
| `mean` | `srednia_arytmetyczna` |
| `overall_level` | `ogolny_poziom` |
| `result: "positive" \| "negative"` | `werdykt: "POZYTYWNA" \| "NEGATYWNA"` |
| `reasons` | `powody_werdyktu` (liczby z kropką: „5.25 pkt”) |
| `justification_required` | `uzasadnienie_obowiazkowe` |
| `development_criteria` | `iprz_mandatory_criteria` |
| `errors`, `warnings` | `errors`, `warnings` (błędy formalne z kodem 200) |
| — | `wnioski_rozwojowe_dozwolone`, `include_part_3` (pomijane) |

Żądanie: `decisions[].competency_id` → `oceny_czastkowe[].name` (nazwa z modelu), `selected_level` →
`score`, `form` → `FORM_B/FORM_C`, `justification_draft` → `uzasadnienie`.
„Brak podstaw do oceny” dla całego kryterium nie istnieje w backendzie (`score` wymagane).

### `askAiAssistant` (`AssistantAnswer`)

Kształt zgodny (`mode`, `status`, `answer`, `sources[].document_title/location/excerpt`). Różnice:
odpowiedź ucięta po ok. 300 znakach i z doklejonym „(Podstawa: …)” (adapter usuwa dopisek),
Markdown `**…**` (adapter usuwa), tryb `interview` bez stanu oceny (zawsze „formularz niekompletny”),
stałe źródło w trybie `interview`.

### `exportAssessmentPdf`

Frontend: `exportAssessmentPdf(id)` → `Blob`. Backend nie zna ocen, więc adapter składa
`EvaluationRequest` z `getAssessment(id)`, `getEmployee`, `getUser` (oceniający z sesji) i nazw kryteriów:
`oceniany.{imie, nazwisko, komorka_organizacyjna, stanowisko_pracy, data_nawiazania_stosunku_pracy}`,
`oceniajacy.{imie, nazwisko, komorka_organizacyjna, stanowisko_pracy}`, `data_sporzadzenia_oceny`
(= `completed_at`), `oceny_czastkowe`, `uzasadnienie`. Nie wysyłamy: dat rozmów, okresu oceny,
wniosków IPRZ, poprzedniej oceny (frontend ich nie zbiera), więc te pola arkusza są puste.

### `getFirstAssessmentSchedule` (`FirstAssessmentSchedule` ← `DeadlineResponse`)

| Frontend | Backend |
|---|---|
| wejście `hire_date`, `contract_end_date` | `data_nawiazania_stosunku_pracy`, `data_zakonczenia_umowy` (+ `evaluation_type: FIRST_EVALUATION`) |
| `introductory_interview_due` | `termin_rozmowy_wstepnej_max` |
| `first_assessment_period_start` | `termin_dokonania_oceny_min` |
| `first_assessment_period_end` | `termin_dokonania_oceny_max` |
| `contract_type` | nieużywane przez backend |

## Ścieżka oceny okresowej na prawdziwych odpowiedziach (21.11.2026)

Tryb `npm run dev:mixed`, przełożona sup-001, pracownica Joanna Pietrzyk (arkusz C), backend lokalnie.

| Krok | Źródło | Wynik |
|---|---|---|
| Logowanie, lista pracowników, panel pracownika | makiety | działa |
| Asystent formalny w panelu pracownika | backend `/ai-assistant` | działa: odpowiedź i dwa źródła z rozporządzeń; odpowiedź ucięta w połowie słowa i nie na temat pytania |
| Konfiguracja oceny: model kompetencji, kryteria obowiązkowe C | backend `/competencies`, `/competencies?form_type=FORM_C` | działa; kolejność kryteriów obowiązkowych wg modelu, nie wg arkusza |
| Wskazówka poziomu dla kryterium | backend (obejście przez `/evaluations/evaluate`) | działa: 7 + „brak podstaw” → średnia 7,0, poziom 7; remisy zaokrąglane w dół |
| Podsumowanie: wynik oceny | backend `/evaluations/evaluate` | działa: pozytywna, średnia 5,25, ogólny poziom „na poziomie oczekiwań”, uwaga o IPRZ dla „Współpraca” |
| Pobranie PDF | backend `/evaluations/pdf` | działa: arkusz C (145 KB), polskie znaki, zaznaczone oceny, dane ocenianego i oceniającego |
| Asystent rozmowy („Przygotuj rozmowę”) | backend `/ai-assistant` (`interview`) | odpowiada, ale treść bezużyteczna: „formularz niekompletny” mimo pełnej oceny |
| Zapis szkicu, zakończenie oceny | makiety | działa w pamięci przeglądarki (znika po odświeżeniu) |
| Analiza opisu stanowiska (3 prawdziwe pliki OSP) | backend `/osp/parse` | arkusz B/C poprawny (naczelnik → B, pozostali → C), komórka poprawna; nazwa stanowiska tylko z nazwy pliku; kryteria dodatkowe: 1, 0 i 1 zamiast 3; liczba podległych przy naczelniku pusta |
| Backend wyłączony | — | ekran oceny: „Nie udało się wczytać oceny.” + „Spróbuj ponownie”; po włączeniu backendu ponowna próba wczytuje ocenę |

Terminy pierwszej oceny (`getFirstAssessmentSchedule`) i szablon arkusza B sprawdzone wywołaniem
funkcji `api.ts` w działającej aplikacji: umowa do 31.08.2027 → rozmowa wstępna do 22.09.2026, ocena
1.05–31.07.2027; arkusz B → obowiązkowe C02, C04, C06, C13, C14.

Nie sprawdzone przez interfejs: wgranie pliku w kreatorze przez okno wyboru pliku (analizę
sprawdziłem wywołaniem `analyzeOsp` z prawdziwymi plikami w działającej aplikacji) i wyświetlenie
terminów w kreatorze.
