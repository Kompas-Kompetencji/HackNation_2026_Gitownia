# Etap 6: panel kadr

Kadry to drugi użytkownik systemu. Monitorują statusy procesów i terminy oraz wysyłają przełożonym
przypomnienia. **Nie oceniają i nie widzą treści ocen.** Wolno im zobaczyć tylko: pracownika, komórkę,
przełożonego, rodzaj oceny, status, terminy i wynik końcowy (pozytywna albo negatywna).

## Układ strony `/kadry` (`frontend/src/pages/HrHomePage.tsx`)

1. **Przegląd** – pasek pięciu liczb (pracownicy): nierozpoczęte, w toku, zakończone, po terminie,
   termin w ciągu 30 dni. Kliknięcie liczby ustawia filtr tabeli „Wszystkie oceny” (stan widoczny
   jako zaznaczenie i w polach filtrów; drugie kliknięcie albo „Wyczyść filtry” go zdejmuje).
2. **Wymaga uwagi** (`pages/hr/AttentionSection.tsx`) – wiersz na przełożonego: komórka, liczba
   pracowników po terminie, liczba z terminem w ciągu 30 dni, najbliższy termin, ostatnie przypomnienie
   (albo „brak”), „Wyślij przypomnienie” i zapasowo „Otwórz w programie pocztowym” (`mailto:`).
   Rozwinięcie pokazuje pracowników z terminami i powodami.
3. **Kalendarz terminów** – istniejący komponent; „Przypomnij” przy terminie otwiera to samo okno
   przypomnienia z zaznaczonym pracownikiem.
4. **Wszystkie oceny** (`pages/hr/AssessmentsTable.tsx`) – jeden wiersz na pracownika (bieżąca ocena):
   wyszukiwanie, filtry, sortowanie nagłówkami (`aria-sort`), licznik „Pokazano X z Y”, rozwinięcie
   z terminami, listą ocen (rodzaj, status, termin, data zakończenia, wynik) i historią przypomnień.

Okno przypomnienia (`pages/hr/ReminderDialog.tsx`): natywny `<dialog>` (pułapka fokusu, Escape),
wybór pracowników, edytowalna treść wypełniona uprzejmym tekstem z nazwiskami i terminami (bez treści
ocen), licznik znaków (limit 1000). Jeśli w ciągu ostatnich 24 godzin wysłano już przypomnienie temu
przełożonemu, okno pokazuje ostrzeżenie z datą, a „Wyślij” jest nieaktywne do zaznaczenia potwierdzenia.
Po wysłaniu: komunikat sukcesu (także dla czytników ekranu), data ostatniego przypomnienia aktualizuje
się bez przeładowania, fokus wraca do przycisku. Błąd backendu: komunikat z treścią błędu
i „Spróbuj ponownie” – okno nie udaje sukcesu.

## Zasady „Wymaga uwagi” (`frontend/src/lib/hrMonitoring.ts`)

Jedno miejsce w kodzie: funkcja `attentionReasons`. Pracownik wymaga uwagi, gdy:

1. **po terminie** – backend zwraca status pracownika `assessment_overdue`;
2. **termin w ciągu 30 dni** – backend zwraca status `assessment_due_soon` (próg 30 dni liczy backend,
   `DUE_SOON_DAYS` w `backend/app/data/service.py`);
3. **ocena nierozpoczęta mimo bliskiego terminu** – warunek 1 albo 2 i brak rozpoczętej oceny
   (żadna otwarta ocena pracownika nie ma statusu „wersja robocza” ani „czeka na rozmowę”).

Frontend nie liczy terminów i nie dodaje reguł prawnych: korzysta z `status` i `next_assessment_due`
z `GET /employees`, statusów z `GET /assessments` i dat z `GET /reminders`. Po zakończonej pierwszej
ocenie pracownik nie trafia do „Wymaga uwagi” (backend podaje wtedy termin oceny okresowej, który
do niego nie pasuje – tak samo jak u przełożonego).

Stan procesu w tabeli: „w toku”, gdy istnieje szkic; „zakończona”, gdy nie ma otwartej oceny, a jest
wynik ostatniej oceny; w pozostałych przypadkach „nierozpoczęta”.

## Ochrona danych

- Backend: `GET /assessments/{id}`, `GET /assessments/{id}/pdf`, notatki i opisy stanowiska → 403 dla kadr;
  `GET /employees` dla kadr zwraca okrojony `EmployeeMonitoring` (szczegóły: `zmiany-backendu-dev_maks.md`).
- Frontend: panel kadr nie ma żadnego odnośnika do oceny ani do panelu pracownika; trasy `/przelozony/*`
  są dla kadr zablokowane (strona „Brak dostępu do tego widoku”).

## Przełożony: przypomnienia od kadr

Na liście pracowników przełożonego (`SupervisorHomePage`) nad tabelą pojawia się pasek „Przypomnienie
od kadr” z przypomnieniami z ostatnich 14 dni (najnowsze pierwsze, trzy widoczne, reszta po rozwinięciu).
„Zamknij” ukrywa przypomnienie tylko w tej przeglądarce (`localStorage`), nie w bazie.
