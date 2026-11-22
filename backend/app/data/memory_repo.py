from __future__ import annotations

import threading
import uuid
from datetime import datetime
from typing import Any

from app.data.repository import DataRepository, NotFoundError
from app.data.schemas import (
    AssessmentRecord,
    EmployeeRecord,
    JobDescriptionDocument,
    NewAssessment,
    NewEmployee,
    NewReminder,
    Note,
    OspAnalysis,
    ReminderRecord,
    User,
)
from app.data.seed_data import SeedData, build_seed


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


class MemoryRepository(DataRepository):
    """Dane w pamięci procesu, startowo z danymi przykładowymi; znikają po restarcie serwera."""

    def __init__(self, seed: SeedData | None = None) -> None:
        data = seed or build_seed()
        self._lock = threading.Lock()
        self._users = {u.id: u for u in data.users}
        self._employees = {e.id: e for e in data.employees}
        # Notatka + autor (Note z kontraktu nie ma pola autora)
        self._notes: list[tuple[Note, str]] = list(data.notes)
        self._job_descriptions = list(data.job_descriptions)
        self._assessments = {a.id: a for a in data.assessments}
        self._reminders: list[ReminderRecord] = []

    # Użytkownicy
    def list_users(self) -> list[User]:
        return [u.model_copy() for u in self._users.values()]

    def get_user(self, user_id: str) -> User | None:
        user = self._users.get(user_id)
        return user.model_copy() if user else None

    # Pracownicy
    def list_employees(self, supervisor_id: str | None = None) -> list[EmployeeRecord]:
        return [
            e.model_copy() for e in self._employees.values() if supervisor_id is None or e.supervisor_id == supervisor_id
        ]

    def get_employee(self, employee_id: str) -> EmployeeRecord | None:
        employee = self._employees.get(employee_id)
        return employee.model_copy() if employee else None

    def create_employee(self, data: NewEmployee) -> EmployeeRecord:
        with self._lock:
            record = EmployeeRecord(id=_new_id("emp"), **data.model_dump())
            self._employees[record.id] = record
            return record.model_copy()

    def update_employee(self, employee_id: str, changes: dict[str, Any]) -> EmployeeRecord:
        with self._lock:
            current = self._employees.get(employee_id)
            if current is None:
                raise NotFoundError(employee_id)
            updated = current.model_copy(update=changes)
            self._employees[employee_id] = updated
            return updated.model_copy()

    # Notatki
    def list_notes(self, employee_id: str, author_id: str) -> list[Note]:
        notes = [n for n, author in self._notes if n.employee_id == employee_id and author == author_id]
        return sorted((n.model_copy() for n in notes), key=lambda n: n.created_at, reverse=True)

    def add_note(self, employee_id: str, author_id: str, text: str, created_at: datetime) -> Note:
        with self._lock:
            note = Note(id=_new_id("note"), employee_id=employee_id, created_at=created_at, text=text)
            self._notes.append((note, author_id))
            return note.model_copy()

    # Opisy stanowiska
    def list_job_descriptions(self, employee_id: str) -> list[JobDescriptionDocument]:
        docs = [d for d in self._job_descriptions if d.employee_id == employee_id]
        return sorted((d.model_copy(deep=True) for d in docs), key=lambda d: d.version)

    def add_job_description(
        self, employee_id: str, filename: str, analysis: OspAnalysis | None, uploaded_at: datetime
    ) -> JobDescriptionDocument:
        with self._lock:
            version = 1 + max((d.version for d in self._job_descriptions if d.employee_id == employee_id), default=0)
            doc = JobDescriptionDocument(
                id=_new_id("jd"),
                employee_id=employee_id,
                filename=filename,
                uploaded_at=uploaded_at,
                version=version,
                analysis=analysis,
            )
            self._job_descriptions.append(doc)
            return doc.model_copy(deep=True)

    # Oceny
    def list_assessments(self, employee_ids: set[str] | None = None) -> list[AssessmentRecord]:
        return [
            a.model_copy(deep=True)
            for a in self._assessments.values()
            if employee_ids is None or a.employee_id in employee_ids
        ]

    def get_assessment(self, assessment_id: str) -> AssessmentRecord | None:
        record = self._assessments.get(assessment_id)
        return record.model_copy(deep=True) if record else None

    def create_assessment(self, data: NewAssessment) -> AssessmentRecord:
        with self._lock:
            fields = data.model_dump(exclude={"supervisor_id"})
            record = AssessmentRecord(id=_new_id("as"), **fields)
            self._assessments[record.id] = record
            return record.model_copy(deep=True)

    def save_assessment(self, record: AssessmentRecord) -> AssessmentRecord:
        with self._lock:
            if record.id not in self._assessments:
                raise NotFoundError(record.id)
            self._assessments[record.id] = record.model_copy(deep=True)
            return record.model_copy(deep=True)

    # Przypomnienia od kadr
    def list_reminders(self, supervisor_id: str | None = None) -> list[ReminderRecord]:
        return [
            r.model_copy(deep=True) for r in self._reminders if supervisor_id is None or r.supervisor_id == supervisor_id
        ]

    def add_reminder(self, data: NewReminder) -> ReminderRecord:
        with self._lock:
            record = ReminderRecord(id=_new_id("rem"), **data.model_dump())
            self._reminders.append(record)
            return record.model_copy(deep=True)
