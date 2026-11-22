-- =============================================================================
-- Kompas Kompetencji: dodatkowe rekordy demonstracyjne (fikcyjne) dla Supabase.
-- WYGENEROWANE przez backend/scripts/build_supabase_seed.py z app/data/seed_data.py.
-- Uruchomić po schema-additions.sql (opcjonalnie). Rekordy mają stałe id od 9001 i
-- `on conflict (id) do nothing`: nie nadpisują istniejących danych, ponowne uruchomienie
-- niczego nie dubluje. Kryteria ocen wstawiane tylko, gdy istnieje competencies.id.
-- Logowanie w aplikacji: X-User-Id = 9001 (przełożona), 9002 (przełożony), 9003 (kadry).
-- =============================================================================

begin;

insert into public.users (id, email, full_name, role, department, position) values
    (9001, 'halina.zawadzka-nowicka@urzad.example', 'Halina Zawadzka-Nowicka', 'PRZELOZONY', 'Departament Spraw Obywatelskich', 'Dyrektor Departamentu Spraw Obywatelskich'),
    (9002, 'tomasz.kedzierski@urzad.example', 'Tomasz Kędzierski', 'PRZELOZONY', 'Wydział Zamówień Publicznych', 'Naczelnik Wydziału Zamówień Publicznych'),
    (9003, 'bozena.slezak@urzad.example', 'Bożena Ślęzak', 'HR_ADMIN', 'Biuro Kadr i Szkoleń', 'Główny specjalista do spraw kadr')
on conflict (id) do nothing;

insert into public.employees (id, first_name, last_name, department, unit, position, employment_type, hire_date, contract_end_date, first_eval_agreement_date, eval_path, sheet_type, status, supervisor_id) values
    (9001, 'Joanna', 'Pietrzyk', 'Departament Spraw Obywatelskich', 'Wydział Skarg i Wniosków', 'Starszy specjalista', 'CZAS_NIEOKRESLONY', '2019-03-01', null, null, 'OKRESOWA', 'C', 'W_TRAKCIE_OBSERWACJI', 9001),
    (9002, 'Grzegorz', 'Łuczak', 'Departament Spraw Obywatelskich', 'Wydział Prawny', 'Radca', 'MIANOWANY_URZEDNIK', '2016-09-15', null, null, 'OKRESOWA', 'C', 'W_TRAKCIE_OBSERWACJI', 9001),
    (9003, 'Małgorzata', 'Wróbel-Sośnicka', 'Departament Spraw Obywatelskich', 'Wydział Obsługi Interesantów', 'Naczelnik wydziału', 'CZAS_NIEOKRESLONY', '2021-02-01', null, null, 'OKRESOWA', 'B', 'W_TRAKCIE_OBSERWACJI', 9001),
    (9004, 'Paweł', 'Żmijewski', 'Wydział Zamówień Publicznych', 'Wydział Zamówień Publicznych', 'Specjalista', 'CZAS_OKRESLONY_12M', '2026-11-16', '2027-11-15', null, 'PIERWSZA', 'PIERWSZA', 'ROZMOWA_WSTEPNA', 9002),
    (9005, 'Karolina', 'Mazur', 'Wydział Zamówień Publicznych', 'Wydział Zamówień Publicznych', 'Starszy referent', 'CZAS_OKRESLONY_12M', '2026-02-02', '2027-02-01', null, 'PIERWSZA', 'PIERWSZA', 'ROZMOWA_WSTEPNA', 9002),
    (9006, 'Adam', 'Wilk', 'Wydział Zamówień Publicznych', 'Wydział Zamówień Publicznych', 'Specjalista', 'ZASTEPSTWO', '2026-05-04', '2027-08-31', '2026-06-01', 'PIERWSZA', 'PIERWSZA', 'ROZMOWA_WSTEPNA', 9002),
    (9007, 'Ewa', 'Kubiak', 'Departament Spraw Obywatelskich', 'Wydział Prawny', 'Główny specjalista', 'MIANOWANY_URZEDNIK', '2018-01-08', null, null, 'OKRESOWA', 'C', 'W_TRAKCIE_OBSERWACJI', 9001)
on conflict (id) do nothing;

insert into public.evaluations (id, employee_id, supervisor_id, eval_path, sheet_type, status, due_date, average_score, overall_level, final_result, justification, started_at, completed_at) values
    (9001, 9001, 9001, 'OKRESOWA', 'C', 'ROBOCZA', '2026-12-09', null, null, null, null, '2026-11-12T08:00:00+00:00', null),
    (9002, 9001, 9001, 'OKRESOWA', 'C', 'ZATWIERDZONA', '2024-12-09', 5.86, 'na poziomie oczekiwań', 'POZYTYWNA', null, '2024-12-09T08:00:00+00:00', '2024-12-09T14:00:00+00:00'),
    (9003, 9001, 9001, 'OKRESOWA', 'C', 'ZATWIERDZONA', '2022-12-12', 3.33, 'poniżej oczekiwań', 'NEGATYWNA', 'W okresie oceny siedem z dwudziestu odpowiedzi na skargi zostało wysłanych po terminie ustawowym, bez wcześniejszej informacji o ryzyku opóźnienia. Pracownica nie skorzystała z zaplanowanego szkolenia z postępowania administracyjnego.', '2022-12-12T08:00:00+00:00', '2022-12-12T14:00:00+00:00'),
    (9004, 9001, 9001, 'PIERWSZA', 'PIERWSZA', 'ZATWIERDZONA', '2019-08-28', null, null, 'POZYTYWNA', null, '2019-08-28T08:00:00+00:00', '2019-08-28T14:00:00+00:00'),
    (9005, 9002, 9001, 'OKRESOWA', 'C', 'ZATWIERDZONA', '2025-05-20', 6.5, 'powyżej oczekiwań', 'POZYTYWNA', null, '2025-05-20T08:00:00+00:00', '2025-05-20T14:00:00+00:00'),
    (9006, 9002, 9001, 'OKRESOWA', 'C', 'ZATWIERDZONA', '2023-05-18', 5.67, 'na poziomie oczekiwań', 'POZYTYWNA', null, '2023-05-18T08:00:00+00:00', '2023-05-18T14:00:00+00:00'),
    (9007, 9003, 9001, 'OKRESOWA', 'B', 'NIEROZPOCZETA', '2026-10-14', null, null, null, null, null, null),
    (9008, 9003, 9001, 'OKRESOWA', 'B', 'ZATWIERDZONA', '2024-10-14', 6.14, 'powyżej oczekiwań', 'POZYTYWNA', null, '2024-10-14T08:00:00+00:00', '2024-10-14T14:00:00+00:00'),
    (9009, 9003, 9001, 'PIERWSZA', 'PIERWSZA', 'ZATWIERDZONA', '2021-07-30', null, null, 'POZYTYWNA', null, '2021-07-30T08:00:00+00:00', '2021-07-30T14:00:00+00:00'),
    (9010, 9004, 9002, 'PIERWSZA', 'PIERWSZA', 'NIEROZPOCZETA', '2027-11-14', null, null, null, null, null, null),
    (9011, 9005, 9002, 'PIERWSZA', 'PIERWSZA', 'ROBOCZA', '2027-01-01', null, null, null, null, '2026-11-18T09:00:00+00:00', null),
    (9012, 9006, 9002, 'PIERWSZA', 'PIERWSZA', 'NIEROZPOCZETA', '2027-07-31', null, null, null, null, null, null),
    (9013, 9007, 9001, 'OKRESOWA', 'C', 'ZATWIERDZONA', '2024-12-17', 6.14, 'powyżej oczekiwań', 'POZYTYWNA', null, '2024-12-17T08:00:00+00:00', '2024-12-17T14:00:00+00:00'),
    (9014, 9007, 9001, 'OKRESOWA', 'C', 'ZATWIERDZONA', '2022-12-15', 5.67, 'na poziomie oczekiwań', 'POZYTYWNA', null, '2022-12-15T08:00:00+00:00', '2022-12-15T14:00:00+00:00')
on conflict (id) do nothing;

insert into public.evaluation_criteria (id, evaluation_id, competency_id, is_mandatory, approved_score)
select * from (values
    (9001, 9002, 3, true, 5),
    (9002, 9002, 1, true, 7),
    (9003, 9002, 4, true, 5),
    (9004, 9002, 6, true, 7),
    (9005, 9002, 2, true, 5),
    (9006, 9002, 10, false, 7),
    (9007, 9002, 7, false, 5),
    (9008, 9003, 3, true, 3),
    (9009, 9003, 1, true, 1),
    (9010, 9003, 4, true, 3),
    (9011, 9003, 6, true, 5),
    (9012, 9003, 2, true, 3),
    (9013, 9003, 10, false, 5),
    (9014, 9005, 3, true, 7),
    (9015, 9005, 1, true, 7),
    (9016, 9005, 4, true, 5),
    (9017, 9005, 6, true, 5),
    (9018, 9005, 2, true, 7),
    (9019, 9005, 7, false, 9),
    (9020, 9005, 8, false, 7),
    (9021, 9005, 9, false, 5),
    (9022, 9006, 3, true, 7),
    (9023, 9006, 1, true, 5),
    (9024, 9006, 4, true, 5),
    (9025, 9006, 6, true, 5),
    (9026, 9006, 2, true, 5),
    (9027, 9006, 7, false, 7),
    (9028, 9008, 13, true, 5),
    (9029, 9008, 14, true, 7),
    (9030, 9008, 4, true, 7),
    (9031, 9008, 6, true, 5),
    (9032, 9008, 2, true, 5),
    (9033, 9008, 10, false, 7),
    (9034, 9008, 11, false, 7),
    (9035, 9013, 3, true, 7),
    (9036, 9013, 1, true, 7),
    (9037, 9013, 4, true, 5),
    (9038, 9013, 6, true, 5),
    (9039, 9013, 2, true, 7),
    (9040, 9013, 7, false, 7),
    (9041, 9013, 8, false, 5),
    (9042, 9014, 3, true, 5),
    (9043, 9014, 1, true, 5),
    (9044, 9014, 4, true, 5),
    (9045, 9014, 6, true, 5),
    (9046, 9014, 2, true, 7),
    (9047, 9014, 7, false, 7)
) as v(id, evaluation_id, competency_id, is_mandatory, approved_score)
where exists (select 1 from public.competencies c where c.id = v.competency_id)
on conflict (id) do nothing;

insert into public.employee_notes (id, employee_id, author_id, text, created_at) values
    (9001, 9001, 9001, 'Samodzielnie przygotowała odpowiedź na skargę zbiorczą mieszkańców, termin dotrzymany mimo dwóch tygodni zastępstwa.', '2026-10-02T09:40:00+00:00'),
    (9002, 9001, 9001, 'Zauważyła błędną podstawę prawną w projekcie odpowiedzi kolegi i poprawiła ją przed wysyłką; skarżący nie odwołał się.', '2026-06-17T11:20:00+00:00'),
    (9003, 9001, 9001, 'Dwa pisma w lutym wysłane po terminie ustawowym; nie zgłosiła wcześniej ryzyka opóźnienia.', '2026-03-05T14:00:00+00:00'),
    (9004, 9001, 9001, 'Przeprowadziła dla zespołu krótkie szkolenie z nowej instrukcji kancelaryjnej po kursie w październiku.', '2025-11-24T08:45:00+00:00'),
    (9005, 9002, 9001, 'Opinia do projektu uchwały wskazała dwie kolizje z ustawą; projekt poprawiono przed posiedzeniem zarządu.', '2026-09-09T10:10:00+00:00'),
    (9006, 9003, 9001, 'Wprowadziła nowy grafik dyżurów w punkcie obsługi; kolejki w poniedziałki krótsze o około połowę.', '2026-09-18T13:05:00+00:00'),
    (9007, 9007, 9001, 'Przygotowała analizę orzecznictwa do sprawy spornej; zarząd przyjął rekomendowane stanowisko bez poprawek.', '2026-08-21T10:00:00+00:00'),
    (9008, 9003, 9001, 'Przy awarii systemu kolejkowego w ciągu godziny zorganizowała ręczną obsługę i poinformowała interesantów.', '2026-05-12T09:30:00+00:00')
on conflict (id) do nothing;

insert into public.job_descriptions (id, employee_id, filename, version, analysis, uploaded_at) values
    (9001, 9001, 'opis_stanowiska_specjalista_skargi_2022.docx', 1, '{"filename": "opis_stanowiska_specjalista_skargi_2022.docx", "position_title": "Starszy specjalista", "organizational_unit": "Wydział Skarg i Wniosków", "has_management_duties": false, "subordinates_count": 0, "suggested_form": "C", "additional_criteria": [{"criterion_id": "C10", "name": "Orientacja na klienta/interesanta", "rationale": "Stanowisko obsługuje skargi i wnioski mieszkańców."}, {"criterion_id": "C07", "name": "Myślenie analityczne", "rationale": "Opis stanowiska wskazuje analizę zasadności skarg i wskazywanie ich przyczyn."}, {"criterion_id": "C11", "name": "Radzenie sobie w sytuacjach kryzysowych", "rationale": "Do obowiązków należą rozmowy z wzburzonymi skarżącymi."}]}', '2022-11-03T09:15:00+00:00'),
    (9002, 9001, 'opis_stanowiska_starszy_specjalista_skargi.docx', 2, '{"filename": "opis_stanowiska_starszy_specjalista_skargi.docx", "position_title": "Starszy specjalista", "organizational_unit": "Wydział Skarg i Wniosków", "has_management_duties": false, "subordinates_count": 0, "suggested_form": "C", "additional_criteria": [{"criterion_id": "C10", "name": "Orientacja na klienta/interesanta", "rationale": "Stanowisko obsługuje skargi i wnioski mieszkańców."}, {"criterion_id": "C07", "name": "Myślenie analityczne", "rationale": "Opis stanowiska wskazuje analizę zasadności skarg i wskazywanie ich przyczyn."}, {"criterion_id": "C11", "name": "Radzenie sobie w sytuacjach kryzysowych", "rationale": "Do obowiązków należą rozmowy z wzburzonymi skarżącymi."}]}', '2024-11-20T10:00:00+00:00'),
    (9003, 9002, 'opis_stanowiska_radca_wydzial_prawny.docx', 1, '{"filename": "opis_stanowiska_radca_wydzial_prawny.docx", "position_title": "Radca", "organizational_unit": "Wydział Prawny", "has_management_duties": false, "subordinates_count": 0, "suggested_form": "C", "additional_criteria": [{"criterion_id": "C07", "name": "Myślenie analityczne", "rationale": "Stanowisko obejmuje opiniowanie projektów aktów prawnych."}, {"criterion_id": "C08", "name": "Negocjowanie", "rationale": "Opis wymaga uzgadniania stanowiska urzędu z innymi resortami."}, {"criterion_id": "C09", "name": "Wystąpienia publiczne", "rationale": "Radca reprezentuje urząd na posiedzeniach komisji."}]}', '2025-04-30T08:30:00+00:00')
on conflict (id) do nothing;

-- Sekwencje: tylko przesunięcie w przód, żeby kolejne zwykłe wstawienia nie trafiły w id 9001+.
select setval(pg_get_serial_sequence('public.users', 'id'), greatest((select max(id) from public.users), (select last_value from public.users_id_seq)));
select setval(pg_get_serial_sequence('public.employees', 'id'), greatest((select max(id) from public.employees), (select last_value from public.employees_id_seq)));
select setval(pg_get_serial_sequence('public.evaluations', 'id'), greatest((select max(id) from public.evaluations), (select last_value from public.evaluations_id_seq)));
select setval(pg_get_serial_sequence('public.evaluation_criteria', 'id'), greatest((select max(id) from public.evaluation_criteria), (select last_value from public.evaluation_criteria_id_seq)));
select setval(pg_get_serial_sequence('public.employee_notes', 'id'), greatest((select max(id) from public.employee_notes), (select last_value from public.employee_notes_id_seq)));
select setval(pg_get_serial_sequence('public.job_descriptions', 'id'), greatest((select max(id) from public.job_descriptions), (select last_value from public.job_descriptions_id_seq)));

commit;
