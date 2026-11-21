"""
Warstwa danych aplikacji (użytkownicy, pracownicy, notatki, opisy stanowiska, oceny).

Dwie implementacje repozytorium:
- pamięciowa (domyślna, DATA_BACKEND=memory) z danymi przykładowymi zgodnymi z makietami frontendu,
- Supabase/Postgres (DATA_BACKEND=supabase) na istniejących tabelach przez REST (PostgREST).

Kształty JSON tras odpowiadają frontend/src/types/index.ts (snake_case, identyfikatory tekstowe).
"""
