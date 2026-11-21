"""
Repozytorium na istniejącej bazie Supabase (Postgres) przez REST API (PostgREST, /rest/v1).

Używane istniejące tabele (bez zmian w ich strukturze): users, employees, evaluations,
evaluation_criteria (suggested_score = wskazówka, approved_score = decyzja przełożonego).
Nowe tabele i kolumny z supabase/schema-additions.sql: evaluation_indicator_answers,
employee_notes, job_descriptions, employees.contract_end_date, evaluations.completed_at,
evaluations.started_at/updated_at/last_step, evaluation_criteria.decision_note.
Tabel competencies, behavioral_indicators, indicator_levels nie używamy: model kompetencji
pochodzi z GET /competencies. Założenie: evaluation_criteria.competency_id = id z tego modelu
(1–14, "C01" = 1).

Adaptery (baza → API):
- identyfikatory liczbowe ↔ tekst ("12" ↔ 12),
- users.role: PRZELOZONY → supervisor, HR_ADMIN → hr; full_name → first_name + last_name,
  position → job_title, department → organizational_unit,
- employees.eval_path: OKRESOWA → periodic, PIERWSZA → first,
- employees.sheet_type / evaluations.sheet_type: B → "B", C → "C", PIERWSZA → "first",
  A → brak arkusza (pracownik: form = null; oceny z arkuszem A są pomijane),
- employees.employment_type: CZAS_NIEOKRESLONY → indefinite, CZAS_OKRESLONY_12M → fixed_term_first,
  MIANOWANY_URZEDNIK → appointment,
- employees.unit (albo department, gdy unit puste) → organizational_unit, position → position_title,
- evaluations.status: ROBOCZA → draft, ZATWIERDZONA → completed, NIEROZPOCZETA → not_started,
- evaluations.final_result: POZYTYWNA/NEGATYWNA → positive/negative.
employees.status nie jest odczytywany: status pracownika wylicza usługa z terminów i ocen.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.data.repository import DataRepository, NotFoundError
from app.data.schemas import (
    AssessmentRecord,
    CriterionDecision,
    EmployeeRecord,
    IndicatorAnswer,
    JobDescriptionDocument,
    NewAssessment,
    NewEmployee,
    Note,
    OspAnalysis,
    StarNote,
    User,
)

ROLE_FROM_DB = {"PRZELOZONY": "supervisor", "HR_ADMIN": "hr"}

EVAL_PATH_FROM_DB = {"OKRESOWA": "periodic", "PIERWSZA": "first"}
EVAL_PATH_TO_DB = {v: k for k, v in EVAL_PATH_FROM_DB.items()}

SHEET_FROM_DB = {"B": "B", "C": "C", "PIERWSZA": "first"}  # "A" pomijamy
SHEET_TO_DB = {v: k for k, v in SHEET_FROM_DB.items()}

CONTRACT_FROM_DB = {
    "CZAS_NIEOKRESLONY": "indefinite",
    "CZAS_OKRESLONY_12M": "fixed_term_first",
    "MIANOWANY_URZEDNIK": "appointment",
}
CONTRACT_TO_DB = {v: k for k, v in CONTRACT_FROM_DB.items()}

EVAL_STATUS_FROM_DB = {"ROBOCZA": "draft", "ZATWIERDZONA": "completed", "NIEROZPOCZETA": "not_started"}
EVAL_STATUS_TO_DB = {"draft": "ROBOCZA", "completed": "ZATWIERDZONA", "not_started": "NIEROZPOCZETA", "awaiting_interview": "ROBOCZA"}

RESULT_FROM_DB = {"POZYTYWNA": "positive", "NEGATYWNA": "negative"}
RESULT_TO_DB = {v: k for k, v in RESULT_FROM_DB.items()}

# Status pracownika zapisywany przy dodaniu (kolumna wymagana; odczyt wylicza usługa)
EMPLOYEE_STATUS_ON_CREATE = {"first": "ROZMOWA_WSTEPNA", "periodic": "W_TRAKCIE_OBSERWACJI"}


def _int_id(value: str) -> int | None:
    return int(value) if value.isdigit() else None


def _competency_int(competency_id: str) -> int | None:
    digits = competency_id.lstrip("Cc")
    return int(digits) if digits.isdigit() else None


def _competency_str(value: int | None) -> str:
    return f"C{int(value):02d}" if value is not None else ""


def _in(ids: list[int]) -> str:
    return f"in.({','.join(str(i) for i in ids)})"


class SupabaseError(RuntimeError):
    pass


class SupabaseRepository(DataRepository):
    def __init__(self, url: str, key: str, timeout: float = 15.0, transport: httpx.BaseTransport | None = None) -> None:
        # transport: tylko dla testów (atrapa PostgREST bez połączenia z bazą)
        self._client = httpx.Client(
            base_url=f"{url.rstrip('/')}/rest/v1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=timeout,
            transport=transport,
        )

    # --- REST -----------------------------------------------------------------------------

    def _request(self, method: str, table: str, params: dict[str, str] | None = None, json: Any = None,
                 prefer: str | None = None) -> list[dict[str, Any]]:
        headers = {"Prefer": prefer} if prefer else {}
        response = self._client.request(method, f"/{table}", params=params, json=json, headers=headers)
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase {method} {table}: {response.status_code} {response.text}")
        if not response.content:
            return []
        data = response.json()
        return data if isinstance(data, list) else [data]

    def _select(self, table: str, **filters: str) -> list[dict[str, Any]]:
        return self._request("GET", table, params={"select": "*", **filters})

    def _insert(self, table: str, row: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self._request("POST", table, json=row, prefer="return=representation")

    def _update(self, table: str, row: dict[str, Any], **filters: str) -> list[dict[str, Any]]:
        return self._request("PATCH", table, params=filters, json=row, prefer="return=representation")

    def _delete(self, table: str, **filters: str) -> None:
        self._request("DELETE", table, params=filters)

    # --- użytkownicy ----------------------------------------------------------------------

    @staticmethod
    def _user(row: dict[str, Any]) -> User:
        first, _, last = (row.get("full_name") or "").strip().partition(" ")
        return User(
            id=str(row["id"]),
            role=ROLE_FROM_DB.get(row.get("role", ""), "supervisor"),  # type: ignore[arg-type]
            first_name=first,
            last_name=last,
            job_title=row.get("position") or "",
            organizational_unit=row.get("department") or "",
        )

    def list_users(self) -> list[User]:
        return [self._user(r) for r in self._select("users", order="id.asc")]

    def get_user(self, user_id: str) -> User | None:
        db_id = _int_id(user_id)
        rows = self._select("users", id=f"eq.{db_id}") if db_id is not None else []
        return self._user(rows[0]) if rows else None

    # --- pracownicy -----------------------------------------------------------------------

    @staticmethod
    def _employee(row: dict[str, Any]) -> EmployeeRecord:
        return EmployeeRecord(
            id=str(row["id"]),
            supervisor_id=str(row["supervisor_id"]) if row.get("supervisor_id") is not None else "",
            first_name=row["first_name"],
            last_name=row["last_name"],
            position_title=row.get("position") or "",
            organizational_unit=row.get("unit") or row.get("department") or "",
            hire_date=row["hire_date"],
            contract_type=CONTRACT_FROM_DB.get(row.get("employment_type", ""), "indefinite"),  # type: ignore[arg-type]
            contract_end_date=row.get("contract_end_date"),
            assessment_kind=EVAL_PATH_FROM_DB.get(row.get("eval_path", ""), "periodic"),  # type: ignore[arg-type]
            form=SHEET_FROM_DB.get(row.get("sheet_type", "")),  # type: ignore[arg-type]
        )

    def list_employees(self, supervisor_id: str | None = None) -> list[EmployeeRecord]:
        if supervisor_id is None:
            rows = self._select("employees", order="id.asc")
        else:
            db_id = _int_id(supervisor_id)
            rows = self._select("employees", supervisor_id=f"eq.{db_id}", order="id.asc") if db_id is not None else []
        return [self._employee(r) for r in rows]

    def get_employee(self, employee_id: str) -> EmployeeRecord | None:
        db_id = _int_id(employee_id)
        rows = self._select("employees", id=f"eq.{db_id}") if db_id is not None else []
        return self._employee(rows[0]) if rows else None

    def create_employee(self, data: NewEmployee) -> EmployeeRecord:
        supervisor = self.get_user(data.supervisor_id)
        row = {
            "first_name": data.first_name,
            "last_name": data.last_name,
            "department": supervisor.organizational_unit if supervisor and supervisor.organizational_unit else data.organizational_unit,
            "unit": data.organizational_unit,
            "position": data.position_title,
            "employment_type": CONTRACT_TO_DB[data.contract_type],
            "hire_date": data.hire_date.isoformat(),
            "contract_end_date": data.contract_end_date.isoformat() if data.contract_end_date else None,
            "eval_path": EVAL_PATH_TO_DB[data.assessment_kind],
            # Kolumna wymagana; ocena okresowa bez potwierdzonego opisu stanowiska dostaje tymczasowo C.
            "sheet_type": SHEET_TO_DB.get(data.form or "", "C"),
            "status": EMPLOYEE_STATUS_ON_CREATE[data.assessment_kind],
            "supervisor_id": _int_id(data.supervisor_id),
        }
        return self._employee(self._insert("employees", row)[0])

    def update_employee(self, employee_id: str, changes: dict[str, Any]) -> EmployeeRecord:
        db_id = _int_id(employee_id)
        row: dict[str, Any] = {}
        if "form" in changes and changes["form"] in SHEET_TO_DB:
            row["sheet_type"] = SHEET_TO_DB[changes["form"]]
        if "position_title" in changes:
            row["position"] = changes["position_title"]
        if "organizational_unit" in changes:
            row["unit"] = changes["organizational_unit"]
        if db_id is None:
            raise NotFoundError(employee_id)
        rows = self._update("employees", row, id=f"eq.{db_id}") if row else self._select("employees", id=f"eq.{db_id}")
        if not rows:
            raise NotFoundError(employee_id)
        return self._employee(rows[0])

    # --- notatki (tabela employee_notes) ----------------------------------------------------

    @staticmethod
    def _note(row: dict[str, Any]) -> Note:
        return Note(id=str(row["id"]), employee_id=str(row["employee_id"]), created_at=row["created_at"], text=row["text"])

    def list_notes(self, employee_id: str, author_id: str) -> list[Note]:
        emp, author = _int_id(employee_id), _int_id(author_id)
        if emp is None or author is None:
            return []
        rows = self._select("employee_notes", employee_id=f"eq.{emp}", author_id=f"eq.{author}", order="created_at.desc")
        return [self._note(r) for r in rows]

    def add_note(self, employee_id: str, author_id: str, text: str, created_at: datetime) -> Note:
        row = {
            "employee_id": _int_id(employee_id),
            "author_id": _int_id(author_id),
            "text": text,
            "created_at": created_at.isoformat(),
        }
        return self._note(self._insert("employee_notes", row)[0])

    # --- opisy stanowiska (tabela job_descriptions) -----------------------------------------

    @staticmethod
    def _job_description(row: dict[str, Any]) -> JobDescriptionDocument:
        analysis = row.get("analysis")
        return JobDescriptionDocument(
            id=str(row["id"]),
            employee_id=str(row["employee_id"]),
            filename=row["filename"],
            uploaded_at=row["uploaded_at"],
            version=row["version"],
            analysis=OspAnalysis.model_validate(analysis) if analysis else None,
        )

    def list_job_descriptions(self, employee_id: str) -> list[JobDescriptionDocument]:
        emp = _int_id(employee_id)
        if emp is None:
            return []
        return [self._job_description(r) for r in self._select("job_descriptions", employee_id=f"eq.{emp}", order="version.asc")]

    def add_job_description(
        self, employee_id: str, filename: str, analysis: OspAnalysis | None, uploaded_at: datetime
    ) -> JobDescriptionDocument:
        emp = _int_id(employee_id)
        existing = self._select("job_descriptions", employee_id=f"eq.{emp}", order="version.desc", limit="1")
        row = {
            "employee_id": emp,
            "filename": filename,
            "version": (existing[0]["version"] + 1) if existing else 1,
            "analysis": analysis.model_dump() if analysis else None,
            "uploaded_at": uploaded_at.isoformat(),
        }
        return self._job_description(self._insert("job_descriptions", row)[0])

    # --- oceny ----------------------------------------------------------------------------

    def _assessments(self, rows: list[dict[str, Any]]) -> list[AssessmentRecord]:
        rows = [r for r in rows if r.get("sheet_type") in SHEET_FROM_DB and r.get("employee_id") is not None]
        if not rows:
            return []
        ids = [r["id"] for r in rows]
        criteria: dict[int, list[dict[str, Any]]] = {}
        for c in self._select("evaluation_criteria", evaluation_id=_in(ids), order="id.asc"):
            criteria.setdefault(c["evaluation_id"], []).append(c)
        answers: dict[int, list[dict[str, Any]]] = {}
        for a in self._select("evaluation_indicator_answers", evaluation_id=_in(ids), order="indicator_id.asc"):
            answers.setdefault(a["evaluation_id"], []).append(a)
        return [self._assessment(r, criteria.get(r["id"], []), answers.get(r["id"], [])) for r in rows]

    @staticmethod
    def _assessment(row: dict[str, Any], criteria: list[dict[str, Any]], answers: list[dict[str, Any]]) -> AssessmentRecord:
        decisions = [
            CriterionDecision(
                competency_id=_competency_str(c.get("competency_id")),
                is_mandatory=bool(c.get("is_mandatory", True)),
                selected_level=c.get("approved_score"),
                decision_note=c.get("decision_note") or "",
            )
            for c in criteria
            if c.get("competency_id") is not None
        ]
        return AssessmentRecord(
            id=str(row["id"]),
            employee_id=str(row["employee_id"]),
            kind=EVAL_PATH_FROM_DB.get(row.get("eval_path", ""), "periodic"),  # type: ignore[arg-type]
            form=SHEET_FROM_DB[row["sheet_type"]],  # type: ignore[arg-type]
            status=EVAL_STATUS_FROM_DB.get(row.get("status", ""), "draft"),  # type: ignore[arg-type]
            started_at=row.get("started_at"),
            completed_at=row.get("completed_at"),
            due_date=row["due_date"],
            result=RESULT_FROM_DB.get(row.get("final_result") or ""),  # type: ignore[arg-type]
            additional_competency_ids=[d.competency_id for d in decisions if not d.is_mandatory] if decisions else None,
            answers=[
                IndicatorAnswer(
                    competency_id=a["indicator_id"].split("_")[0],
                    indicator_id=a["indicator_id"],
                    selected_level=a.get("selected_level"),
                    star_note=StarNote.model_validate(a["star_note"]) if a.get("star_note") else None,
                )
                for a in answers
            ],
            decisions=decisions,
            justification_draft=row.get("justification") or "",
            last_step=row.get("last_step"),
            updated_at=row.get("updated_at"),
            suggested_levels={_competency_str(c["competency_id"]): c.get("suggested_score") for c in criteria if c.get("competency_id")},
            stored_mean=float(row["average_score"]) if row.get("average_score") is not None else None,
            stored_overall_level=row.get("overall_level"),
        )

    def list_assessments(self, employee_ids: set[str] | None = None) -> list[AssessmentRecord]:
        if employee_ids is None:
            return self._assessments(self._select("evaluations", order="due_date.asc"))
        ids = [i for i in (_int_id(e) for e in employee_ids) if i is not None]
        if not ids:
            return []
        return self._assessments(self._select("evaluations", employee_id=_in(ids), order="due_date.asc"))

    def get_assessment(self, assessment_id: str) -> AssessmentRecord | None:
        db_id = _int_id(assessment_id)
        records = self._assessments(self._select("evaluations", id=f"eq.{db_id}")) if db_id is not None else []
        return records[0] if records else None

    def create_assessment(self, data: NewAssessment) -> AssessmentRecord:
        row = {
            "employee_id": _int_id(data.employee_id),
            "supervisor_id": _int_id(data.supervisor_id),
            "eval_path": EVAL_PATH_TO_DB[data.kind],
            "sheet_type": SHEET_TO_DB[data.form],
            "status": EVAL_STATUS_TO_DB[data.status],
            "due_date": data.due_date.isoformat(),
            "started_at": data.started_at.isoformat() if data.started_at else None,
        }
        return self._assessment(self._insert("evaluations", row)[0], [], [])

    def save_assessment(self, record: AssessmentRecord) -> AssessmentRecord:
        db_id = _int_id(record.id)
        if db_id is None:
            raise NotFoundError(record.id)
        iso = lambda v: v.isoformat() if v else None  # noqa: E731
        rows = self._update(
            "evaluations",
            {
                "sheet_type": SHEET_TO_DB[record.form],
                "status": EVAL_STATUS_TO_DB[record.status],
                "due_date": record.due_date.isoformat(),
                "started_at": iso(record.started_at),
                "completed_at": iso(record.completed_at),
                "updated_at": iso(record.updated_at),
                "last_step": record.last_step,
                "justification": record.justification_draft or None,
                "final_result": RESULT_TO_DB.get(record.result or ""),
                "average_score": record.stored_mean,
                "overall_level": record.stored_overall_level,
            },
            id=f"eq.{db_id}",
        )
        if not rows:
            raise NotFoundError(record.id)
        self._sync_criteria(db_id, record)
        self._sync_answers(db_id, record)
        saved = self.get_assessment(record.id)
        assert saved is not None
        return saved

    def _sync_criteria(self, evaluation_id: int, record: AssessmentRecord) -> None:
        """Wiersze evaluation_criteria: decyzje + wybrane kryteria dodatkowe bez decyzji."""
        target: dict[int, dict[str, Any]] = {}
        for d in record.decisions:
            cid = _competency_int(d.competency_id)
            if cid is not None:
                target[cid] = {"is_mandatory": d.is_mandatory, "approved_score": d.selected_level, "decision_note": d.decision_note or None}
        for competency_id in record.additional_competency_ids or []:
            cid = _competency_int(competency_id)
            if cid is not None and cid not in target:
                target[cid] = {"is_mandatory": False, "approved_score": None, "decision_note": None}
        for cid, fields in target.items():
            fields["suggested_score"] = record.suggested_levels.get(_competency_str(cid))

        existing = {c["competency_id"]: c for c in self._select("evaluation_criteria", evaluation_id=f"eq.{evaluation_id}")}
        for cid, fields in target.items():
            if cid in existing:
                self._update("evaluation_criteria", fields, id=f"eq.{existing[cid]['id']}")
            else:
                self._insert("evaluation_criteria", {"evaluation_id": evaluation_id, "competency_id": cid, **fields})
        removed = [c["id"] for cid, c in existing.items() if cid not in target]
        if removed:
            self._delete("evaluation_criteria", id=_in(removed))

    def _sync_answers(self, evaluation_id: int, record: AssessmentRecord) -> None:
        rows = [
            {
                "evaluation_id": evaluation_id,
                "indicator_id": a.indicator_id,
                "selected_level": a.selected_level,
                "star_note": a.star_note.model_dump() if a.star_note else None,
            }
            for a in record.answers
        ]
        if rows:
            self._request(
                "POST",
                "evaluation_indicator_answers",
                params={"on_conflict": "evaluation_id,indicator_id"},
                json=rows,
                prefer="resolution=merge-duplicates,return=minimal",
            )
        keep = [a.indicator_id for a in record.answers]
        filters = {"evaluation_id": f"eq.{evaluation_id}"}
        if keep:
            filters["indicator_id"] = f"not.in.({','.join(keep)})"
        self._delete("evaluation_indicator_answers", **filters)
