from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

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


class NotFoundError(LookupError):
    """Brak rekordu o podanym identyfikatorze."""


class StorageError(RuntimeError):
    """Awaria zapisu lub odczytu w magazynie danych (np. brak tabeli w bazie); komunikat jest w logu."""


class DataRepository(ABC):
    """
    Magazyn danych. Operuje na rekordach w kształcie frontendu (identyfikatory tekstowe,
    wartości po angielsku); tłumaczenie na kolumny bazy robi konkretna implementacja.
    Reguły dostępu, statusy i terminy wylicza app.data.service, nie repozytorium.
    """

    # Użytkownicy
    @abstractmethod
    def list_users(self) -> list[User]: ...

    @abstractmethod
    def get_user(self, user_id: str) -> User | None: ...

    # Pracownicy
    @abstractmethod
    def list_employees(self, supervisor_id: str | None = None) -> list[EmployeeRecord]: ...

    @abstractmethod
    def get_employee(self, employee_id: str) -> EmployeeRecord | None: ...

    @abstractmethod
    def create_employee(self, data: NewEmployee) -> EmployeeRecord: ...

    @abstractmethod
    def update_employee(self, employee_id: str, changes: dict[str, Any]) -> EmployeeRecord:
        """changes: pola EmployeeRecord (np. form, position_title)."""

    # Notatki (widzi je tylko autor)
    @abstractmethod
    def list_notes(self, employee_id: str, author_id: str) -> list[Note]: ...

    @abstractmethod
    def add_note(self, employee_id: str, author_id: str, text: str, created_at: datetime) -> Note: ...

    # Opisy stanowiska
    @abstractmethod
    def list_job_descriptions(self, employee_id: str) -> list[JobDescriptionDocument]: ...

    @abstractmethod
    def add_job_description(
        self, employee_id: str, filename: str, analysis: OspAnalysis | None, uploaded_at: datetime
    ) -> JobDescriptionDocument: ...

    # Oceny
    @abstractmethod
    def list_assessments(self, employee_ids: set[str] | None = None) -> list[AssessmentRecord]:
        """employee_ids=None: wszystkie oceny (kadry)."""

    @abstractmethod
    def get_assessment(self, assessment_id: str) -> AssessmentRecord | None: ...

    @abstractmethod
    def create_assessment(self, data: NewAssessment) -> AssessmentRecord: ...

    @abstractmethod
    def save_assessment(self, record: AssessmentRecord) -> AssessmentRecord:
        """Zapisuje cały rekord oceny (status, treść szkicu, wynik)."""

    # Przypomnienia od kadr (etap 6)
    @abstractmethod
    def list_reminders(self, supervisor_id: str | None = None) -> list[ReminderRecord]:
        """supervisor_id=None: wszystkie (kadry). Kolejność dowolna – sortuje usługa."""

    @abstractmethod
    def add_reminder(self, data: NewReminder) -> ReminderRecord: ...
