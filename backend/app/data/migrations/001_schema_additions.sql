-- Kopia supabase/schema-additions.sql uruchamiana automatycznie przy starcie (DB_AUTO_MIGRATE=true).
-- Tylko dodaje tabele/kolumny (if not exists); transakcję otwiera psycopg.
select pg_advisory_xact_lock(4242001);
-- =============================================================================
-- Kompas Kompetencji: uzupełnienia schematu Supabase (schemat public)
-- Gałąź backend-dane. Uruchomić RAZ w edytorze SQL Supabase przed DATA_BACKEND=supabase.
--
-- Skrypt TYLKO DODAJE: nowe tabele i nowe kolumny dopuszczające NULL.
-- Nie zmienia ani nie usuwa istniejących tabel, kolumn, ograniczeń ani danych.
-- Można go uruchomić ponownie (if not exists).
--
-- Istniejące tabele UŻYWANE przez backend (bez zmian struktury, poza dodanymi kolumnami niżej):
--   users                 – konta (role PRZELOZONY / HR_ADMIN)
--   employees             – pracownicy (+ kolumna contract_end_date)
--   evaluations           – oceny (+ kolumny completed_at, started_at, updated_at, last_step)
--   evaluation_criteria   – kryteria oceny: suggested_score = wskazówka, approved_score = decyzja
--                           przełożonego (+ kolumna decision_note)
-- Istniejące tabele NIEUŻYWANE: competencies, behavioral_indicators, indicator_levels
--   (model kompetencji pochodzi z GET /api/v1/competencies), star_notes (zostaje bez zmian).
--   Uwaga: evaluation_criteria.competency_id ma klucz obcy do competencies; backend zakłada,
--   że competencies.id = 1–14 w kolejności modelu kompetencji (1 = Rzetelność, …).
--
-- Tabele NOWE:
--   evaluation_indicator_answers – odpowiedzi przełożonego dla wskaźników (szkic oceny)
--   employee_notes               – szybkie notatki o pracowniku (widzi je tylko autor)
--   job_descriptions             – historia opisów stanowiska pracy z wersjami i wynikiem analizy
--
-- Kolumny NOWE (wszystkie nullable, bez wartości domyślnych zmieniających istniejące wiersze):
--   employees.contract_end_date        date        – koniec umowy na czas określony (terminy pierwszej oceny)
--   evaluations.completed_at           timestamptz – data zakończenia (zatwierdzenia) oceny
--   evaluations.started_at             timestamptz – data rozpoczęcia szkicu
--   evaluations.updated_at             timestamptz – data ostatniego zapisu szkicu
--   evaluations.last_step              varchar     – ostatni otwarty krok formularza
--   evaluation_criteria.decision_note  text        – uwaga przełożonego, gdy decyzja różni się od wskazówki
--
-- Nowa wartość tekstowa (bez zmiany kolumny): evaluations.status = 'NIEROZPOCZETA' dla oceny
-- utworzonej, ale jeszcze nierozpoczętej (obok istniejących ROBOCZA i ZATWIERDZONA).
--
-- RLS: nowe tabele mają włączone Row Level Security bez polityk, więc są niedostępne dla klucza
-- anon. Backend łączy się kluczem service_role (tylko po stronie serwera, nigdy we frontendzie).
-- =============================================================================


-- d) nowe kolumny w istniejących tabelach -------------------------------------------------

alter table public.employees           add column if not exists contract_end_date date;
alter table public.evaluations         add column if not exists completed_at      timestamptz;
alter table public.evaluations         add column if not exists started_at        timestamptz;
alter table public.evaluations         add column if not exists updated_at        timestamptz;
alter table public.evaluations         add column if not exists last_step         varchar(50);
alter table public.evaluation_criteria add column if not exists decision_note     text;

-- a) odpowiedzi dla wskaźników -------------------------------------------------------------

create table if not exists public.evaluation_indicator_answers (
    id             serial primary key,
    evaluation_id  integer not null references public.evaluations (id) on delete cascade,
    -- identyfikator wskaźnika z modelu kompetencji, np. 'C01_I02'
    indicator_id   varchar(20) not null,
    -- 1/3/5/7/9; NULL = brak podstaw do oceny
    selected_level integer null check (selected_level in (1, 3, 5, 7, 9)),
    -- przykład zachowania: {"situation": "...", "action": "...", "result": "..."}
    star_note      jsonb null,
    created_at     timestamptz not null default now(),
    constraint evaluation_indicator_answers_unique unique (evaluation_id, indicator_id)
);

-- b) szybkie notatki o pracowniku ---------------------------------------------------------

create table if not exists public.employee_notes (
    id          serial primary key,
    employee_id integer not null references public.employees (id) on delete cascade,
    author_id   integer null references public.users (id) on delete set null,
    text        text not null check (char_length(text) between 1 and 500),
    created_at  timestamptz not null default now()
);

create index if not exists employee_notes_employee_author_idx
    on public.employee_notes (employee_id, author_id, created_at desc);

-- c) opisy stanowiska pracy z wersjami ------------------------------------------------------

create table if not exists public.job_descriptions (
    id          serial primary key,
    employee_id integer not null references public.employees (id) on delete cascade,
    filename    varchar(255) not null,
    version     integer not null check (version >= 1),
    -- wynik analizy potwierdzony przez przełożonego (OspAnalysis z frontendu); NULL = tylko archiwum
    analysis    jsonb null,
    uploaded_at timestamptz not null default now(),
    constraint job_descriptions_employee_version_unique unique (employee_id, version)
);

-- RLS na nowych tabelach (dostęp tylko kluczem service_role) --------------------------------

alter table public.evaluation_indicator_answers enable row level security;
alter table public.employee_notes               enable row level security;
alter table public.job_descriptions             enable row level security;


-- Cofnięcie (ręcznie, tylko jeśli naprawdę trzeba; usuwa dane z NOWYCH tabel i kolumn):
--   drop table if exists public.evaluation_indicator_answers, public.employee_notes, public.job_descriptions;
--   alter table public.employees           drop column if exists contract_end_date;
--   alter table public.evaluations         drop column if exists completed_at,
--                                          drop column if exists started_at,
--                                          drop column if exists updated_at,
--                                          drop column if exists last_step;
--   alter table public.evaluation_criteria drop column if exists decision_note;
