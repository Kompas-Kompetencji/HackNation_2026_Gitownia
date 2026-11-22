-- =============================================================================
-- Kompas Kompetencji: przypomnienia od kadr dla przełożonych (etap 6, gałąź dev_maks)
--
-- Skrypt TYLKO DODAJE nową tabelę public.reminders (create table if not exists).
-- Nie zmienia ani nie usuwa istniejących tabel, kolumn, ograniczeń ani danych.
-- Można go uruchomić ponownie.
--
-- reminders – przypomnienie wysłane przez kadry do przełożonego:
--   author_id     – konto kadr, które wysłało przypomnienie (users.id)
--   supervisor_id – adresat: przełożony (users.id)
--   employee_ids  – lista identyfikatorów pracowników tego przełożonego (employees.id), JSON, może być pusta
--   message       – treść (1–1000 znaków; bez treści ocen)
--   created_at    – data wysłania
--
-- RLS: włączone bez polityk (dostęp tylko z serwera kluczem service_role / przez DATABASE_URL),
-- tak jak pozostałe nowe tabele.
-- NIETESTOWANE NA PRAWDZIWEJ BAZIE – sprawdzić na kopii bazy przed wdrożeniem.
-- =============================================================================

begin;

create table if not exists public.reminders (
    id            serial primary key,
    author_id     integer null references public.users (id) on delete set null,
    supervisor_id integer not null references public.users (id) on delete cascade,
    employee_ids  jsonb not null default '[]'::jsonb,
    message       text not null check (char_length(message) between 1 and 1000),
    created_at    timestamptz not null default now()
);

create index if not exists reminders_supervisor_created_idx
    on public.reminders (supervisor_id, created_at desc);

alter table public.reminders enable row level security;

commit;

-- Cofnięcie (ręcznie, usuwa zapisane przypomnienia):
--   drop table if exists public.reminders;
