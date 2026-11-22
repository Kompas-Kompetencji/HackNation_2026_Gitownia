-- Dziennik zdarzeń (rozliczalność): kto, kiedy, jaka czynność, na jakim obiekcie. Bez treści ocen.
-- Tylko dodaje tabelę (if not exists). Uruchamiana automatycznie przy starcie (DB_AUTO_MIGRATE=true).
select pg_advisory_xact_lock(4242005);

create table if not exists public.audit_log (
    id         bigserial primary key,
    at         timestamptz not null default now(),
    user_id    integer null references public.users (id) on delete set null,
    user_role  varchar(32) null,
    action     varchar(64) not null,
    entity     varchar(32) not null,
    entity_id  varchar(64) null,
    details    text not null default ''
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;
