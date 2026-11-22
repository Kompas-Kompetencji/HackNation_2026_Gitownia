# Raport: wnioski rozwojowe, kryteria dodatkowe, terminy (gałąź `dev_maks`, 22.11.2026)

Szczegóły zmian: [zmiany-backendu-dev_maks.md](zmiany-backendu-dev_maks.md), sekcje 7–10.
Commity: `e5f8bc5` (krok 1), `3845109` (krok 2), `010c086` (krok 3).

## Co działa (sprawdzone)

- `npm run build`, `npm run lint` bez błędów (stare ostrzeżenie o rozmiarze paczki JS), `python -m pytest -q`: 120 testów.
- Przeglądarka (backend w pamięci, frontend `dev:mixed`): nowy pracownik na czas nieokreślony,
  wgranie opisu stanowiska radcy pod zmienioną nazwą `opis-stanowiska.docx` → nazwa „Radca” z treści,
  wybór 3 kryteriów z 9 dostępnych (14 bez obowiązkowych arkusza C), podsumowanie z terminem rozmowy
  rozpoczynającej (2.12.2026) i oceny (2.11.2028), nagłówek pracownika z terminem, ocena okresowa
  zakończona, PDF z wypełnioną sekcją „Wnioski dotyczące indywidualnego programu rozwoju zawodowego”.
- Krok 1 sprawdzony też na szkicu `as-001` (zapis szkicu i PDF).

## Czego nie zrobiłem

- Ścieżka pierwszej oceny z wnioskami sprawdzona tylko testami (PDF sekcji VI), nie w przeglądarce.
- Wskaźniki i decyzje oceny w przejściu przeglądarkowym wypełniłem przez funkcje `api.ts` (te same
  wywołania co formularz), nie klikając 28 wskaźników.
- Backend dalej nie zwraca sugerowanych kryteriów dodatkowych ani limitu (prośby 2.2 i 3); podpowiedź
  pochodzi z pkt 13 opisu (dla radcy: brak podpowiedzi).
- Nie zapisano na prawdziwej bazie niczego; Postgres/Supabase sprawdzone tylko na atrapach.

## Zmiany w backendzie i bazie

- Pole `development_conclusions` (szkic, zakończenie, odczyt, PDF), limit 2000 znaków.
- Kolumna `evaluations.development_conclusions`: `supabase/schema-additions-004.sql` + kopia
  `backend/app/data/migrations/004_development_conclusions.sql` (opcjonalna migracja). **Nietestowane na
  prawdziwej bazie, wymaga uruchomienia skryptu 004 w Supabase.** Zapis osłonięty: błąd tylko w logu.
- Parser OSP: odczyt komórek w kontrolkach Worda (pkt 1.3).
- Termin oceny okresowej dla pracownika bez zakończonej oceny (istniejący kalkulator, 24 mies. od zatrudnienia).

## Co sprawdzić ręcznie

1. Uruchomić skrypt 004 w Supabase i zapisać szkic z wnioskami (kolumna się wypełnia).
2. Dane demonstracyjne: pracownicy okresowi bez zakończonej oceny mogą mieć teraz status „po terminie”.
3. Pierwsza ocena: wnioski przy wyniku pozytywnym trafiają do PDF; przy negatywnym formularz ostrzega.
4. Na komputerze działa stary proces uvicorn na porcie 8010 (stary kod, nieznany tryb danych) — do zamknięcia.
