# Backend: dane i wskazówka poziomu (gałąź `backend-dane`)

Gałąź odcięta od `feature/wspolne-klejenie`. Zmiany są tylko dodające: istniejące trasy, pliki
i tabele działają jak wcześniej. Jedyna zmiana w istniejącym pliku to trzy linie dopisane na końcu
`backend/app/main.py` (rejestracja nowego routera).

## Co dodano

| Element | Gdzie |
|---|---|
| `POST /api/v1/calculate-score`: wskazówka poziomu dla jednego kryterium (punkt 1 próśb) | `app/routers/data_router.py`, `app/data/service.py` |
| Trasy danych dla frontendu (punkt 6 próśb), kształty jak w `frontend/src/types/index.ts` | `app/routers/data_router.py` |
| Warstwa repozytoriów: pamięciowa (domyślna) i Supabase | `app/data/` |
| SQL dla Supabase: tylko nowe tabele i kolumny + dane demonstracyjne | `supabase/schema-additions.sql`, `supabase/seed.sql` |
| Generator `seed.sql` z danych przykładowych | `scripts/build_supabase_seed.py` |
| Testy | `tests/test_data_routes.py`, `tests/test_supabase_adapter.py` |
| Przykład zmiennych | `backend/.env.example` |

Nowe trasy (wszystkie pod `/api/v1`):

```
POST /calculate-score                    {answers: IndicatorAnswer[]} → {mean, suggested_level, counted_indicators}
GET  /auth/demo-users                    konta do logowania demonstracyjnego
GET  /users/{id}
GET  /employees                          przełożony: swoi; kadry: wszyscy
POST /employees
GET  /employees/{id}                     404 brak, 403 cudzy pracownik
GET  /employees/{id}/notes               notatki widzi tylko autor
POST /employees/{id}/notes               {text}
GET  /employees/{id}/job-descriptions    wersje opisu stanowiska
POST /employees/{id}/job-descriptions    multipart: file + confirmed_analysis (JSON)
GET  /assessments?employee_id=&supervisor_id=&status=
POST /assessments                        {employee_id, kind} → szkic (nierozpoczęta ocena zamienia się w szkic)
GET  /assessments/{id}
PUT  /assessments/{id}/draft             409, gdy zakończona
POST /assessments/{id}/complete          422 przy brakach (decyzje, uzasadnienie, błędy silnika)
GET  /assessments/{id}/pdf               istniejący generator PDF
```

Użytkownik z nagłówka `X-User-Id` (brak lub nieznany → 401). Przełożony widzi tylko swoich
pracowników i ich oceny (cudze → 403), kadry widzą wszystko, ale niczego nie zmieniają (403).

Zasady wzięte z istniejącego kodu, bez powielania: wynik oceny `scoring_engine.evaluate`,
terminy `deadline_calc` (pierwsza ocena) i art. 112 KC (kolejna ocena po 24 albo 6 miesiącach),
wskazówka według progów § 11 ust. 1 pkt 2 (`determine_periodic_overall_level`; remis na granicy
daje niższy poziom, np. średnia 4,00 → 3). Status pracownika (termin minął, wkrótce, w toku,
czeka na pierwszą ocenę, aktualna) jest wyliczany, nie zapisywany.

## Uruchomienie lokalne (wersja pamięciowa, bez bazy)

```
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs (grupa „Dane: pracownicy i oceny”). Konta: `sup-001`,
`sup-002` (przełożeni), `hr-001` (kadry). Przykład:

```
curl -H "X-User-Id: sup-001" http://localhost:8000/api/v1/employees
```

Dane pamięciowe odpowiadają makietom frontendu i znikają po restarcie. Testy:

```
.venv\Scripts\python -m pytest tests/test_data_routes.py tests/test_supabase_adapter.py -q
```

(W `tests/test_ai_chats.py` trzy testy nie przechodzą już na `feature/wspolne-klejenie`: wołają
trasy `/api/v1/ai/assistants` itp., których tam nie ma. Nie ruszałem ich.)

## Włączenie Supabase

1. **Kopia zapasowa** (zalecane): Supabase → Database → Backups.
2. Supabase → SQL Editor → wklej i uruchom `supabase/schema-additions.sql`. Skrypt tylko dodaje
   (`if not exists`): tabele `evaluation_indicator_answers`, `employee_notes`, `job_descriptions`
   oraz kolumny dopuszczające NULL: `employees.contract_end_date`, `evaluations.completed_at`,
   `started_at`, `updated_at`, `last_step`, `evaluation_criteria.decision_note`. Na początku pliku
   jest lista użytych i nowych tabel.
3. Opcjonalnie `supabase/seed.sql`: rekordy demonstracyjne jak w makietach, z id od 9001
   i `on conflict (id) do nothing` (istniejące dane zostają, ponowne uruchomienie niczego nie
   dubluje). Logowanie: `X-User-Id: 9001` (przełożona), `9002` (przełożony), `9003` (kadry).
4. `backend/.env` (wzór w `backend/.env.example`):

   ```
   DATA_BACKEND=supabase
   SUPABASE_URL=https://<projekt>.supabase.co
   SUPABASE_KEY=<klucz service_role>
   ```

5. Uruchom backend jak wyżej. Identyfikatory z bazy przychodzą jako tekst (`"12"`).

Mapowanie wartości (adaptery w `app/data/supabase_repo.py`, tabele bez zmian):

| Baza | API |
|---|---|
| `users.role` PRZELOZONY / HR_ADMIN | `supervisor` / `hr` |
| `users.full_name`, `position`, `department` | `first_name` + `last_name`, `job_title`, `organizational_unit` |
| `employees.eval_path` OKRESOWA / PIERWSZA | `periodic` / `first` |
| `sheet_type` B / C / PIERWSZA / A | `"B"` / `"C"` / `"first"` / pomijane (`form: null`, oceny z arkuszem A nie są zwracane) |
| `employment_type` CZAS_NIEOKRESLONY / CZAS_OKRESLONY_12M / MIANOWANY_URZEDNIK | `indefinite` / `fixed_term_first` / `appointment` |
| `employees.unit` (gdy puste: `department`), `position` | `organizational_unit`, `position_title` |
| `evaluations.status` ROBOCZA / ZATWIERDZONA / NIEROZPOCZETA | `draft` / `completed` / `not_started` (`overdue` wyliczane z terminu) |
| `final_result` POZYTYWNA / NEGATYWNA | `positive` / `negative` |
| `evaluation_criteria.suggested_score` / `approved_score` | wskazówka / decyzja przełożonego |

Uwagi do sprawdzenia przy pierwszym uruchomieniu na Supabase:

- `evaluation_criteria.competency_id` ma klucz obcy do `competencies`; backend zakłada, że
  `competencies.id` 1–14 odpowiada modelowi z `/competencies` (1 = Rzetelność, …). Jeśli id są inne,
  zapis kryteriów się nie uda (błąd klucza obcego).
- `NIEROZPOCZETA` to nowa wartość w `evaluations.status`. Jeśli na tej kolumnie jest ograniczenie
  CHECK (opis schematu go nie wymienia), seed i tworzenie pierwszej oceny je naruszą.
- `employees.status` jest zapisywany tylko przy dodaniu pracownika (ROZMOWA_WSTEPNA albo
  W_TRAKCIE_OBSERWACJI); API go nie czyta.
- Pliku `seedDB.py` nie znalazłem w żadnej gałęzi repozytorium; wartości pól wziąłem z
  `docs/supabase-istniejacy-schemat.md`.
- SQL nie był uruchamiany na prawdziwym Postgresie (brak lokalnej bazy); adaptery są sprawdzone
  testami na atrapie PostgREST.

## Jak cofnąć

- Bez bazy: `DATA_BACKEND=memory` (albo usuń zmienną) i restart. Supabase przestaje być używany.
- Kod: nie scalać gałęzi `backend-dane` albo `git revert` jej commitów.
- Rekordy demonstracyjne z `seed.sql` (dokładne zakresy id z pliku; najpierw tabele zależne):

  ```sql
  delete from public.evaluation_criteria          where evaluation_id between 9001 and 9010;
  delete from public.evaluation_indicator_answers where evaluation_id between 9001 and 9010;
  delete from public.evaluations                  where id between 9001 and 9010;
  delete from public.employee_notes               where employee_id between 9001 and 9004;
  delete from public.job_descriptions             where employee_id between 9001 and 9004;
  delete from public.employees                    where id between 9001 and 9004;
  delete from public.users                        where id between 9001 and 9003;
  ```

  Jeśli w aplikacji utworzono oceny dla tych pracowników (nowe id spoza zakresu), usuwanie
  pracowników zatrzyma klucz obcy; wtedy najpierw sprawdź je `select * from public.evaluations
  where employee_id between 9001 and 9004`.
- Schemat: polecenia `drop` są w komentarzu na końcu `supabase/schema-additions.sql`. Usuwają tylko
  nowe tabele i kolumny (razem z ich danymi).
