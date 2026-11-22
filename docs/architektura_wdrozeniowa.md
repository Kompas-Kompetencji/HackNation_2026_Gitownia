# Architektura, technologie i potencjał wdrożeniowy

## Schemat

```
 Przeglądarka (komputer / tablet)
 React 19 + TypeScript + Vite + Tailwind 4
        │  HTTPS, JSON, nagłówek Authorization: Bearer <JWT>
        ▼
 ┌──────────────────────── kontener (Azure Container Apps) ────────────────────────┐
 │ FastAPI (Python 3.12, Uvicorn)                                                    │
 │  ├─ /api/v1/auth/*         logowanie (JWT HS256), role: przełożony / kadry        │
 │  ├─ /api/v1/employees, /assessments, /calendar, /reminders, /notes ...  (dane)    │
 │  ├─ /api/v1/competencies, /calculate-score, /evaluations/*  (model, silnik reguł) │
 │  ├─ /api/v1/deadlines/calculate  (terminy ustawowe, święta, art. 112/115 KC)      │
 │  ├─ /api/v1/osp/parse     (analiza opisu stanowiska .docx)                        │
 │  ├─ /api/v1/assessments/{id}/pdf  (WeasyPrint → arkusz PDF)                       │
 │  ├─ /api/v1/ai-assistant  (asystent formalny RAG + asystent rozmowy)              │
 │  └─ serwowanie zbudowanego frontendu (jeden adres, bez CORS)                      │
 └───────┬──────────────────────────────────────────────┬────────────────────────────┘
         │ psycopg 3 (pula połączeń, migracje przy starcie) │ HTTPS (klucz w sekrecie)
         ▼                                                  ▼
 PostgreSQL (Supabase, UE)                      Model językowy (Gemini; wymienny:
 użytkownicy, pracownicy, oceny,                OpenAI-compatible / model lokalny)
 kryteria, odpowiedzi, notatki,
 opisy stanowisk, przypomnienia
```

## Technologie

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, React Router | Typowany kontrakt danych (`src/types`), jedna warstwa API (`src/lib/api.ts`), ładowanie ekranów na żądanie, dostępność (ARIA, nawigacja klawiaturą). |
| Backend | FastAPI, Pydantic 2, Uvicorn | Automatyczna dokumentacja OpenAPI (`/docs`, `/redoc`), walidacja wejścia i wyjścia. |
| Reguły | Python (`scoring_engine`, `deadline_calc`, `service`) | Deterministyczne i testowalne. Przepisy są jawnie opisane w kodzie z podstawą prawną. |
| Dane | PostgreSQL (Supabase), psycopg 3 z pulą połączeń | Standardowy SQL, migracje addytywne w `backend/app/data/migrations`. Można wymienić na dowolny PostgreSQL (np. on-premise). |
| Dokumenty | WeasyPrint, szablony Jinja2 (`app/templates`) | PDF A4 na wzorze arkuszy B, C i pierwszej oceny. |
| AI | Klient LLM (Gemini lub API zgodne z OpenAI), własny RAG | Opis w `opis_ai.md`. |
| Wdrożenie | Jeden obraz Docker (multi-stage: Node 22, potem Python 3.12), Azure Container Apps, Azure Container Registry | Skalowanie 1–3 replik, sekrety kontenera, HTTPS. |
| Testy | pytest (131 testów), TypeScript `tsc`, ESLint | Reguły prawne, uprawnienia, API, RAG, klient LLM. |

## Skalowanie i rozwój

- **Brak stanu po stronie serwera:**
  - sesja to podpisany token, dane są w PostgreSQL;
  - repliki można dodawać poziomo (Container Apps: `min-replicas 1`, `max-replicas 3`).
- **Repozytorium danych za interfejsem** (`DataRepository`): implementacje pamięciowa (testy, demo),
  REST Supabase i bezpośredni PostgreSQL. Kolejna, np. MS SQL urzędu, to nowa klasa bez zmian w logice.
- **Model kompetencji z pliku Excel** (`scripts/parse_excel.py`): zmiana modelu w KPRM oznacza
  ponowne wygenerowanie JSON, bez zmian w kodzie.
- **Nowe urzędy:** konfiguracja przez zmienne środowiskowe. Docelowo kolumna `office_id` i polityki RLS
  w PostgreSQL dla wielu urzędów w jednej instancji.

## Integracje (przygotowane, niewymagane w prototypie)

Całość jest dostępna przez udokumentowane REST API (OpenAPI 3: `/openapi.json`, `/docs`).

| System | Kierunek | Jak |
|---|---|---|
| **System kadrowy (np. QNT)** | import | Synchronizacja pracowników, umów (rodzaj, daty, porozumienie przy zastępstwie) i nieobecności (przedłużenie umowy, art. 35 ust. 4) do `POST /employees` lub zadaniem wsadowym (plik CSV/XML z QNT, mapowanie w adapterze). |
| **System kadrowy** | eksport (**działa**) | `GET /api/v1/export/assessments?format=csv\|json` (tylko kadry): statusy, terminy, wyniki, stanowisko i komórka, bez treści ocen. CSV z separatorem `;` i BOM (poprawne polskie znaki w Excelu). |
| **EZD (np. EZD RP)** | eksport (**działa**) | `GET /api/v1/assessments/{id}/ezd-package` (przełożony, ocena zakończona): ZIP z arkuszem PDF i `metadane.json` (schemat `kompas-kompetencji/ezd-paczka/v1`: rodzaj dokumentu, podstawa prawna, data, wynik, pracownik, oceniający, miejsce w aktach). Klasę JRWA i znak sprawy nadaje kancelaria. Docelowo przekazanie przez API EZD i podpis kwalifikowany lub profil zaufany. |
| **SSO urzędu (Entra ID / AD FS)** | uwierzytelnianie | Zamiana `POST /auth/login` na OIDC. Reszta API działa na tym samym nagłówku `Authorization: Bearer`, a role mapowane są z grup katalogowych. |
| **Poczta / Teams** | powiadomienia | Przypomnienia (`POST /reminders`) zapisywane już w bazie, docelowo także wysyłane e-mailem lub przez Microsoft Graph. |

## Bezpieczeństwo i ochrona danych osobowych

| Obszar | Prototyp | Przed wdrożeniem produkcyjnym |
|---|---|---|
| **Uwierzytelnianie** | Wybór konta demonstracyjnego bez hasła. Każde zapytanie niesie podpisany token JWT (HS256, `JWT_SECRET`, ważność 8 h). Podrobiony lub wygasły token daje 401. | SSO urzędu (OIDC) z MFA. Klucz podpisu w Key Vault, rotacja kluczy. |
| **Autoryzacja** | Role przełożonego i kadr. Przełożony ma dostęp tylko do swoich pracowników (403 przy cudzych). Kadry widzą statusy i terminy, ale **nie treść ocen**, notatek ani opisów stanowiska (403). | Dodatkowe role (dyrektor generalny, administrator), zastępstwa przełożonych, RLS w bazie. |
| **Minimalizacja danych** | Kadry dostają okrojony widok `EmployeeMonitoring`. Do AI trafiają dane bez imienia i nazwiska, a filtr PII działa przed każdym wywołaniem modelu. Treść opisu stanowiska nie jest przechowywana, zapisywany jest tylko zatwierdzony wynik analizy. | Polityka retencji (oceny w aktach osobowych), rejestr czynności przetwarzania. |
| **Poufność w transmisji i przechowywaniu** | HTTPS (Container Apps), połączenie z bazą przez TLS. Sekrety w zmiennych kontenera (`secretref`), plik `.env` poza repozytorium (`.gitignore`, `.dockerignore`). | Prywatna sieć (VNet) dla bazy, szyfrowanie kluczem urzędu, kopie zapasowe z testem odtworzenia. |
| **Rozliczalność** | **Dziennik zdarzeń** (`audit_log`, migracja 005, widok „Dziennik zdarzeń” dla kadr): logowanie, utworzenie pracownika, przedłużenie umowy, notatki, opis stanowiska, otwarcie, zapis i zakończenie oceny, pobranie PDF i paczki EZD, eksport, przypomnienia. Bez treści ocen. Awaria dziennika nie blokuje pracy. | Retencja i niezmienność wpisów (np. WORM), alerty bezpieczeństwa, testy penetracyjne. |
| **Interfejs** | Przeglądarka na komputerze i tablecie. Smartfony są świadomie zablokowane, zgodnie z wymaganiem. | Zgodność z WCAG 2.1 AA potwierdzona audytem. |

## Uruchomienie i wdrożenie

Instrukcje uruchomienia lokalnego, w kontenerze i na Azure są w `README.md`.
Zmienne środowiskowe (tylko nazwy) są opisane w `backend/.env.example`:

- `DATABASE_URL`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `LLM_API_KEY`
- `LLM_MODEL_NAME`
- opcjonalnie `LLM_FALLBACK_MODELS`, `AUTH_TOKEN_TTL_MINUTES`, `DB_AUTO_MIGRATE`
