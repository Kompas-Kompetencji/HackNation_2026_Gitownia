-- Kopia supabase/schema-additions-003.sql uruchamiana automatycznie przy starcie (DB_AUTO_MIGRATE=true).
-- Tylko dodaje tabelę public.reminders (if not exists); transakcję otwiera psycopg.
-- Błąd tej migracji jest logowany i NIE zatrzymuje startu backendu (postgres_repo.OPTIONAL_MIGRATIONS):
-- wtedy nie działają tylko przypomnienia. NIETESTOWANE NA PRAWDZIWEJ BAZIE.
select pg_advisory_xact_lock(4242003);

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
