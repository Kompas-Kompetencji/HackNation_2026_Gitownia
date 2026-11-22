-- Zastępstwo (art. 37 ust. 2 ustawy o służbie cywilnej): dzień porozumienia pracownika i dyrektora
-- generalnego o przeprowadzeniu pierwszej oceny – od niego biegną terminy oceny. Tylko dodaje kolumnę.
-- employees.employment_type przyjmuje nową wartość 'ZASTEPSTWO' (kolumna varchar – bez zmiany typu).
select pg_advisory_xact_lock(4242002);
alter table public.employees add column if not exists first_eval_agreement_date date;
