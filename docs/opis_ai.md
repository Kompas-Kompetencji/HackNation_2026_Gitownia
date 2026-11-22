# Wykorzystanie sztucznej inteligencji w Kompasie Kompetencji

## Zasada nadrzędna: AI doradza, przełożony decyduje

Model językowy **nie wylicza i nie zmienia** poziomu kryterium ani wyniku oceny. Robi to
deterministyczny silnik reguł w Pythonie (`app/core/scoring_engine.py`, `compute_deterministic_summary`):

- średnia;
- poziom ogólny;
- warunki oceny pozytywnej i negatywnej (§ 10 rozporządzenia z 2015 r., § 11 rozporządzenia z 2016 r.);
- obowiązek uzasadnienia.

AI dostaje gotowy wynik jako dane wejściowe, a w instrukcji ma zakaz jego podważania. Każda propozycja AI
(np. szkic uzasadnienia) jest wstawiana do formularza tylko przyciskiem i wyłącznie decyzją przełożonego.

## Gdzie użyto AI

| Element | Rola AI | Co jest deterministyczne |
|---|---|---|
| **Asystent formalny** (panel boczny) | Odpowiada na pytania o procedurę, terminy, formularze i prawa pracownika. Pisze odpowiedź z wyszukanych fragmentów i wskazuje, które fragmenty wykorzystał. | Wyszukiwanie fragmentów (RAG), progi trafności, odmowa przy braku pokrycia, lista źródeł. |
| **Asystent rozmowy** (panel boczny, tryb 2) | Na podstawie stanu arkusza przygotowuje rozmowę oceniającą: pytania otwarte, kwestie do omówienia, argumenty oparte na zachowaniach (STAR), propozycje rozwojowe i szkic uzasadnienia. | Wynik i powody (silnik reguł), wybór źródeł metodycznych z poradników KPRM, odpowiedź bazowa przy niedostępności modelu. |
| **Tryb rozmowy oceniającej** | Na przycisk proponuje pytania według agendy rozmowy i wskazuje kwestie do omówienia na podstawie arkusza. | Agenda (mocne strony, obszary rozwoju) układana regułowo z poziomów i wybranych zachowań. |
| **Sugerowany poziom kryterium** | Nie korzysta z AI (celowo). | Średnia z poziomów wybranych przy wskaźnikach, zaokrąglona do skali. |
| **Analiza opisu stanowiska** | Nie korzysta z AI. Parser .docx działa regułowo, a jego wynik zatwierdza przełożony. | Nazwa stanowiska, kierowanie zespołem, arkusz B lub C, kryteria dodatkowe z pkt 13. |

## Baza wiedzy (RAG)

**Źródła** (`backend/data/raw`, indeks `backend/data/processed/rag_chunks.json`, 543 fragmenty):

| Źródło | Fragmenty |
|---|---|
| Rozporządzenie PRM z 23 lipca 2015 r. w sprawie pierwszej oceny | 28 |
| Rozporządzenie PRM z 4 kwietnia 2016 r. w sprawie ocen okresowych | 81 |
| Poradnik KPRM „Pierwsza ocena w służbie cywilnej” | 163 |
| Poradnik KPRM „Oceny okresowe w służbie cywilnej” | 175 |
| Departament Służby Cywilnej KPRM: odpowiedzi na najczęstsze pytania o oceny (FAQ) | 31 |
| Model kompetencji w służbie cywilnej, wygenerowany z `Model_kompetencji.xlsx` | 64 |
| Opracowanie przepisów ustawy o służbie cywilnej, m.in. art. 83 (sprzeciw) | brak liczby |

Każdy PDF dodany do `data/raw` trafia do indeksu automatycznie. Backend przebudowuje indeks przy
starcie, gdy wykryje nowy plik. Pełny tekst ustawy o służbie cywilnej (PDF z ISAP) można dołączyć tak
samo, bez zmian w kodzie.

**Wyszukiwanie:**

- **Normalizacja zapytania** (odporność na sposób zadania pytania):
  - wielkość liter i brak polskich znaków;
  - synonimy (formularz, druk, karta → arkusz; odwołanie → sprzeciw; okres próbny → służba przygotowawcza);
  - korekta literówek (difflib, tylko w zapytaniach z dziedziny).
- **Ocena trafności:** dopasowanie n-gramowe i pokrycie rdzeni słów ważone IDF.
- **Progi:** bez słów z dziedziny ocen zapytanie musi pokryć 65% treści, z takimi słowami 30%.
  Pytania spoza tematu (np. przepis na sernik) nie dostają odpowiedzi.
- **Kontekst dla modelu:** 8 najlepszych fragmentów z pełnym tekstem (do 1400 znaków).

**Generowanie odpowiedzi:**

- Instrukcja systemowa: odpowiadać **wyłącznie** na podstawie podanych fragmentów, wskazać wykorzystane
  źródła (`used_sources`), a przy braku informacji powiedzieć to wprost.
- Panel pokazuje pod odpowiedzią źródło: tytuł dokumentu, paragraf lub artykuł, stronę i cytat.
- Gdy wyszukiwanie nic nie znajdzie albo model odmówi, panel pokazuje komunikat „Brak informacji w bazie
  wiedzy” zamiast zgadywać.
- Asystent dostaje ostatnie wymiany z rozmowy, więc rozumie pytania doprecyzowujące, np. „a jak to
  wygląda w pierwszej ocenie?”.

## Wiarygodność i granice AI

- **Blokada decyzji o konkretnej osobie:** pytania typu „jaką ocenę dać Kowalskiej?”, „ile punktów
  wystawić mu za komunikację?” albo „czy Joanna zasługuje na ocenę pozytywną?” dostają stałą odpowiedź:
  decyzja należy do przełożonego, z propozycją pomocy w jej przygotowaniu. Ogólne pytania (np. „jaki
  poziom wybrać, gdy nie obserwowałem zachowania?”) przechodzą normalnie (`app/services/ai_quality.py`).
- **Raport „Jakość asystenta AI” dla kadr i administratora** (`GET /api/v1/ai/quality`):
  - test kontrolny na banku pytań `data/eval/pytania_kontrolne.txt` (48 pytań, w tym 3 spoza tematu, które
    mają zostać odrzucone);
  - liczba odpowiedzi z mocnym i częściowym pokryciem;
  - lista pytań użytkowników, na które baza nie miała odpowiedzi (z usuniętymi danymi osobowymi), czyli
    luki do uzupełnienia.

## Bezpieczeństwo i ochrona danych

- **Minimalizacja danych:**
  - do modelu trafia stanowisko, kryteria, poziomy, opisy wybranych zachowań i przykłady STAR;
  - **nie trafiają** imię, nazwisko ani identyfikatory pracownika.
- **Filtr danych osobowych** (`app/services/pii_guard.py`): przed każdym wywołaniem modelu usuwa z pytań,
  notatek i historii PESEL, adresy e-mail, numery telefonów i zwroty „Pan/Pani Imię Nazwisko”.
- **Dostęp do AI:** trasy AI wymagają zalogowania (token JWT), co chroni przed nadużyciem limitów.
- **Klucz API:** tylko w zmiennej środowiskowej `LLM_API_KEY` (sekret kontenera), nigdy w kodzie ani
  w repozytorium.
- **Odporność na awarie:**
  - łańcuch modeli zapasowych;
  - limity czasu (25 s na wywołanie, 55 s łącznie) i 180 s przerwy dla modelu, który zawiódł;
  - przy niedostępności modelu asystent formalny pokazuje najlepszy fragment źródła, a asystent rozmowy
    wskazówki z poradników.

## Modele i dostawcy

Prototyp używa darmowego API **Google Gemini** (`gemini-3.5-flash`) z modelami zapasowymi
`gemini-3.1-flash-lite` i `gemini-flash-lite-latest`. Klient (`app/services/llm_client.py`) obsługuje
też API zgodne z OpenAI: OpenAI, Groq, OpenRouter oraz **własny serwer** (`LLM_BASE_URL`, np. vLLM lub
Ollama w infrastrukturze rządowej). Zmiana dostawcy to zmiana zmiennych środowiskowych, bez zmian
w kodzie.

## Jakość i testy

- Testy automatyczne (`backend/tests`):
  - pytania z banku pytań jury (`data/eval/pytania_kontrolne.txt`, 48 pytań) mają źródła w bazie wiedzy;
  - blokada pytań o ocenę konkretnej osoby działa w obu trybach i nie blokuje pytań ogólnych;
  - pytania spoza tematu nie mają źródeł;
  - te same źródła niezależnie od wielkości liter, polskich znaków i literówek;
  - wybór modelu i łańcuch modeli zapasowych;
  - reguły ocen.
- Wszystkie 131 testów przechodzą (`python -m pytest -q`).

## Co wymaga dostosowania przed wdrożeniem produkcyjnym

- **Model językowy w infrastrukturze zaufanej:** wdrożenie lokalne albo usługa z umową powierzenia
  przetwarzania i lokalizacją danych w UE. Darmowe API wolno wykorzystać tylko w prototypie.
- **Wyszukiwanie semantyczne** (embeddingi PL, np. `sdadas/mmlw-retrieval-roberta-base`, skrypt
  przewidziany w `build_rag_index.py`) oraz pełne teksty aktów prawnych z ISAP z wersjonowaniem
  zmian przepisów.
- **Rejestr zapytań i odpowiedzi** (bez danych osobowych) do kontroli jakości oraz okresowa ocena
  poprawności odpowiedzi na zestawie pytań kontrolnych.
- **Ocena skutków dla ochrony danych (DPIA)** oraz zgodność z AI Act. System jest narzędziem wsparcia
  decyzji kadrowych, więc decyzja człowieka zostaje udokumentowana w arkuszu.
