-- Skrypt addytywny 004 (gałąź dev_maks): wnioski dotyczące indywidualnego programu rozwoju zawodowego
-- (arkusze B i C, § 11 pkt 5 rozporządzenia z 2016 r.) oraz wnioski dotyczące rozwoju zawodowego
-- ocenianego (pierwsza ocena). Tylko dodaje jedną kolumnę; nic nie usuwa i nie zmienia.
-- NIETESTOWANE NA PRAWDZIWEJ BAZIE. Uruchomić ręcznie w Supabase (SQL Editor) przed wdrożeniem.
alter table public.evaluations add column if not exists development_conclusions text;
