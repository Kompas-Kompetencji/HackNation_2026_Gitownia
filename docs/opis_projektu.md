# Kompas Kompetencji – opis projektu

Wyzwanie: Ministerstwo Cyfryzacji, Biuro Dyrektora Generalnego (HackNation 2026).
Prototyp: https://kompas-api.calmwater-95f16d05.swedencentral.azurecontainerapps.io
(konta demonstracyjne do wyboru na ekranie logowania, dane osób są fikcyjne).

## Koncepcja

Kompas Kompetencji prowadzi przełożonego krok po kroku przez **pierwszą ocenę** i **ocenę okresową**
członka korpusu służby cywilnej. Łączy w jednym miejscu model kompetencyjny, przepisy, arkusze ocen,
terminy i asystenta AI.

U podstaw są trzy zasady:

1. **Ocena oparta na zachowaniach, nie na wrażeniach.** Przełożony nie wpisuje od razu liczby przy
   kompetencji. Przy każdym wskaźniku behawioralnym wybiera zachowanie, które najlepiej opisuje to, co
   obserwował u pracownika. System liczy z tego **sugerowany poziom** kryterium.
2. **Decyzja zawsze należy do przełożonego.** Sugerowany poziom i wszystkie propozycje AI są tylko
   podpowiedzią. Poziom kryterium, wynik i uzasadnienie zatwierdza przełożony. Jeśli wybierze inny
   poziom niż sugerowany, może zapisać powód.
3. **Zgodność z przepisami jest wbudowana w proces.** Terminy, skale, kryteria obowiązkowe, warunki
   oceny pozytywnej i negatywnej oraz wymóg uzasadnienia wynikają z ustawy o służbie cywilnej oraz
   rozporządzeń z 2015 r. (pierwsza ocena) i 2016 r. (oceny okresowe). Pilnuje ich deterministyczny
   silnik reguł, a nie model językowy.

## Użytkownicy i role

| Rola | Co robi w systemie |
|---|---|
| **Przełożony** (główny użytkownik) | Widzi wyłącznie swoich pracowników. Dodaje pracownika (kreator), analizuje opis stanowiska, prowadzi ocenę, korzysta z asystentów, generuje PDF arkusza, prowadzi notatki z obserwacji. |
| **Kadry / administrator** | Monitoruje statusy i terminy wszystkich ocen w urzędzie oraz wysyła przypomnienia do przełożonych. **Nie widzi treści ocen** (minimalizacja danych): API zwraca kadrom 403 dla arkusza, PDF, notatek i opisów stanowiska. |

## Najważniejsze funkcjonalności

**Ścieżka przełożonego (od rozpoczęcia do zakończenia oceny)**

- **Kreator nowego pracownika:**
  - rodzaj umowy (czas nieokreślony, czas określony z pierwszą oceną, mianowanie, **zastępstwo**);
  - ścieżka oceny dobierana automatycznie;
  - przy zastępstwie data porozumienia i walidacja długości umowy (art. 37 ust. 2).
- **Analiza opisu stanowiska pracy (.docx):**
  - nazwa stanowiska z pkt 1.3;
  - kierowanie zespołem, rekomendacja **arkusza B lub C**;
  - propozycja 0–3 kryteriów dodatkowych z uzasadnieniem, do zatwierdzenia przez przełożonego.
- **Terminy liczone według przepisów:**
  - rozmowa wstępna (21 dni);
  - okno pierwszej oceny;
  - termin oceny okresowej (24 miesiące, 6 po ocenie negatywnej), rozmowa o kryteriach;
  - sprzeciw (7 dni);
  - przedłużenie umowy o nieobecność ponad 3 miesiące (art. 35 ust. 4).
- **Formularz oceny okresowej (arkusz B/C):**
  - kryteria obowiązkowe i dodatkowe;
  - przy każdym wskaźniku wybór zachowania z modelu kompetencji (opisy poziomów 1–9) oraz przykład STAR (sytuacja, działanie, rezultat);
  - na żywo **sugerowany poziom** kryterium, a decyzję wybiera przełożony;
  - walidacja: co najmniej jeden oceniony wskaźnik w każdym kryterium.
- **Formularz pierwszej oceny:**
  - dane o rozmowach, sprawozdaniu i egzaminie ze służby przygotowawczej;
  - pięć elementów w skali 3/5/7;
  - warunki oceny pozytywnej z § 10 rozporządzenia z 2015 r.
- **Podsumowanie:**
  - wynik liczony przez backend (średnia, poziom, ocena pozytywna albo negatywna z powodami);
  - uzasadnienie, obowiązkowe przy ocenie negatywnej;
  - wnioski rozwojowe (IPRZ).
- **Dokument PDF** gotowy do podpisu, na wzorze właściwego arkusza (B, C, pierwsza ocena).
- **Tryb rozmowy oceniającej** (ekran na czas spotkania, przycisk w nagłówku arkusza):
  - agenda zbudowana z arkusza: otwarcie, mocne strony (kryteria od 7 pkt z wybranymi zachowaniami i przykładami STAR), obszary do rozwoju (kryteria do 3 pkt, braki przykładów), zdanie pracownika, ustalenia;
  - znaczniki „omówione” przy punktach i postęp rozmowy;
  - pytania od asystenta jednym przyciskiem;
  - po rozmowie jednym kliknięciem: ustalenia trafiają do wniosków rozwojowych w arkuszu, stanowisko pracownika do notatek z datą rozmowy, a w pierwszej ocenie data rozmowy oceniającej do arkusza.
- **Paczka do EZD** przy zakończonej ocenie: ZIP z arkuszem PDF i plikiem `metadane.json` (rodzaj dokumentu, podstawa prawna, data, wynik, pracownik, oceniający, miejsce w aktach osobowych).

**Asystent AI w panelu bocznym, z dwoma trybami**

- **Asystent formalny:**
  - odpowiada na pytania o procedurę, terminy i formularze wyłącznie na podstawie bazy wiedzy, ze **wskazaniem źródła** (dokument, paragraf lub artykuł, strona, cytat);
  - gdy w bazie brakuje informacji, mówi to wprost.
- **Asystent rozmowy:**
  - zna zanonimizowany stan arkusza (poziomy, wybrane zachowania, przykłady STAR);
  - przygotowuje do rozmowy oceniającej: pytania do pracownika, kwestie do omówienia, uporządkowane argumenty, propozycje rozwojowe;
  - przygotowuje **szkic uzasadnienia**, który przełożony może wstawić jednym kliknięciem i dowolnie poprawić.
- **Bezpieczne granice AI:**
  - na pytania o ocenę konkretnej osoby (np. „jaką ocenę dać Kowalskiej?”) asystent odpowiada, że decyzja należy do przełożonego, i proponuje pomoc w jej przygotowaniu.

**Perspektywa kadr**

- **Liczniki statusów i sekcja „Wymaga uwagi”:** oceny po terminie oraz z terminem w ciągu 30 dni.
- **Tabela wszystkich ocen** z filtrami i sortowaniem.
- **Kalendarz terminów:**
  - kafelkowy widok miesiąca z aktualnościami (zaległe, najbliższe, kolejne);
  - przełożony widzi w nim tylko swoich podwładnych.
- **Przypomnienia dla przełożonych:** zapisywane w systemie i widoczne u przełożonego jako pasek
  „Przypomnienie od kadr”.
- **Eksport dla systemu kadrowego** (CSV lub JSON): statusy, terminy i wyniki ocen bez ich treści, np. do importu w QNT.
- **Dziennik zdarzeń:** kto, kiedy i jaką czynność wykonał (logowanie, otwarcie i zapis oceny, pobranie PDF, eksport, przypomnienia). Bez treści ocen.
- **Jakość asystenta AI:**
  - wynik testu kontrolnego na banku pytań (zgodność, pokrycie źródłami, odmowy pytań spoza tematu);
  - lista pytań, na które baza wiedzy nie miała odpowiedzi, czyli luki do uzupełnienia.

## Zgodność z wymaganiami zadania

| Wymaganie | Realizacja |
|---|---|
| Dwie odrębne ścieżki: pierwsza ocena i okresowa | Osobne formularze, skale (3/5/7 albo 1–9), warunki wyniku, terminy i arkusze PDF. |
| Model kompetencyjny ze wskaźnikami i opisami poziomów | 14 kompetencji i 49 wskaźników z oficjalnego `Model_kompetencji.xlsx`. Przy wskaźniku wybór zachowania. |
| Sugerowany poziom, decyzja przełożonego | Sugerowany poziom liczony ze wskaźników. Przełożony wybiera poziom i może zapisać powód odstępstwa. |
| Wybór kryteriów | Kryteria obowiązkowe dla arkusza B lub C oraz 0–3 dodatkowych, z podpowiedzią z opisu stanowiska. |
| Dokumentacja (PDF) | Arkusze B, C i pierwszej oceny w PDF, generowane po stronie serwera. |
| Terminy i komunikacja z przełożonymi | Kalendarz, statusy, przypomnienia od kadr. |
| Asystent AI w dwóch obszarach | Asystent formalny (RAG ze źródłami) oraz asystent rozmowy (pytania, argumenty, szkic uzasadnienia). |
| Odpowiedzi na podstawie źródeł, komunikat o braku danych | Odpowiedź wyłącznie z wyszukanych fragmentów, wskazane źródło. Przy braku pokrycia: „brak informacji w bazie wiedzy”. |
| AI nie decyduje o ocenie | Wynik liczy deterministyczny silnik reguł. AI nie zmienia poziomów, odmawia wskazania oceny konkretnej osoby, a każdą propozycję zatwierdza człowiek. |
| Pomoc w przygotowaniu rozmowy | Tryb rozmowy oceniającej: agenda z arkusza, pytania AI, notatki zapisywane do arkusza. |
| Monitorowanie i rozliczalność | Dziennik zdarzeń, eksport dla systemu kadrowego, raport jakości asystenta. |
| Uwierzytelnianie, role, uprawnienia | Token JWT (HS256, 8 h) przy każdym zapytaniu. Role przełożonego i kadr. Przełożony ma dostęp tylko do swoich pracowników, kadry nie widzą treści ocen. |
| Ochrona danych, minimalizacja | Do modelu AI nie trafiają imię ani nazwisko. Filtr PII usuwa PESEL, e-mail, telefon i zwroty „Pan/Pani Imię Nazwisko”. Kadry widzą tylko dane monitoringowe. |
| API do integracji | Udokumentowane REST API (OpenAPI pod `/docs`). Działające punkty integracji: eksport dla QNT (CSV/JSON) i paczka EZD (PDF + metadane). Opis w `architektura_wdrozeniowa.md`. |
| Interfejs w przeglądarce, nie na smartfonach | Aplikacja webowa na komputer i tablet. Na smartfonie pokazuje się komunikat „Otwórz Kompas na komputerze”. |

## Scenariusz demonstracji (ok. 7 minut)

1. Logowanie jako **Halina Zawadzka-Nowicka** (przełożona). Lista pracowników ze statusami, kalendarz
   terminów; Małgorzata Wróbel-Sośnicka jest po terminie.
2. **Joanna Pietrzyk**, ocena okresowa (arkusz C):
   - konfiguracja: kryteria obowiązkowe i dodatkowe z opisu stanowiska;
   - przy kryterium wybór zachowań przy wskaźnikach i przykład STAR, potem sugerowany poziom i własna decyzja;
   - podsumowanie z wynikiem;
   - asystent rozmowy: „Przygotuj szkic uzasadnienia na podstawie arkusza”, potem „Wstaw”;
   - **tryb rozmowy oceniającej:** agenda, „Zaproponuj pytania do rozmowy (AI)”, notatki, „Zapisz notatki do arkusza”;
   - zakończenie, PDF i paczka do EZD.
3. Asystent formalny, przykładowe pytania jury: „czym różni się formularz B od C?”, „kiedy można
   złożyć sprzeciw od oceny okresowej?”, „kiedy przeprowadza się rozmowę wstępną?”. Przy każdej odpowiedzi
   widać źródło i cytat. Pytanie spoza tematu dostaje odpowiedź o braku informacji
   w bazie wiedzy, a „jaką ocenę dać Pietrzyk?” – odpowiedź, że decyzja należy do przełożonego.
4. Logowanie jako **Tomasz Kędzierski**:
   - **Karolina Mazur**, pierwsza ocena w toku;
   - **Adam Wilk**, umowa na zastępstwo z terminami liczonymi od porozumienia.
5. Logowanie jako **Bożena Ślęzak** (kadry): przegląd, „Wymaga uwagi”, kalendarz, przypomnienie do
   przełożonej, eksport CSV, **Jakość asystenta AI** (48/48 pytań zgodnie z oczekiwaniem), **Dziennik zdarzeń**.
   Otwarcie treści oceny jest zablokowane (403).

## Kierunki rozwoju

- Logowanie przez SSO urzędu (Entra ID / Active Directory). API już działa na tokenach.
- Integracja z systemem kadrowym (np. QNT): import pracowników, umów i nieobecności, eksport wyników.
- Integracja z EZD: przekazanie podpisanego arkusza PDF do akt osobowych (metadane JRWA).
- Podpis kwalifikowany lub profil zaufany na arkuszu, z potwierdzeniem zapoznania się pracownika z oceną.
- Wektorowe wyszukiwanie (embeddingi PL) obok obecnego dopasowania leksykalnego i model językowy
  uruchamiany w infrastrukturze rządowej.
- Panel analityczny dla dyrektora generalnego: rozkład ocen, kalibracja między departamentami.
