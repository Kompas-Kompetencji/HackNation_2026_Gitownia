# Stan repozytorium po integracji (frontend, backend, Supabase)

Stan na 22 listopada 2026, około godziny 4:00. Przegląd gałęzi `main` (commit `6e125fb`, „Summing up all
of the branches”). Lokalna kopia była zgodna z serwerem GitHub (sprawdzone poleceniem `git ls-remote`).
Podczas przeglądu nie zmieniono żadnego pliku z kodem i nie wykonano żadnego zapisu w bazie danych.
Wdrożoną aplikację sprawdzono wyłącznie zapytaniami odczytu (GET). Testy backendu działały na danych
w pamięci, a budowanie frontendu tworzy tylko katalog `frontend/dist`, który jest ignorowany przez Git.

---

## 1. Struktura katalogów

### Katalog główny

| Plik lub katalog | Do czego służy |
|---|---|
| `README.md` | Opis projektu, architektura, uruchomienie lokalne, wdrożenie na Azure Container Apps. |
| `Dockerfile` | Jeden obraz: najpierw budowanie frontendu (Node 22), potem backend (Python 3.12) z bibliotekami do PDF; zbudowany frontend trafia do `backend/static` i jest serwowany przez backend z tego samego adresu. Przy budowaniu powstaje indeks wyszukiwania dokumentów (`scripts/build_rag_index.py`). |
| `docker-compose.yml` | Uruchomienie całości lokalnie jak na serwerze (port 8000), zmienne z `backend/.env`. |
| `.gitignore`, `.dockerignore` | Wykluczenie plików z kluczami (`.env`), środowisk Pythona, `node_modules`, `frontend/dist`, `backend/static`, `backend/chroma_db`. |
| `.ENV` (lokalnie, nieśledzony) | Plik z kluczami na tym komputerze, ignorowany przez Git. Zawiera zmienne o nazwach: `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `LLM_API_KEY`, `LLM_MODEL_NAME`. Uwaga: backend czyta `.env` z bieżącego katalogu, a `docker-compose.yml` czyta `backend/.env`, więc ten plik w katalogu głównym nie jest używany przy standardowym uruchomieniu. |

### `frontend/` (React 19, Vite 6, TypeScript, Tailwind 4)

| Plik | Do czego służy |
|---|---|
| `package.json` | Skrypty: `dev` (makiety), `dev:mixed` (prawdziwe API przez serwer pośredniczący Vite), `build`, `lint`, `preview`. |
| `vite.config.ts` | Serwer deweloperski na porcie 5173, przekazywanie `/api` do `BACKEND_PROXY_TARGET`. |
| `.env.development`, `.env.example` | Tryb domyślny: wszystko na danych przykładowych. |
| `.env.mixed` | Tryb mieszany (`npm run dev:mixed`): wszystkie funkcje z prawdziwego backendu. |
| `.env.production` | Budowanie produkcyjne: wszystkie funkcje z backendu pod adresem względnym `/api/v1`. |
| `src/App.tsx` | Trasy: `/logowanie`, `/przelozony` (lista pracowników, kreator, panel pracownika, ocena), `/kadry`. |
| `src/lib/api.ts` | Jedyne miejsce z zapytaniami sieciowymi; przełącznik danych przykładowych i adaptery odpowiedzi backendu. |
| `src/lib/mocks/*` | Dane przykładowe (pracownicy, oceny, asystent, model kompetencji, prosty generator PDF). |
| `src/lib/texts.ts` | Wszystkie teksty interfejsu po polsku. |
| `src/types/index.ts` | Kontrakt danych frontendu (typy). |
| `src/auth/*` | Logowanie demonstracyjne (wybór konta), ochrona tras według roli. |
| `src/layout/AppLayout.tsx`, `src/assistant/AssistantPanel.tsx` | Układ strony i panel asystenta (formalny i do rozmowy). |
| `src/pages/SupervisorHomePage.tsx` | Lista pracowników przełożonego oraz kalendarz terminów. |
| `src/pages/HrHomePage.tsx` | Panel kadr: liczniki statusów, kalendarz terminów, tabela wszystkich pracowników. |
| `src/pages/wizard/*` | Kreator dodania pracownika (dane, opis stanowiska z analizą, podsumowanie z terminami). |
| `src/pages/employee/*` | Panel pracownika: nagłówek z terminami, przedłużenie umowy, historia ocen, opisy stanowiska, notatki. |
| `src/pages/assessment/*` | Formularz oceny okresowej (arkusze B i C), podsumowanie, widok zakończonej oceny. Dla pierwszej oceny wyświetla się zaślepka. |
| `src/components/calendar/AssessmentCalendar.tsx` | Kalendarz terminów z `GET /calendar`; dla kadr przycisk „Przypomnij” otwierający wiadomość e-mail (`mailto:`). |

### `backend/` (FastAPI, Python 3.12)

| Plik | Do czego służy |
|---|---|
| `app/main.py` | Aplikacja, CORS, trasy podstawowe (`/health`, `/competencies`, `/osp/parse`, `/deadlines/calculate`, `/evaluations/evaluate`, `/evaluations/pdf`), dołączenie tras asystenta i danych, serwowanie zbudowanego frontendu. |
| `app/core/config.py` | Ustawienia aplikacji (CORS, model językowy, stałe prawne). |
| `app/core/scoring_engine.py` | Deterministyczny silnik oceny (średnia, poziom, wynik pozytywny lub negatywny, powody). |
| `app/core/deadline_calc.py` | Terminy pierwszej oceny i oceny okresowej (święta, artykuły 112 i 115 Kodeksu cywilnego). |
| `app/routers/data_router.py` | Trasy danych: użytkownicy, pracownicy, kalendarz, przedłużenie umowy, notatki, opisy stanowiska, oceny, PDF zapisanej oceny, `POST /calculate-score`. |
| `app/routers/ai_router.py` | Asystenci: `/ai/status`, `/ai/formal-chat`, `/ai/coaching-assistant` i most zgodności `/ai-assistant` używany przez frontend. |
| `app/data/service.py` | Logika danych i uprawnień (przełożony, kadry), statusy i terminy pracowników, kalendarz. |
| `app/data/memory_repo.py`, `seed_data.py` | Dane w pamięci procesu (znikają po restarcie). |
| `app/data/supabase_repo.py` | Dostęp do Supabase przez interfejs REST (PostgREST). |
| `app/data/postgres_repo.py` | Dostęp bezpośredni do bazy Postgres (Supabase) przez `DATABASE_URL`; przy starcie uruchamia migracje. |
| `app/data/migrations/001_schema_additions.sql`, `002_replacement_contracts.sql` | Kopie skryptów z `supabase/`, uruchamiane automatycznie przy starcie (tylko dodają tabele i kolumny). |
| `app/data/settings.py`, `factory.py` | Wybór warstwy danych: `postgres`, `supabase` albo `memory`. |
| `app/services/rag_service.py` | Wyszukiwanie fragmentów dokumentów i asystent formalny (z propozycjami zmian formularza). |
| `app/services/coaching_service.py` | Asystent rozmowy oceniającej. |
| `app/services/llm_client.py` | Klient modelu językowego (Gemini, OpenAI, Groq, OpenRouter, własny adres zgodny z OpenAI), modele zapasowe, limity czasu. |
| `app/services/pii_guard.py` | Usuwanie danych osobowych z pytań przed wysłaniem do modelu. |
| `app/services/osp_parser.py` | Analiza pliku opisu stanowiska pracy (.docx). |
| `app/services/pdf_generator.py`, `app/templates/*` | Generator urzędowych arkuszy PDF (B, C, pierwsza ocena). |
| `data/raw/*` | Źródła: rozporządzenia, poradniki, odpowiedzi na pytania Departamentu Służby Cywilnej, model kompetencji, trzy przykładowe opisy stanowiska. |
| `data/processed/competency_model.json`, `rag_chunks.json` | Model kompetencji z arkusza Excel i fragmenty dokumentów do wyszukiwania (543 fragmenty). |
| `scripts/*` | Budowanie modelu kompetencji, indeksu dokumentów i pliku `supabase/seed.sql`. |
| `tests/*` | 63 testy (reguły prawne, kontrakty, trasy danych, adapter Supabase, klient modelu, indeks dokumentów). |
| `.env.example` | Wzór zmiennych środowiskowych backendu. |

### `supabase/`

| Plik | Do czego służy |
|---|---|
| `schema-additions.sql` | Nowe tabele `evaluation_indicator_answers`, `employee_notes`, `job_descriptions` oraz nowe kolumny w `employees`, `evaluations`, `evaluation_criteria`. Tylko dodaje. |
| `schema-additions-002.sql` | Kolumna `employees.first_eval_agreement_date` (zastępstwo). |
| `seed.sql` | Fikcyjne dane demonstracyjne (identyfikatory od 9001), bez nadpisywania istniejących. |

### `docs/`

| Plik | Zawartość |
|---|---|
| `wymagania-frontend.md` | Zasady pracy nad frontendem. |
| `spiecie-z-backendem.md` | Mapowanie funkcji `api.ts` na trasy backendu i różnice w polach. |
| `prosby-dla-kolegi.md` | Prośby frontendu do backendu (punkty 0–9). |
| `dla-kolegi-backend.md` | Instrukcja uruchomienia backendu z gałęzi `backend-dane`. |
| `supabase-istniejacy-schemat.md` | Opis istniejących tabel w Supabase. |
| `opis_projektu.md`, `opis_ai.md`, `architektura_wdrozeniowa.md` | **Puste pliki** (0 bajtów). |
| `prompty-etapy-5-7.md` | **Nie ma go w repozytorium.** Istnieje tylko lokalnie w katalogu Pobrane; przegląd etapów 5–7 w punkcie 8 opiera się na tej kopii. |
| `wdrozenie.md` | **Nie istnieje.** Instrukcja wdrożenia jest tylko w `README.md`. |

---

## 2. Historia zmian i gałęzie

### Gałęzie (lokalnie i na serwerze, stan zgodny)

| Gałąź | Ostatni commit | Zawartość |
|---|---|---|
| `main` | `6e125fb` (mostry, 22.11, 3:29) | Całość: frontend, backend, Supabase, dokumentacja. |
| `maxxw28` | `a653147` (Maxxw28, 21.11) | Sam frontend i dokumentacja frontendu (etapy 1–4 i spięcie z backendem). |
| `backend-dane` | `8c56e6b` (Maxxw28, 21.11) | Warstwa danych backendu (pamięć, Supabase), trasy danych, testy. |
| `feature/wspolne-klejenie` | `dbd204a` (scalenie żądania nr 1 z `backend-dane`) | Wcześniejsze sklejenie backendu 3ltey$ z frontendem i warstwą danych. |
| `Wertezaj`, `elteys`, `okolacki`, `remuwson` | `5ae0151` | Tylko pierwszy commit (puste, bez pracy). |

### Najważniejsza uwaga o historii

Gałąź `main` **nie ma wspólnego przodka z `maxxw28`** (`git merge-base main maxxw28` nic nie zwraca).
Historia `main` to dwa commity autora mostry: `f70b4fb` („first main structure test1”, commit bez rodzica)
i `6e125fb` („Summing up all of the branches”), który jednym commitem wstawia całą zawartość
(206 plików). Praca kolegów nie jest więc widoczna w historii jako osobne commity; da się ją odtworzyć
tylko porównując drzewa plików. Skutek: zwykłe `git merge maxxw28` do `main` (lub odwrotnie) zgłosi
„niepowiązane historie” i duże konflikty. Nowe gałęzie etapów 5–7 trzeba tworzyć **od `main`**, nie od `maxxw28`.

### Autorzy i tematy commitów

- **Remy**: `5ae0151` „Initial commit”.
- **3ltey$**: `23f93b0` silnik reguł prawnych, parser opisu stanowiska, terminy i generator PDF;
  `2cab1bb` scalenie; `57a13fa` ignorowanie plików edytora i `.env`; `7df87ca` „SKLEJONE ALEX + OLIVER”
  (backend z asystentami i frontend w jednym drzewie).
- **Maxxw28**: 36 commitów na `maxxw28` (etap 1: szkielet; etap 2: lista pracowników i kreator; etap 3: panel
  pracownika; etap 4: formularz oceny okresowej; tryb mieszany i adaptery w `api.ts`; dokumentacja spięcia
  i prośby) oraz 6 commitów na `backend-dane` (repozytorium w pamięci, trasy `/api/v1`, adapter Supabase,
  skrypty SQL, testy, instrukcja).
- **mostry**: `f70b4fb` i `6e125fb` na `main`.

### Co koledzy dodali lub zmienili (porównanie `backend-dane` i `maxxw28` z `main`)

**Backend** (względem `backend-dane`):
- Nowe `postgres_repo.py`: bezpośrednie połączenie z bazą przez `DATABASE_URL` (tak działa wdrożenie),
  z automatycznym uruchamianiem migracji przy starcie (`DB_AUTO_MIGRATE`, domyślnie włączone).
- Migracje `001_schema_additions.sql` i `002_replacement_contracts.sql`.
- Nowy typ umowy „zastępstwo” (`replacement`, w bazie `ZASTEPSTWO`) z datą porozumienia o pierwszej ocenie.
- Nowe trasy: `GET /calendar` (terminy procesu ocen) i `POST /employees/{id}/contract-extension`
  (przedłużenie umowy o czas nieobecności dłuższej niż 3 miesiące, artykuł 35 ustęp 4).
- `GET /health` pokazuje stan bazy, modelu językowego i indeksu dokumentów; obsługa błędu bazy kodem 503.
- Serwowanie zbudowanego frontendu przez backend (jeden adres, bez CORS).
- Przebudowany klient modelu językowego (rozpoznawanie dostawcy po kluczu, modele zapasowe, limity czasu),
  rozbudowane wyszukiwanie dokumentów (nowe źródło: odpowiedzi Departamentu Służby Cywilnej), filtr
  danych osobowych; usunięte `ai_chat_service.py` i `ai_models.py`.
- Nowe testy: `test_contracts_and_rules.py`, `test_llm_client.py`, `test_rag_index.py`, plik pytań jury.
- Usunięte z `data/raw`: wzory arkuszy B, C, pierwszej oceny (.docx) i grafika ścieżek oceny.
- Zmieniona kolejność kompetencji w `competency_model.json` (także w kopii we frontendzie).

**Baza**: `supabase/schema-additions-002.sql` (kolumna daty porozumienia); kopie skryptów jako migracje.

**Frontend** (względem `maxxw28`):
- `api.ts`: ponawianie odczytów (GET) do 3 razy przy braku połączenia i kodach 502/503/504; nowe funkcje
  `getCalendar` i `extendContract`; terminy pierwszej oceny przy zastępstwie liczone od daty porozumienia.
- Nowy komponent `AssessmentCalendar` (u przełożonego i u kadr).
- `HrHomePage`: zamiast pustego ekranu liczniki statusów (cztery kafelki z filtrem), kalendarz i tabela
  wszystkich pracowników.
- Kreator: typ umowy „zastępstwo”, data porozumienia, rodzaj oceny dobierany automatycznie do umowy,
  walidacja minimalnej długości umowy przy zastępstwie.
- Panel pracownika: okno przedłużenia umowy, data porozumienia w nagłówku.
- Formularz oceny: blokada „brak podstaw do oceny” dla ostatniego ocenianego wskaźnika kryterium.
- `AuthContext`: sesja usuwana tylko przy kodzie 401 lub 404 (błąd sieci jej nie kasuje).
- `.env.production` (nowy).

---

## 3. Uruchomienie lokalne

Uwaga: przy `DATABASE_URL` ustawionym w `backend/.env` backend łączy się z prawdziwą bazą i **przy starcie
wykonuje migracje** (zapis w bazie, choć tylko dodający). Do pracy bez wpływu na bazę nie ustawiaj
`DATABASE_URL` albo ustaw `DATA_BACKEND=memory`.

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # uzupełnij wartości; bez DATABASE_URL dane są w pamięci
uvicorn app.main:app --reload --port 8000
```

Dokumentacja tras: `http://localhost:8000/docs`, stan: `http://localhost:8000/api/v1/health`.

### Frontend

```powershell
cd frontend
npm ci
npm run dev          # wszystko na danych przykładowych, http://localhost:5173
npm run dev:mixed    # tryb mieszany: wszystkie funkcje z backendu na porcie 8000
```

### Całość w kontenerze

```powershell
docker compose up --build   # http://localhost:8000 (frontend i API razem)
```

### Zmienne środowiskowe (tylko nazwy)

Backend (`backend/.env` lokalnie, zmienne kontenera na serwerze):
- baza: `DATABASE_URL`, `DB_AUTO_MIGRATE`, `DATA_BACKEND` (`postgres`, `supabase`, `memory`),
  `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_TIMEOUT_SECONDS`, `DATA_TODAY`;
- bezpieczeństwo: `JWT_SECRET` (zarezerwowany, dziś nieużywany), `ALLOWED_ORIGINS`;
- model językowy: `LLM_API_KEY`, `LLM_MODEL_NAME`, `LLM_FALLBACK_MODELS`, `LLM_TIMEOUT_SECONDS`,
  `LLM_TOTAL_BUDGET_SECONDS`, `LLM_PROVIDER`, `LLM_BASE_URL` (zgodność wstecz: `GEMINI_API_KEY`,
  `OPENAI_API_KEY`, `GROQ_API_KEY`).

Frontend (pliki `frontend/.env.*`): `VITE_USE_MOCKS`, `VITE_REAL_API`, `VITE_API_URL`, `BACKEND_PROXY_TARGET`.

---

## 4. Funkcje z `src/lib/api.ts`

„Prawdziwe API” oznacza tryb `dev:mixed`, budowanie produkcyjne i wdrożenie (`VITE_REAL_API=*`). W trybie
`npm run dev` każda funkcja poza `extendContract` zwraca dane przykładowe.

| Funkcja | Trasa backendu | Prawdziwe API czy dane przykładowe | Różnice w polach (adapter w `api.ts`) |
|---|---|---|---|
| `getCompetencies` | `GET /competencies` | prawdziwe API | `id` 1–14 → `competency_id` „C01”–„C14”; `indicator` → `description`; `levels` (klucze tekstowe) → `level_descriptions`; brak `definition` (ustawiane `null`). |
| `getAssessmentTemplate` | `GET /competencies?form_type=FORM_B\|FORM_C` | prawdziwe API | Obowiązkowe z `is_mandatory_for_selected_form`; **limit kryteriów dodatkowych wpisany na stałe (3)**, backend go nie zwraca. |
| `analyzeOsp` | `POST /osp/parse` | prawdziwe API | Pola po polsku → po angielsku; `stanowisko_pracy` zwraca nagłówek tabeli, więc nazwa brana z nazwy pliku; liczba podległych z tekstu (przy przedziale `null`); kryteria dodatkowe z punktu 13 opisu (zwykle 0–1 zamiast 3). |
| `calculateScore` | `POST /calculate-score` | prawdziwe API | Bez adaptera. |
| `evaluateAssessment` | `POST /evaluations/evaluate` | prawdziwe API | `srednia_arytmetyczna` → `mean`, `werdykt` → `result`, `powody_werdyktu` → `reasons` (liczby z kropką), kryteria wysyłane po nazwie, nie po identyfikatorze. Używane tylko dla oceny okresowej. |
| `askAiAssistant` | `POST /ai-assistant` (most zgodności) | prawdziwe API | Usuwa doklejone „(Podstawa: …)” i `**`; brak przekazywania stanu formularza. |
| `getFirstAssessmentSchedule` | `POST /deadlines/calculate` | prawdziwe API | `hire_date` → `data_nawiazania_stosunku_pracy` (przy zastępstwie data porozumienia), `contract_end_date` → `data_zakonczenia_umowy`; terminy z pól `termin_*`. |
| `listDemoUsers` | `GET /auth/demo-users` | prawdziwe API | Bez adaptera. |
| `getUser` | `GET /users/{id}` | prawdziwe API | Bez adaptera. |
| `listEmployees` | `GET /employees` | prawdziwe API | Bez adaptera. |
| `getEmployee` | `GET /employees/{id}` | prawdziwe API | 404 → `null`, 403 → błąd. |
| `createEmployee` | `POST /employees` | prawdziwe API | Bez adaptera (pole `first_eval_agreement_date` po obu stronach). |
| `getCalendar` | `GET /calendar?from=&to=` | prawdziwe API | Bez adaptera; **w trybie danych przykładowych zwraca pustą listę**. |
| `extendContract` | `POST /employees/{id}/contract-extension` | tylko prawdziwe API | **Brak wersji przykładowej**: w `npm run dev` zawsze błąd. |
| `listNotes`, `addNote` | `GET`/`POST /employees/{id}/notes` | prawdziwe API | Bez adaptera. |
| `listJobDescriptions`, `attachJobDescription` | `GET`/`POST /employees/{id}/job-descriptions` | prawdziwe API | Formularz wieloczęściowy: `file` oraz `confirmed_analysis` (JSON). Backend nie przechowuje treści pliku. |
| `listAssessments` | `GET /assessments` | prawdziwe API | Bez adaptera. |
| `getAssessment` | `GET /assessments/{id}` | prawdziwe API | 404 → `null`, 403 → błąd. |
| `createAssessmentDraft` | `POST /assessments` | prawdziwe API | Bez adaptera. |
| `saveAssessmentDraft` | `PUT /assessments/{id}/draft` | prawdziwe API | 409 przy zakończonej ocenie. |
| `completeAssessment` | `POST /assessments/{id}/complete` | prawdziwe API | 422 przy brakach; wynik w polu `evaluation`. |
| `exportAssessmentPdf` | `GET /assessments/{id}/pdf` | prawdziwe API | Plik PDF; makieta buduje prosty dokument w przeglądarce. |

Funkcji `sendReminder` (wymaganej w etapie 6) **nie ma** w `api.ts` ani trasy w backendzie.

---

## 5. Asystenci

**Używana trasa**: frontend wywołuje wyłącznie `POST /api/v1/ai-assistant` z polami `question` i `mode`
(`formal` albo `interview`). Pełniejsze trasy `POST /ai/formal-chat` i `POST /ai/coaching-assistant`
istnieją, ale frontend ich nie używa.

**Asystent formalny** (`mode: formal`): most wywołuje `process_formal_chat` bez historii i bez stanu
formularza. Zwraca `status: answered` z odpowiedzią i źródłami (dokument, paragraf i strona, cytat) albo
`status: no_data`, gdy wyszukiwanie nic nie znalazło lub model odmówił. Na wdrożeniu działa model Gemini
(`/ai/status`: tryb „wyszukiwanie plus model językowy”, 543 fragmenty, bez indeksu wektorowego). Bez klucza
odpowiedzią jest fragment najlepszego źródła z doklejonym „(Podstawa: …)”, który frontend usuwa.

**Asystent rozmowy** (`mode: interview`): most wywołuje `run_coaching_assistant` z **pustym stanem
formularza**, więc odpowiedź nie zna decyzji ani przykładów z oceny; zwraca ogólne wskazówki i propozycje
pytań. Gdy model nie poda źródeł, most wstawia stałe źródło (poradnik KPRM, pierwsze pytanie z listy).

**Źródła**: wyświetlane w panelu (tytuł, miejsce, cytat). **`form_patches`**: backend je generuje
w `/ai/formal-chat` (oraz `suggested_patches` w asystencie rozmowy), ale most `/ai-assistant` je pomija,
a frontend nie ma przycisków „Zastosuj” i „Odrzuć”, więc **nie działają w aplikacji**.

**Znane ograniczenia**:
- brak kontekstu oceny w obu trybach (prośba 4.3 otwarta);
- brak historii rozmowy przekazywanej do backendu;
- czas odpowiedzi modelu zależy od dostawcy (przewidziane modele zapasowe i limit całkowity czasu);
- etykieta „dane przykładowe” w panelu znika tylko wtedy, gdy żadna funkcja nie działa na makiecie
  (flaga `USE_MOCKS`); w trybie mieszanym i produkcyjnym jej nie ma, co jest poprawne;
- odpowiedź może zawierać Markdown inny niż `**`, frontend usuwa tylko pogrubienie.

---

## 6. Baza danych

**Istniejące tabele** (opis w `docs/supabase-istniejacy-schemat.md`): `users`, `competencies`,
`behavioral_indicators`, `indicator_levels`, `employees`, `evaluations`, `evaluation_criteria`, `star_notes`.
Backend używa `users`, `employees`, `evaluations`, `evaluation_criteria`; tabele modelu kompetencji
i `star_notes` są nieużywane (model kompetencji pochodzi z pliku JSON).

**Nowe tabele** (ze skryptu `schema-additions.sql`): `evaluation_indicator_answers`, `employee_notes`,
`job_descriptions` (z włączonym zabezpieczeniem wierszy bez polityk, dostęp tylko z serwera).
**Nowe kolumny**: `employees.contract_end_date`, `employees.first_eval_agreement_date`,
`evaluations.completed_at`, `started_at`, `updated_at`, `last_step`, `evaluation_criteria.decision_note`.

**Czy skrypty zastosowano**:
- `schema-additions.sql` i `schema-additions-002.sql`: na wdrożeniu **najpewniej tak**, automatycznie.
  Wdrożony backend działa na `DATABASE_URL` (`/health`: `"backend": "postgres", "ok": true`), a
  `postgres_repo.py` przy każdym starcie uruchamia obie migracje. Trasy pracowników, ocen i kalendarza
  odpowiadają poprawnie. Nie sprawdzano tego zapytaniem do bazy.
- `seed.sql`: **nie zastosowano**. `GET /auth/demo-users` na wdrożeniu zwraca dwa konta o identyfikatorach
  „1” (przełożona Anna Kowalska) i „2” (kadry Marek Nowak), a nie konta 9001–9003 z pliku. W bazie jest
  5 pracowników i 4 oceny. Dane mają niespójności: pracownik 5 ma pierwszą ocenę przy umowie na czas
  nieokreślony, pracownik 4 ma ocenę okresową bez arkusza i bez terminu, są dwa szkice pierwszej oceny
  (które we frontendzie prowadzą do zaślepki).

**Uwierzytelnianie**: tylko demonstracyjne. Ekran logowania pobiera listę kont z `GET /auth/demo-users`,
po wyborze identyfikator trafia do pamięci sesji przeglądarki, a każde zapytanie wysyła nagłówek
`X-User-Id`. Backend sprawdza, czy taki użytkownik istnieje (401 przy braku lub nieznanym), i rolę
(`PRZELOZONY` → przełożony, `HR_ADMIN` → kadry). Przełożony widzi i zmienia tylko swoich pracowników
(403 przy cudzych), kadry widzą wszystkich i niczego nie zmieniają. Nie ma hasła ani tokenu; `JWT_SECRET`
jest zarezerwowany, ale nieużywany. Każdy, kto zna adres, może podać dowolny identyfikator.

---

## 7. Status próśb z `docs/prosby-dla-kolegi.md`

| Punkt | Status | Uzasadnienie (sprawdzone na `main`) |
|---|---|---|
| 0. Backend na `main` | **Załatwione** | `main` ma backend jako zwykły katalog (bez podmodułu). Historia nie jest jednak powiązana z `maxxw28`. |
| 1. `POST /calculate-score` | **Załatwione** | Trasa działa, frontend jej używa, testy przechodzą. |
| 2. `/osp/parse`: nazwa, kryteria dodatkowe, liczba podległych | **Otwarte** | Dla wszystkich trzech przykładowych plików `stanowisko_pracy` nadal = „NAZWA STANOWISKA PRACY”; brak `sugerowane_kryteria_dodatkowe` i `liczba_podleglych_min/max`. |
| 3. Limit kryteriów dodatkowych w szablonie | **Otwarte** | `GET /competencies?form_type=…` nie zwraca `max_additional_criteria`. |
| 4. Asystent | **Częściowo** | Odpowiedź z modelem jest pełna; bez klucza nadal fragment z doklejonym „(Podstawa: …)”. Tryb rozmowy nie przyjmuje kontekstu (pusty stan formularza), choć nie odpowiada już stałym „formularz niekompletny”. Stałe źródło w trybie rozmowy zostało. Markdown dalej możliwy. |
| 5. `evaluate`: przecinek, potwierdzenia | **Otwarte** | Powody nadal z kropką („5.00 pkt”), błędy formalne nadal z kodem 200 (bez potwierdzenia na piśmie). |
| 6. Trasy danych | **Załatwione** | Wszystkie trasy istnieją, dodatkowo kalendarz i przedłużenie umowy; działają w pamięci, przez REST Supabase i przez Postgres. |
| 7. Terminy pierwszej oceny | **Załatwione** (bez zmian) | Działa; dodane zastępstwo i przedłużenie umowy. Pytanie o okres oceny przyjęte na korzyść backendu. |
| 8. CORS | **Załatwione** | `ALLOWED_ORIGINS` ustawiane na serwerze; frontend serwowany z tego samego adresu nie potrzebuje CORS. |
| 9. Kadry bez treści ocen | **Otwarte** | `_employee_for_read` przepuszcza rolę kadr, więc `GET /assessments/{id}` i `GET /assessments/{id}/pdf` zwracają kadrom pełną treść. Frontend kadr tych tras dziś nie wywołuje, ale API je udostępnia. |

---

## 8. Etapy 5, 6 i 7 (według `prompty-etapy-5-7.md`)

### Etap 5: pierwsza ocena — **nie zrobiony**

Istnieje: kreator ze ścieżką pierwszej oceny, terminy z `getFirstAssessmentSchedule`, zastępstwo
i przedłużenie umowy, tworzenie szkicu pierwszej oceny (`POST /assessments`), w backendzie obsługa
arkusza `FIRST_EVAL_FORM` w ocenie i PDF.
Brakuje: formularza. `AssessmentPage.tsx` dla oceny innej niż okresowa pokazuje zaślepkę („Formularz
pierwszej oceny powstaje w kolejnym etapie…”). Nie ma kroku „Dane pierwszej oceny” (rozmowa wstępna,
sprawozdanie, egzamin), skali 3/5/7, podsumowania, PDF pierwszej oceny z frontendu ani przejścia pracownika
na ścieżkę okresową.

### Etap 6: panel kadr — **częściowo**

Istnieje: trasa `/kadry` tylko dla roli kadr; liczniki statusów (cztery kafelki z filtrowaniem); kalendarz
terminów z oznaczeniem „po terminie” i „wkrótce”; tabela wszystkich pracowników (pracownik, przełożony,
rodzaj oceny, status tekstem i kolorem, termin); stany ładowania i błędu z „Spróbuj ponownie”; przycisk
„Przypomnij” otwierający gotową wiadomość w programie pocztowym.
Brakuje: wyszukiwania i filtrów (komórka, przełożony, rodzaj oceny, „termin w ciągu 30 dni”), sortowania
przez użytkownika, kolumny komórki organizacyjnej i wyniku końcowego, sekcji „Wymaga uwagi”, funkcji
`sendReminder` i trasy w backendzie, zapisu daty ostatniego przypomnienia, widoczności przypomnienia
u przełożonego, wpisu w `prosby-dla-kolegi.md`. Prompt prosił o podsumowanie „bez ozdobnych kafelków”,
a są kafelki.

### Etap 7: asystenci, Supabase, wdrożenie — **częściowo**

- Asystenci: **nie zrobione** (dalej most `/ai-assistant`, bez `form_state`, bez `form_patches`,
  bez kontekstu rozmowy).
- Supabase: **zrobione inaczej niż w prompcie** — wdrożenie używa `DATABASE_URL` i migracji przy starcie
  zamiast `DATA_BACKEND=supabase`; `seed.sql` niezastosowany, dane demonstracyjne niespójne.
- Wdrożenie: **zrobione** — jeden obraz na Azure Container Apps, adres działa bez logowania do żadnego konta,
  `.env.production` z `VITE_REAL_API=*`, frontend serwowany przez backend.
- `docs/wdrozenie.md`: **brak** (instrukcja tylko w `README.md`).

---

## 9. Testy i budowanie

| Polecenie | Wynik |
|---|---|
| `npm ci` (frontend) | Zainstalowano 197 pakietów. Ostrzeżenie: `eslint@9.39.5` oznaczony jako niewspierany. |
| `npm run build` | **Sukces** (TypeScript bez błędów). Ostrzeżenie: plik `index-*.js` ma 579 kB (170 kB po kompresji), powyżej progu 500 kB; zalecany podział kodu. |
| `npm run lint` | **Bez błędów i ostrzeżeń.** |
| `python -m pytest -q` (backend, dane w pamięci, Python 3.13 w osobnym środowisku) | **63 testy zaliczone.** Jedno ostrzeżenie: przestarzałe użycie `httpx` w `starlette.testclient`. |

Dodatkowe sprawdzenia lokalne (w pamięci, bez zapisu): parser opisu stanowiska dla trzech plików, wynik
oceny z kropką w liczbach, oba tryby asystenta odpowiadają `answered`. Na wdrożeniu (tylko GET): `/health`
w stanie „ok”, baza dostępna, model Gemini skonfigurowany, kalendarz zwraca 6 terminów.

---

## 10. Znane problemy i ryzyka przed oddaniem (niedziela, 11:00)

1. **Pierwsza ocena kończy się zaślepką.** W bazie wdrożenia są dwa szkice pierwszej oceny; kliknięcie
   w nie na pokazie pokaże komunikat „powstaje w kolejnym etapie”.
2. **Niespójne dane demonstracyjne na wdrożeniu** (pracownik bez arkusza, pierwsza ocena przy umowie na czas
   nieokreślony, tylko dwa konta). Lista na pokaz może wyglądać na błędną.
3. **Historia `main` niepowiązana z `maxxw28`.** Gałęzie etapów odcięte od `maxxw28` nie zawierają zmian
   kolegów; scalanie da konflikty. Nowe prace tylko od `main`.
4. **Migracje przy każdym starcie backendu z `DATABASE_URL`** — każde lokalne uruchomienie z kluczem
   produkcyjnym zapisuje w bazie wdrożenia. Lokalnie używać `DATA_BACKEND=memory`.
5. **Kadry mają dostęp do treści ocen przez API** (prośba 9), sprzeczne z wymaganiem „bez szczegółów ocen”.
6. **Brak prawdziwego uwierzytelnienia**: dowolny `X-User-Id` daje dostęp do danych; na publicznym adresie
   każdy może zmieniać dane demonstracyjne (dodawać pracowników, notatki, kończyć oceny).
7. **Asystent rozmowy nie zna oceny**, a propozycje zmian formularza nie są pokazywane — jury może pytać
   o „autouzupełnianie”, które istnieje tylko w backendzie.
8. **Zależność od zewnętrznego modelu językowego** (limity i przeciążenia Gemini); przy błędzie odpowiedź
   spada do cytatu źródła. Warto mieć przygotowane pytania, które dobrze działają.
9. **Puste pliki dokumentacji** (`opis_projektu.md`, `opis_ai.md`, `architektura_wdrozeniowa.md`) — jeśli
   jury przegląda repozytorium, wyglądają na niedokończone.
10. **Analiza opisu stanowiska zgaduje nazwę stanowiska z nazwy pliku** i daje mniej niż trzy kryteria
    dodatkowe; dla pliku o innej nazwie nazwa stanowiska będzie dziwna.
11. Plik `.ENV` z kluczami w katalogu głównym na tym komputerze: ignorowany przez Git tylko dzięki
    nieczułości na wielkość liter w systemie Windows. Bezpieczniej przenieść go do `backend/.env`.
12. Dokumentacja `prosby-dla-kolegi.md` i `spiecie-z-backendem.md` opisuje stan gałęzi `backend-dane`
    i `feature/wspolne-klejenie` (na przykład „`main` ma pusty odnośnik do podmodułu”), więc jest częściowo
    nieaktualna.

---

## Co zostało do zrobienia

Kolejność według ważności dla pokazu:

1. **Uporządkować dane demonstracyjne na wdrożeniu**: poprawić pracowników 4 i 5, usunąć lub zakończyć
   szkice pierwszej oceny prowadzące do zaślepki, dodać drugiego przełożonego; ewentualnie zastosować
   `seed.sql` (po uzgodnieniu, bo to zapis w bazie produkcyjnej).
2. **Przygotować i przećwiczyć ścieżkę pokazu** na wdrożonym adresie: logowanie przełożonego, pracownik
   z oceną okresową, kryteria, wskazówka poziomu, decyzja, podsumowanie, zakończenie, PDF; potem logowanie
   kadr. Spisać listę pytań do asystenta, które dają dobre odpowiedzi.
3. **Zablokować kadrom treść ocen w backendzie** (403 dla `GET /assessments/{id}` i `/pdf` przy roli kadr).
4. **Etap 5 w wersji minimalnej**: formularz pierwszej oceny na istniejących komponentach (pięć kryteriów,
   skala 3/5/7, dane o egzaminie i sprawozdaniu, podsumowanie z wynikiem z backendu, PDF) albo co najmniej
   zastąpić zaślepkę czytelnym komunikatem i nie pokazywać tej ścieżki na pokazie.
5. **Asystenci**: przekazać kontekst oceny (decyzje, przykłady, arkusz) do asystenta rozmowy przez
   `/ai/coaching-assistant` i pokazać propozycje zmian formularza z przyciskami „Zastosuj” i „Odrzuć”.
6. **Panel kadr**: wyszukiwanie i filtry, kolumna wyniku i komórki, sekcja „Wymaga uwagi”; przypomnienia
   przez `sendReminder` z zapisem daty (lub zostawić `mailto:` i opisać to jako świadomą decyzję).
7. **Uzupełnić dokumentację**: `opis_projektu.md`, `opis_ai.md`, `architektura_wdrozeniowa.md`,
   `docs/wdrozenie.md`; dodać `docs/prompty-etapy-5-7.md` do repozytorium; zaktualizować tabelę stanu
   w `prosby-dla-kolegi.md`.
8. **Poprawki backendu z próśb 2, 3 i 5**: nazwa stanowiska z dokumentu, sugerowane kryteria dodatkowe,
   liczba podległych, limit kryteriów dodatkowych, przecinek w liczbach.
9. **Porządki techniczne**: przenieść `.ENV` do `backend/.env`, podzielić paczkę JavaScript (ostrzeżenie
   o 579 kB), przemyśleć wyłączenie `DB_AUTO_MIGRATE` lokalnie.
