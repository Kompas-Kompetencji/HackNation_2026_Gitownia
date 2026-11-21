# Istniejący schemat bazy w Supabase (schemat `public`)

Stan na 21 listopada 2026, dostarczony przez osobę odpowiedzialną za bazę. Backend (FastAPI, gałąź
`feature/wspolne-klejenie`) na razie z tej bazy nie korzysta. W tabelach są dane demonstracyjne
(patrz niżej): nie nadpisywać, nie czyścić, seed dodawać tylko z `on conflict do nothing`.

Identyfikatory są liczbami całkowitymi (sekwencje). Frontend używa identyfikatorów tekstowych,
więc adaptery po stronie backendu zamieniają liczbę na tekst.

## Liczba rekordów

| Tabela | Rekordów |
|---|---|
| users | 2 |
| employees | 3 |
| evaluations | 3 |
| star_notes | 2 |

## Tabele i kolumny

### users
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (users_id_seq) |
| email | character varying | tak | |
| full_name | character varying | tak | |
| role | character varying | tak | |
| department | character varying | tak | |
| position | character varying | tak | |

### competencies
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (competencies_id_seq) |
| name | character varying | tak | |
| description | text | nie | |
| is_mandatory_first | boolean | nie | false |
| is_mandatory_a | boolean | nie | false |
| is_mandatory_b | boolean | nie | false |
| is_mandatory_c | boolean | nie | false |

### behavioral_indicators
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (behavioral_indicators_id_seq) |
| competency_id | integer | nie | |
| indicator_order | integer | tak | |
| name | text | tak | |

### indicator_levels
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (indicator_levels_id_seq) |
| indicator_id | integer | nie | |
| score | integer | tak | |
| label | character varying | tak | |
| description | text | tak | |

### employees
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (employees_id_seq) |
| first_name | character varying | tak | |
| last_name | character varying | tak | |
| department | character varying | tak | |
| unit | character varying | nie | |
| position | character varying | tak | |
| osp_symbol | character varying | nie | |
| employment_type | character varying | tak | |
| civil_service_degree | character varying | nie | |
| hire_date | date | tak | |
| eval_path | character varying | tak | |
| sheet_type | character varying | tak | |
| status | character varying | tak | |
| supervisor_id | integer | nie | |

### evaluations
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (evaluations_id_seq) |
| employee_id | integer | nie | |
| supervisor_id | integer | nie | |
| eval_path | character varying | tak | |
| sheet_type | character varying | tak | |
| status | character varying | tak | |
| initial_talk_date | date | nie | |
| period_start | date | nie | |
| period_end | date | nie | |
| due_date | date | tak | |
| exam_passed | character varying | nie | |
| report_on_time | boolean | nie | |
| average_score | numeric | nie | |
| overall_level | character varying | nie | |
| final_result | character varying | nie | |
| justification | text | nie | |
| iprz_notes | text | nie | |
| degree_request | boolean | nie | false |

### evaluation_criteria
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (evaluation_criteria_id_seq) |
| evaluation_id | integer | nie | |
| competency_id | integer | nie | |
| is_mandatory | boolean | nie | true |
| suggested_score | integer | nie | |
| approved_score | integer | nie | |

### star_notes
| Kolumna | Typ | Wymagana | Domyślna |
|---|---|---|---|
| id | integer | tak | nextval (star_notes_id_seq) |
| employee_id | integer | nie | |
| competency_id | integer | nie | |
| author_id | integer | nie | |
| event_date | date | tak | |
| sentiment | character varying | tak | |
| situation | text | tak | |
| task_action | text | tak | |
| result | text | tak | |

## Klucze obce

| Tabela | Kolumna | Odnosi się do |
|---|---|---|
| behavioral_indicators | competency_id | competencies.id |
| employees | supervisor_id | users.id |
| evaluation_criteria | evaluation_id | evaluations.id |
| evaluation_criteria | competency_id | competencies.id |
| evaluations | employee_id | employees.id |
| evaluations | supervisor_id | users.id |
| indicator_levels | indicator_id | behavioral_indicators.id |
| star_notes | employee_id | employees.id |
| star_notes | competency_id | competencies.id |
| star_notes | author_id | users.id |

## Wartości pól tekstowych

Wartości obecne w danych demonstracyjnych oraz pełny zestaw przewidziany w pliku `seedDB.py`
(w repozytorium backendu):

| Pole | Wartości |
|---|---|
| employees.status | ROZMOWA_WSTEPNA, W_TRAKCIE_OBSERWACJI, DO_OCENY, ZAKONCZONA (w danych: DO_OCENY, W_TRAKCIE_OBSERWACJI) |
| employees.eval_path | OKRESOWA, PIERWSZA |
| employees.sheet_type | PIERWSZA, A, B, C |
| employees.employment_type | CZAS_NIEOKRESLONY, CZAS_OKRESLONY_12M, MIANOWANY_URZEDNIK |
| evaluations.status | ROBOCZA, ZATWIERDZONA (w danych: ROBOCZA) |
| evaluations.final_result | w danych puste (jeszcze brak zakończonej oceny); wartości do ustalenia z backendem |
| users.role | HR_ADMIN (kadry), PRZELOZONY (przełożony) |

## Czego w schemacie brakuje względem frontendu

1. Oceny na poziomie wskaźnika (poziom 1/3/5/7/9 lub brak podstaw, przykład) dla szkicu oceny.
2. Szybkie notatki o pracowniku (krótki tekst z datą); `star_notes` jest strukturalne
   (sytuacja, działanie, rezultat, nastawienie) i zostaje do przykładów przy wskaźnikach.
3. Historia opisów stanowiska pracy z wersjami i wynikiem analizy.
4. `employees.contract_end_date` (terminy pierwszej oceny) i `evaluations.completed_at`.
