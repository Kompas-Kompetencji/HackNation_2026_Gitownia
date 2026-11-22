# Spięcie frontendu z backendem

Stan na 21 listopada 2026 (aktualizacja: przełączenie na gałąź `backend-dane`).
Backend: gałąź `backend-dane` (odcięta od `feature/wspolne-klejenie`), FastAPI, trasy pod `/api/v1`,
dane w pamięci procesu (domyślnie) albo w Supabase (`DATA_BACKEND=supabase`). Na `main` kodu
backendu nadal nie ma (pusty odnośnik do podmodułu).
Prośby o zmiany po stronie backendu: [prosby-dla-kolegi.md](prosby-dla-kolegi.md).

## Uruchomienie z prawdziwym API

```
# backend: osobny katalog roboczy z gałęzią backend-dane
git worktree add ../HackNation_2026_Gitownia-backend-dane backend-dane
cd ../HackNation_2026_Gitownia-backend-dane/backend
python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8000     # bez --reload: dane pamięciowe znikają przy restarcie

# frontend (gałąź maxxw28)
cd frontend
npm run dev:mixed      # .env.mixed: VITE_REAL_API=* (wszystkie funkcje na backendzie)
```

Zmienne (`frontend/.env.*`):

| Zmienna | Znaczenie |
|---|---|
| `VITE_USE_MOCKS` | `false` = wszystkie funkcje z backendu; `true` = makiety poza `VITE_REAL_API` |
| `VITE_REAL_API` | lista funkcji `api.ts` na prawdziwym API, po przecinku; `*` = wszystkie (z `backend-dane` to cała lista) |
| `VITE_API_URL` | adres backendu z przeglądarki, domyślnie `/api/v1` (proxy Vite, bez CORS) |
| `BACKEND_PROXY_TARGET` | dokąd proxy Vite przekazuje `/api` (domyślnie `http://localhost:8000`) |

Każde zapytanie niesie nagłówek `X-User-Id` z sesji demonstracyjnej (`sessionStorage`).
Błąd sieci (backend wyłączony, proxy zwraca pusty 500/502) → `ApiError` ze `status: 0`; ekrany
pokazują swój komunikat i „Spróbuj ponownie”.

Przy `VITE_REAL_API` niepustym flaga `USE_MOCKS` (etykiety „dane przykładowe”) jest `false`.
Przy `*` to poprawne, bo żadna funkcja nie zostaje na makietach.

`.env.development` (zwykłe `npm run dev`) nadal działa w całości na makietach, bez backendu.

## Funkcje `api.ts` → backend

Wszystkie funkcje `api.ts` mają trasę w backendzie; makiet przy `VITE_REAL_API=*` nie używa żadna.

| Funkcja `api.ts` | Trasa backendu | Uwagi |
|---|---|---|
| `getCompetencies()` | `GET /competencies` | adapter id 1–14 → `C01`–`C14` |
| `getAssessmentTemplate(form)` | `GET /competencies?form_type=FORM_B\|FORM_C` | limit dodatkowych na sztywno (3) |
| `analyzeOsp(file)` | `POST /osp/parse` (multipart `file`) | adapter pól po polsku |
| `calculateScore(answers)` | `POST /calculate-score` | bez adaptera (obejście przez `/evaluations/evaluate` usunięte) |
| `evaluateAssessment(input)` | `POST /evaluations/evaluate` | adapter pól po polsku |
| `askAiAssistant(question, mode)` | `POST /ai-assistant` (most zgodności) | adapter usuwa „(Podstawa: …)” i `**` |
| `exportAssessmentPdf(id)` | `GET /assessments/{id}/pdf` | backend składa arkusz z zapisanej oceny |
| `getFirstAssessmentSchedule(input)` | `POST /deadlines/calculate` | adapter pól po polsku |
| `listDemoUsers()`, `getUser(id)` | `GET /auth/demo-users`, `GET /users/{id}` | bez adaptera |
| `listEmployees()`, `getEmployee(id)`, `createEmployee(data)` | `GET /employees`, `GET /employees/{id}`, `POST /employees` | bez adaptera; 404 → `null`, 403 → `ApiError` |
| `listNotes(id)`, `addNote(id, text)` | `GET/POST /employees/{id}/notes` | bez adaptera |
| `listJobDescriptions(id)`, `attachJobDescription(id, file, analysis?)` | `GET/POST /employees/{id}/job-descriptions` | multipart `file` + `confirmed_analysis` (JSON) |
| `listAssessments(filters)` | `GET /assessments?employee_id=&supervisor_id=&status=` | bez adaptera |
| `getAssessment(id)` | `GET /assessments/{id}` | 404 → `null`, 403 → `ApiError` |
| `createAssessmentDraft(input)` | `POST /assessments` | istniejący szkic albo nierozpoczęta ocena zamiast nowej |
| `saveAssessmentDraft(id, input)` | `PUT /assessments/{id}/draft` | 409, gdy zakończona |
| `completeAssessment(id, input)` | `POST /assessments/{id}/complete` | 422 przy brakach; wynik w `evaluation` |

Trasy danych backend zwraca w kształcie `frontend/src/types/index.ts` (snake_case, identyfikatory
tekstowe, daty `RRRR-MM-DD`, czas `…Z`), więc nie potrzebują adapterów.

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

Zgodne 1:1 z `POST /calculate-score`: `{answers}` → `{mean, suggested_level, counted_indicators}`,
„brak podstaw” = `selected_level: null` (nie wchodzi do średniej), błąd skali i pusta lista → 422
z `detail` po polsku. Różnica względem makiety: remis na granicy przedziału daje niższy poziom
(średnia 4,00 → 3; makieta dawała 5). Tak zostaje (decyzja: wskazówka według § 11 ust. 1 pkt 2).

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

`GET /assessments/{id}/pdf` → `application/pdf`. Backend sam składa `EvaluationRequest` z zapisanej
oceny, pracownika i przełożonego. Nadal puste w arkuszu: daty rozmów, okres oceny, wnioski IPRZ,
poprzednia ocena (ani frontend, ani backend ich nie zbierają).

### `getFirstAssessmentSchedule` (`FirstAssessmentSchedule` ← `DeadlineResponse`)

| Frontend | Backend |
|---|---|
| wejście `hire_date`, `contract_end_date` | `data_nawiazania_stosunku_pracy`, `data_zakonczenia_umowy` (+ `evaluation_type: FIRST_EVALUATION`) |
| `introductory_interview_due` | `termin_rozmowy_wstepnej_max` |
| `first_assessment_period_start` | `termin_dokonania_oceny_min` |
| `first_assessment_period_end` | `termin_dokonania_oceny_max` |
| `contract_type` | nieużywane przez backend |

## Pełna ścieżka na prawdziwym API (backend-dane, 21.11.2026)

Tryb `npm run dev:mixed` (`VITE_REAL_API=*`), backend `backend-dane` lokalnie w wersji pamięciowej,
bez Supabase. Żadna funkcja nie korzystała z makiet.

| Krok | Trasy | Wynik |
|---|---|---|
| Logowanie jako przełożona (sup-001) | `GET /auth/demo-users` | działa |
| Lista pracowników | `GET /employees` | działa: 3 pracowników, statusy i terminy z backendu (termin minął 14.10.2026, wkrótce 9.12.2026, aktualna 20.05.2027) |
| Dodanie pracownika, pierwsza ocena (Anna Testowa, umowa do 1.11.2027) | `POST /deadlines/calculate`, `POST /employees` | działa: rozmowa wstępna do 23.11.2026, ocena 2.07–1.10.2027; po utworzeniu panel pracownika, status „Czeka na pierwszą ocenę”, nierozpoczęta pierwsza ocena na liście |
| Panel pracownika | `GET /employees/{id}`, `/notes`, `/job-descriptions`, `/assessments?employee_id=` | działa |
| Notatka | `POST /employees/{id}/notes` | działa, widoczna od razu i po odświeżeniu |
| Szkic oceny okresowej (Joanna Pietrzyk, arkusz C) | `GET /assessments/as-001`, `POST /calculate-score` (24 razy), `PUT /assessments/as-001/draft` (8 razy) | działa: wskazówki z backendu (np. 7 + „brak podstaw” → 7,0, poziom 7) |
| Odświeżenie strony w trakcie szkicu | `GET /assessments/as-001` | dane zostają: 28 odpowiedzi, 8 decyzji, 3 kryteria dodatkowe, powrót do ostatniego kroku |
| Podsumowanie i zakończenie | `POST /evaluations/evaluate`, `POST /assessments/as-001/complete` | działa: pozytywna, średnia 5,25; następna ocena 21.11.2028, status „Ocena aktualna” |
| Odświeżenie po zakończeniu | `GET /employees/emp-001` | dane zostają: ostatnia ocena 21.11.2026, pozytywna; nowy pracownik i notatka nadal są |
| Widok historii (zakończona ocena) | `GET /assessments/as-001` | działa: widok tylko do odczytu z wynikiem z backendu |
| Pobranie PDF | `GET /assessments/as-001/pdf` | działa: `application/pdf`, 145 KB |
| Przełożony 2 (sup-002) otwiera pracownicę przełożonego 1 | `GET /employees/emp-001` → 403 | ekran „Brak dostępu”; `/assessments/as-001`, `/notes`, `/pdf` też 403; lista ma tylko jego pracownika |
| Kadry (hr-001) | `GET /employees`, `GET /assessments` | API: 5 pracowników i 11 ocen obu przełożonych; dodanie notatki → 403. Ekran kadr we frontendzie to jeszcze zaślepka (etap 6), więc tylko przez API |

Dane wersji pamięciowej trwają do restartu backendu (odświeżenie strony ich nie kasuje).

### Co się jeszcze nie zgadza

1. **Kadry dostają pełną treść oceny** (`GET /assessments/{id}` → 200 z odpowiedziami i decyzjami),
   a wymagania mówią „bez szczegółów ocen”. Prośba do backendu (punkt 9 w prośbach).
2. **Wskazówka przy remisie** daje niższy poziom niż makieta (4,00 → 3). Zgodne z decyzją; makieta
   frontendu nadal zaokrągla w górę, więc tryb makiet i tryb z API różnią się w tym miejscu.
3. **Nowy pracownik z kreatora pierwszej oceny** dostaje komórkę przełożonego („Departament Spraw
   Obywatelskich”), bo kreator wysyła `organizational_unit: null`. Tak samo robiła makieta.
4. Niezmienione od poprzedniego przejścia: nazwa stanowiska i kryteria dodatkowe z `/osp/parse`,
   ucięte odpowiedzi asystenta formalnego, asystent rozmowy bez stanu oceny, kropka w liczbach
   w `powody_werdyktu` („5.25 pkt”).
5. Ekran kadr nie jest jeszcze zbudowany we frontendzie (etap 6), więc widok kadr sprawdziłem tylko
   przez API.
6. Supabase (`DATA_BACKEND=supabase`) nie był sprawdzany z frontendem: wymaga uruchomienia
   `supabase/schema-additions.sql` na prawdziwej bazie.

## Wcześniejsze przejście (feature/wspolne-klejenie, dane na makietach)

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
