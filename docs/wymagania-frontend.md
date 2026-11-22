# Wymagania frontendu: Kompas Kompetencji (HackNation 2026)

Plik do umieszczenia w repozytorium jako `docs/wymagania-frontend.md`.
Claude Code czyta go na początku każdego etapu. Etapy zleca się po jednym.

## 1. Cel i użytkownicy

Aplikacja webowa tylko na komputer (bez smartfonów) wspierająca ocenę pracowników urzędu.
- **Przełożony** (główny użytkownik): ocenia swoich podwładnych (pierwsza ocena i ocena okresowa), widzi wyłącznie własnych pracowników, podejmuje ostateczną decyzję o poziomach. Aplikacja tylko sugeruje.
- **Kadry** (drugi użytkownik): widzą statusy, terminy i przypomnienia dla wszystkich ocen. Nie oceniają i nie zmieniają punktów.

Wszystkie napisy w interfejsie są po polsku, pełnymi nazwami, bez skrótów. Nazwy pól i funkcji w kodzie są po angielsku (zgodnie z backendem).

## 2. Baza techniczna

- Backend: Python (w repozytorium). Frontend: **React** (bez Next.js) + TypeScript + Tailwind CSS.
- Frontend leży w katalogu `frontend/` w repozytorium.
- Jeśli w repozytorium jest już projekt React (plik `package.json` z Reactem), użyj go i jego narzędzia budowania. Jeśli go nie ma, utwórz projekt przez Vite (szablon React + TypeScript), dodaj Tailwind CSS i React Router do nawigacji. Kod źródłowy w `src/`.
- Zmienne środowiskowe nazywaj zgodnie z narzędziem budowania (przy Vite: `VITE_API_URL` i `VITE_USE_MOCKS`, w dalszej części oznaczone jako adres backendu i przełącznik makiet).
- Przed pisaniem kodu przeczytaj backend w repozytorium (modele danych, schematy odpowiedzi, trasy, dokumentację interfejsu, jeśli jest; w Pythonie najczęściej FastAPI z modelami Pydantic) i dopasuj do niego typy po stronie frontendu.
- Przy zapytaniach do backendu uwzględnij ustawienia współdzielenia zasobów między domenami (CORS): w trybie deweloperskim użyj serwera pośredniczącego (proxy) w konfiguracji Vite albo zapytaj, jak backend je skonfigurował.

## 3. Zasady spięcia z backendem

1. **Wszystkie wywołania sieciowe są w jednym pliku `src/lib/api.ts`.** Komponenty i strony nigdy nie wywołują `fetch()` bezpośrednio i nie zawierają danych wpisanych na sztywno.
2. Na początku funkcje w `api.ts` zwracają **dane przykładowe** (makiety z `src/lib/mocks/`). Przełącznik makiet: zmienna środowiskowa (przy Vite `VITE_USE_MOCKS`, `true` = makiety). Adres backendu: zmienna środowiskowa (przy Vite `VITE_API_URL`). Spięcie z backendem ma polegać wyłącznie na podmianie wnętrza funkcji w `api.ts` na zapytania `fetch` pod ten adres.
3. **Kontrakt danych** jest w `src/types/index.ts` (interfejsy TypeScript). Nazwy pól w formacie `snake_case`, tak jak w backendzie.
4. Cała logika punktacji i zasad prawnych (średnie, zaokrąglanie do 1/3/5/7/9, wynik pozytywny lub negatywny, terminy) jest po stronie backendu. Frontend tylko wyświetla wyniki. Żadnych takich reguł w komponentach.

### Funkcje, które muszą istnieć w `api.ts` i być zgodne z backendem
(Dokładne kształty odpowiedzi sprawdź w backendzie. Poniżej to, co jest uzgodnione z zespołem.)
- `getCompetencies()`: struktura modelu kompetencji (czternaście kompetencji, wskaźniki behawioralne).
- `analyzeOsp(file)`: analiza pliku z opisem stanowiska pracy (nazwa funkcji zostaje taka sama jak w backendzie; OSP to opis stanowiska pracy). Zwraca sugerowany arkusz (B lub C) i trzy sugerowane kryteria dodatkowe.
- `calculateScore(answers)`: zwraca średnią i sugerowany poziom.
- `askAiAssistant(question, mode)`: `mode` to `"formal"` (asystent formalny) lub `"interview"` (asystent rozmowy). Zwraca odpowiedź ze źródłem albo komunikat „brak danych".

Uzgodnione nazwy pól: `competency_id`, `indicator_id`, `selected_level: 1 | 3 | 5 | 7 | 9`, `star_note` (przykład: sytuacja, działanie, rezultat), `justification_draft`.
**Do potwierdzenia z kolegą:** jak backend oznacza „brak podstaw do oceny" (propozycja: `selected_level: null`).

### Funkcje tylko frontendu (backend ich jeszcze nie ma)
W `api.ts` w osobnej sekcji z komentarzem „TYLKO FRONTEND, DO USTALENIA Z BACKENDEM":
- `listEmployees()`, `getEmployee(id)`, `createEmployee(data)`: pracownicy przypisani do zalogowanego przełożonego.
- `listNotes(employee_id)`, `addNote(employee_id, text)`: szybkie notatki o pracowniku.
- `listJobDescriptions(employee_id)`, `attachJobDescription(employee_id, file)`: historia wgranych opisów stanowiska.
- `listAssessments(...)`: lista ocen ze statusami i terminami (potrzebna też kadrom).

Typy pomocnicze (zaproponuj dokładne pola i wypisz założenia): `Employee` (id, supervisor_id, first_name, last_name, position_title, hire_date, contract_type, last_assessment_date, last_assessment_result, next_assessment_due, status), `JobDescriptionDocument` (id, employee_id, filename, uploaded_at, version, analysis), `Note` (id, employee_id, created_at, text), `AssessmentSummary` (id, employee_id, kind: `"first" | "periodic"`, form: `"B" | "C" | "first"`, status, started_at, due_date, result).

## 4. Układ (tylko komputer)

- Układ dwukolumnowy tam, gdzie potrzebny asystent: kolumna główna około 70% szerokości (kroki procesu, formularz, podgląd), prawa kolumna około 30% (stały panel asystenta).
- Panel asystenta ma przełącznik trybu: **Asystent formalny** (przepisy, odpowiedzi ze źródłem i komunikatem „brak danych w dokumentach") oraz **Asystent rozmowy** (przygotowanie rozmowy oceniającej i uzasadnienie).
- Dashboard i lista pracowników mogą być na pełną szerokość. Panel pracownika i formularz oceny używają układu z panelem asystenta.
- Nie traćcie czasu na widok mobilny. Minimalna szerokość 1280 pikseli.

## 5. Wygląd i jakość (użyj skilli)

Użyj skilli: `frontend-design`, `ui-bez-szablonowego-wygladu`, a jeśli zainstalowany także `emil-design-eng` (szczegóły interakcji). Skill `design-taste-frontend` jest przeznaczony do stron wizytówkowych, więc nie stosuj go do ekranów roboczych (co najwyżej do ekranu logowania). Na końcu każdego etapu użyj skilla `impeccable` do krytyki i audytu wyniku.

Zasady wyglądu:
- Spokojny, urzędowy styl: jeden kolor akcentu, wysoki kontrast, jedna hierarchia typografii. Zmienne projektowe (kolory, odstępy, promienie) w konfiguracji Tailwind.
- Bez fioletowych gradientów, emoji w roli ikon, siatek identycznych kart i pustych tekstów marketingowych. Jeden zestaw ikon.
- Formularze w jednej kolumnie, etykiety nad polami, widoczny postęp („Krok 2 z 3"), czytelne błędy przy polu, jeden wyraźny przycisk główny.
- Stany: pusty, ładowania, błędu, sukcesu. Status zawsze tekstem plus kolor.
- Dostępność: kontrast co najmniej WCAG AA, obsługa klawiaturą, widoczny fokus, etykiety powiązane z polami.
- Polski: `lang="pl"`, czcionka z pełnym zestawem polskich znaków (ą, ę, ł, ś, ż, ź, ć, ń, ó), zapas miejsca na dłuższe słowa.
- Teksty interfejsu w jednym pliku (`src/lib/texts.ts`).
- Animacje funkcjonalne, do 200 ms, z obsługą `prefers-reduced-motion`.

## 6. Dane przykładowe

- Dwóch fikcyjnych przełożonych (żeby było widać, że każdy widzi tylko swoich pracowników) i jeden użytkownik kadr.
- Przełożony 1 ma trzech pracowników odpowiadających stanowiskom z przykładowych opisów: starszy specjalista (formularz C), radca (formularz C), naczelnik wydziału (formularz B). Przełożony 2 ma jednego pracownika.
- Mock `analyzeOsp` zwraca wynik zależny od nazwy pliku (np. zawiera „naczelnik" → formularz B, w pozostałych przypadkach formularz C) i trzy kryteria dodatkowe.
- Wszystkie dane fikcyjne.

## 7. Struktura aplikacji i etapy

Ekrany przełożonego:
- Dashboard: lista własnych pracowników (status, termin następnej oceny), wyszukiwanie, przycisk „Dodaj pracownika i rozpocznij pierwszą ocenę".
- Dodanie pracownika (kreator): dane (imię, nazwisko, data zatrudnienia, rodzaj umowy), opis stanowiska (wgranie pliku Word, pokazanie wykrytych danych i formularza, potwierdzenie), wybór ścieżki. Opis stanowiska należy do pracownika. W dashboardzie nie ma osobnego wgrywania opisów.
- Panel pracownika: szczegóły, termin następnej oceny, historia ocen i wgranych plików, szybkie notatki, opis stanowiska z historią wersji, przycisk „Utwórz ocenę okresową", panel asystenta formalnego.
- Formularz oceny: kroki, wskaźniki behawioralne (pięć poziomów plus „brak podstaw do oceny"), notatki do wskaźnika jako przykłady, sugerowany poziom z backendu i decyzja przełożonego (1/3/5/7/9), podsumowanie, uzasadnienie (obowiązkowe przy ocenie negatywnej), pobranie arkusza w formacie PDF. Asystent formalny i asystent rozmowy w panelu bocznym.

Ekrany kadr: tabela wszystkich ocen ze statusami, terminami, filtrami, sortowaniem i przypomnieniami (bez szczegółów ocen).

Etapy (zlecane po jednym, po każdym małe commity i uruchomienie aplikacji):
1. Szkielet, logowanie z wyborem roli, układ, kontrakt danych, `api.ts` z makietami, puste panele.
2. Dashboard przełożonego i kreator dodania pracownika z wgraniem opisu stanowiska.
3. Panel pracownika.
4. Formularz oceny okresowej (formularz C, potem B).
5. Pierwsza ocena.
6. Panel kadr.
7. Podłączenie asystentów i backendu.
