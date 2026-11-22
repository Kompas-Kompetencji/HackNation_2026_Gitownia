-- Kopia supabase/schema-additions-004.sql uruchamiana automatycznie przy starcie (DB_AUTO_MIGRATE=true).
-- Tylko dodaje kolumnę public.evaluations.development_conclusions (if not exists).
-- Błąd tej migracji jest logowany i NIE zatrzymuje startu backendu (postgres_repo.OPTIONAL_MIGRATIONS):
-- wtedy wnioski rozwojowe nie są zapisywane w bazie, reszta oceny tak. NIETESTOWANE NA PRAWDZIWEJ BAZIE.
alter table public.evaluations add column if not exists development_conclusions text;
