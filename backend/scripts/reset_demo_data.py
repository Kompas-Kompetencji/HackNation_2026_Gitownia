#!/usr/bin/env python3
"""
Zastępuje dane w bazie (DATABASE_URL) spójnym zestawem demonstracyjnym z `supabase/seed.sql`.

1. Zapisuje kopię zapasową wszystkich wierszy z tabel aplikacji do `backend/backups/<czas>.json`
   (katalog ignorowany przez Git – zawiera dane z bazy).
2. W jednej transakcji usuwa dane procesów oceny (pracownicy, oceny, notatki, opisy stanowiska,
   przypomnienia, użytkownicy) – model kompetencji (`competencies`, wskaźniki) zostaje bez zmian.
3. Wczytuje `supabase/seed.sql` (fikcyjne osoby, id od 9001).

Uruchomienie (świadomie, po uzgodnieniu z zespołem):
    python scripts/reset_demo_data.py --yes
Bez `--yes` skrypt wykonuje tylko kopię zapasową i pokazuje, co by usunął.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

import psycopg  # noqa: E402

from app.data.postgres_repo import normalize_dsn  # noqa: E402

# Kolejność usuwania: najpierw tabele zależne.
TABLES = [
    "reminders",
    "evaluation_indicator_answers",
    "evaluation_criteria",
    "star_notes",
    "employee_notes",
    "job_descriptions",
    "evaluations",
    "employees",
    "users",
]
SEED = BACKEND_ROOT.parent / "supabase" / "seed.sql"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="naprawdę zastąp dane (bez tego: tylko kopia zapasowa)")
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("Brak DATABASE_URL.")
        return 2

    with psycopg.connect(normalize_dsn(dsn), prepare_threshold=None, autocommit=False) as conn:
        backup: dict[str, list[dict]] = {}
        for table in TABLES:
            cur = conn.execute(f"select * from public.{table}")
            cols = [c.name for c in cur.description or []]
            backup[table] = [dict(zip(cols, row)) for row in cur.fetchall()]
        conn.rollback()

        out_dir = BACKEND_ROOT / "backups"
        out_dir.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out = out_dir / f"demo-backup-{stamp}.json"
        out.write_text(json.dumps(backup, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        print(f"Kopia zapasowa: {out}")
        for table in TABLES:
            print(f"  {table:30s} {len(backup[table]):4d} wierszy")

        if not args.yes:
            print("Tryb próbny: nic nie usunięto. Uruchom z --yes, aby zastąpić dane zestawem demonstracyjnym.")
            return 0

        seed_sql = SEED.read_text(encoding="utf-8")
        # seed.sql ma własne begin/commit – tu całość idzie w jednej transakcji.
        seed_sql = "\n".join(line for line in seed_sql.splitlines() if line.strip().lower() not in ("begin;", "commit;"))
        with conn.transaction():
            for table in TABLES:
                conn.execute(f"delete from public.{table}")
            conn.execute(seed_sql)
        conn.commit()

        for table in ("users", "employees", "evaluations"):
            print(f"Po zmianie {table}: {conn.execute(f'select count(*) from public.{table}').fetchone()[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
