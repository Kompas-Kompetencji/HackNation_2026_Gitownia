"""
Generuje supabase/seed.sql z danych przykładowych wersji pamięciowej (app/data/seed_data.py),
żeby Supabase i tryb pamięciowy miały te same rekordy demonstracyjne.

Rekordy dostają stałe identyfikatory od 9001 i są wstawiane z `on conflict (id) do nothing`,
więc nie nadpisują istniejących danych, a ponowne uruchomienie niczego nie dubluje.

Użycie (z katalogu backend/):  python scripts/build_supabase_seed.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.scoring_engine import evaluate  # noqa: E402
from app.data.seed_data import build_seed  # noqa: E402
from app.data.service import DataService  # noqa: E402
from app.data.memory_repo import MemoryRepository  # noqa: E402

OUTPUT = BACKEND_ROOT.parent / "supabase" / "seed.sql"
FIRST_ID = 9001

ROLE = {"supervisor": "PRZELOZONY", "hr": "HR_ADMIN"}
CONTRACT = {"indefinite": "CZAS_NIEOKRESLONY", "fixed_term_first": "CZAS_OKRESLONY_12M", "appointment": "MIANOWANY_URZEDNIK", "replacement": "ZASTEPSTWO"}
PATH = {"periodic": "OKRESOWA", "first": "PIERWSZA"}
SHEET = {"B": "B", "C": "C", "first": "PIERWSZA"}
STATUS = {"draft": "ROBOCZA", "completed": "ZATWIERDZONA", "not_started": "NIEROZPOCZETA"}
RESULT = {"positive": "POZYTYWNA", "negative": "NEGATYWNA"}
EMPLOYEE_STATUS = {"first": "ROZMOWA_WSTEPNA", "periodic": "W_TRAKCIE_OBSERWACJI"}
EMAILS = {"sup-001": "halina.zawadzka-nowicka@urzad.example", "sup-002": "tomasz.kedzierski@urzad.example", "hr-001": "bozena.slezak@urzad.example"}


def q(value: object) -> str:
    """Literał SQL."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def ids(items: list, prefix_id: int = FIRST_ID) -> dict[str, int]:
    return {item.id: prefix_id + i for i, item in enumerate(items)}


def insert(table: str, columns: list[str], rows: list[list[object]], guard: str | None = None) -> str:
    if not rows:
        return ""
    values = ",\n".join("    (" + ", ".join(q(v) for v in row) + ")" for row in rows)
    cols = ", ".join(columns)
    if guard:
        return (
            f"insert into public.{table} ({cols})\nselect * from (values\n{values}\n) as v({cols})\n"
            f"where {guard}\non conflict (id) do nothing;\n"
        )
    return f"insert into public.{table} ({cols}) values\n{values}\non conflict (id) do nothing;\n"


def main() -> int:
    seed = build_seed()
    service = DataService(MemoryRepository(build_seed()))
    users = {u.id: u for u in seed.users}
    employees_by_id = {e.id: e for e in seed.employees}

    user_ids = ids(seed.users)
    employee_ids = ids(seed.employees)
    assessment_ids = ids(seed.assessments)

    parts: list[str] = [
        "-- =============================================================================",
        "-- Kompas Kompetencji: dodatkowe rekordy demonstracyjne (fikcyjne) dla Supabase.",
        "-- WYGENEROWANE przez backend/scripts/build_supabase_seed.py z app/data/seed_data.py.",
        "-- Uruchomić po schema-additions.sql (opcjonalnie). Rekordy mają stałe id od 9001 i",
        "-- `on conflict (id) do nothing`: nie nadpisują istniejących danych, ponowne uruchomienie",
        "-- niczego nie dubluje. Kryteria ocen wstawiane tylko, gdy istnieje competencies.id.",
        "-- Logowanie w aplikacji: X-User-Id = 9001 (przełożona), 9002 (przełożony), 9003 (kadry).",
        "-- =============================================================================",
        "",
        "begin;",
        "",
    ]

    parts.append(insert(
        "users", ["id", "email", "full_name", "role", "department", "position"],
        [[user_ids[u.id], EMAILS[u.id], f"{u.first_name} {u.last_name}", ROLE[u.role], u.organizational_unit, u.job_title]
         for u in seed.users],
    ))

    parts.append(insert(
        "employees",
        ["id", "first_name", "last_name", "department", "unit", "position", "employment_type", "hire_date",
         "contract_end_date", "first_eval_agreement_date", "eval_path", "sheet_type", "status", "supervisor_id"],
        [[employee_ids[e.id], e.first_name, e.last_name, users[e.supervisor_id].organizational_unit, e.organizational_unit,
          e.position_title, CONTRACT[e.contract_type], e.hire_date.isoformat(),
          e.contract_end_date.isoformat() if e.contract_end_date else None,
          e.first_eval_agreement_date.isoformat() if e.first_eval_agreement_date else None, PATH[e.assessment_kind],
          # sheet_type jest wymagane; pracownik bez opisu stanowiska dostaje arkusz z otwartej oceny (B)
          SHEET[e.form] if e.form else "B", EMPLOYEE_STATUS[e.assessment_kind], user_ids[e.supervisor_id]]
         for e in seed.employees],
    ))

    evaluation_rows = []
    criteria_rows = []
    criterion_id = FIRST_ID
    for a in seed.assessments:
        employee = employees_by_id[a.employee_id]
        average = level = None
        if a.status == "completed" and a.decisions:
            r = evaluate(service._evaluation_request(a, employee, users))
            average, level = r.srednia_arytmetyczna, r.ogolny_poziom
        evaluation_rows.append([
            assessment_ids[a.id], employee_ids[a.employee_id], user_ids[employee.supervisor_id], PATH[a.kind], SHEET[a.form],
            STATUS[a.status], a.due_date.isoformat(), average, level, RESULT.get(a.result or ""),
            a.justification_draft or None,
            a.started_at.isoformat() if a.started_at else None, a.completed_at.isoformat() if a.completed_at else None,
        ])
        for d in a.decisions:
            criteria_rows.append([criterion_id, assessment_ids[a.id], int(d.competency_id[1:]), d.is_mandatory, d.selected_level])
            criterion_id += 1

    parts.append(insert(
        "evaluations",
        ["id", "employee_id", "supervisor_id", "eval_path", "sheet_type", "status", "due_date", "average_score",
         "overall_level", "final_result", "justification", "started_at", "completed_at"],
        evaluation_rows,
    ))
    parts.append(insert(
        "evaluation_criteria",
        ["id", "evaluation_id", "competency_id", "is_mandatory", "approved_score"],
        criteria_rows,
        guard="exists (select 1 from public.competencies c where c.id = v.competency_id)",
    ))

    parts.append(insert(
        "employee_notes", ["id", "employee_id", "author_id", "text", "created_at"],
        [[FIRST_ID + i, employee_ids[n.employee_id], user_ids[author], n.text, n.created_at.isoformat()]
         for i, (n, author) in enumerate(seed.notes)],
    ))

    parts.append(insert(
        "job_descriptions", ["id", "employee_id", "filename", "version", "analysis", "uploaded_at"],
        [[FIRST_ID + i, employee_ids[d.employee_id], d.filename, d.version,
          json.dumps(d.analysis.model_dump(), ensure_ascii=False) if d.analysis else None, d.uploaded_at.isoformat()]
         for i, d in enumerate(seed.job_descriptions)],
    ))

    parts.append(
        "-- Sekwencje: tylko przesunięcie w przód, żeby kolejne zwykłe wstawienia nie trafiły w id 9001+.\n"
        + "\n".join(
            f"select setval(pg_get_serial_sequence('public.{t}', 'id'), greatest((select max(id) from public.{t}), "
            f"(select last_value from {seq})));"
            for t, seq in [
                ("users", "public.users_id_seq"),
                ("employees", "public.employees_id_seq"),
                ("evaluations", "public.evaluations_id_seq"),
                ("evaluation_criteria", "public.evaluation_criteria_id_seq"),
                ("employee_notes", "public.employee_notes_id_seq"),
                ("job_descriptions", "public.job_descriptions_id_seq"),
            ]
        )
        + "\n"
    )
    parts.append("commit;\n")

    sql = "\n".join(parts)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(sql, encoding="utf-8", newline="\n")
    print(f"Zapisano {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
