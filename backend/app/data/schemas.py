"""
Modele odpowiedzi i żądań tras danych. Nazwy i wartości pól są takie same jak w
frontend/src/types/index.ts (frontend nie potrzebuje adapterów dla tych tras).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SerializationInfo, SerializerFunctionWrapHandler, model_serializer

UserRole = Literal["supervisor", "hr"]
# replacement = umowa w celu zastępstwa nieobecnego członka korpusu (art. 37 ust. 2 ustawy o służbie cywilnej)
ContractType = Literal["fixed_term_first", "indefinite", "appointment", "replacement"]
AssessmentKind = Literal["first", "periodic"]
EmployeeForm = Literal["B", "C", "first"]
AssessmentForm = Literal["B", "C"]
AssessmentResult = Literal["positive", "negative"]
EmployeeStatus = Literal[
    "awaiting_first_assessment",
    "assessment_in_progress",
    "assessment_due_soon",
    "assessment_overdue",
    "up_to_date",
]
AssessmentStatus = Literal["not_started", "draft", "awaiting_interview", "completed", "overdue"]
# Status przechowywany; "overdue" wylicza się z terminu, nie zapisuje.
StoredAssessmentStatus = Literal["not_started", "draft", "awaiting_interview", "completed"]
# Pierwsza ocena: egzamin ze służby przygotowawczej. exempt = wyjątek z § 10 ust. 3 rozporządzenia
# z 2015 r. (w silniku NIE_DOTYCZY), passed = TAK, failed = NIE.
ExamStatus = Literal["passed", "exempt", "failed"]
# Pola tylko pierwszej oceny (dev_maks): w odpowiedziach ocen okresowych ich nie ma.
FIRST_EVAL_FIELDS = ("exam_status", "report_on_time", "initial_interview_date", "evaluation_interview_date")
# Wnioski dotyczące indywidualnego programu rozwoju zawodowego (arkusze B i C, § 11 pkt 5 rozporządzenia
# z 2016 r.) albo wnioski dotyczące rozwoju zawodowego ocenianego (pierwsza ocena). Opcjonalne.
DEVELOPMENT_CONCLUSIONS_MAX_LENGTH = 2000


class User(BaseModel):
    id: str
    role: UserRole
    first_name: str
    last_name: str
    job_title: str
    organizational_unit: str


class Employee(BaseModel):
    id: str
    supervisor_id: str
    first_name: str
    last_name: str
    position_title: str
    organizational_unit: str
    hire_date: date
    contract_type: ContractType
    contract_end_date: date | None
    first_eval_agreement_date: date | None = None
    assessment_kind: AssessmentKind
    form: EmployeeForm | None
    last_assessment_date: date | None
    last_assessment_result: AssessmentResult | None
    next_assessment_due: date | None
    status: EmployeeStatus


class EmployeeMonitoring(BaseModel):
    """
    Widok pracownika dla kadr (minimalizacja danych): tylko to, co potrzebne do monitorowania terminów
    i statusów – pracownik, komórka, przełożony, rodzaj oceny, status, terminy i wynik końcowy.
    Bez stanowiska, umowy, arkusza, punktów, uzasadnień, notatek i opisów stanowiska.
    """

    id: str
    supervisor_id: str
    supervisor_name: str
    first_name: str
    last_name: str
    organizational_unit: str
    assessment_kind: AssessmentKind
    contract_end_date: date | None
    last_assessment_date: date | None
    last_assessment_result: AssessmentResult | None
    next_assessment_due: date | None
    status: EmployeeStatus


class CreateEmployeeInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    hire_date: date
    contract_type: ContractType
    contract_end_date: date | None = None
    # Zastępstwo: dzień porozumienia pracownika i dyrektora generalnego o pierwszej ocenie
    # (od niego biegną terminy pierwszej oceny – poradnik KPRM „Pierwsza ocena”, pkt 4.2)
    first_eval_agreement_date: date | None = None
    assessment_kind: AssessmentKind
    form: EmployeeForm
    position_title: str = Field(..., min_length=1)
    organizational_unit: str | None = None


class ContractExtensionInput(BaseModel):
    """Przedłużenie umowy o czas usprawiedliwionej nieobecności > 3 mies. (art. 35 ust. 4 ustawy)."""

    model_config = ConfigDict(extra="ignore")

    new_end_date: date
    absence_days: int = Field(..., ge=91, description="Łączna usprawiedliwiona nieobecność w dniach (> 3 miesięcy)")


CalendarEventKind = Literal[
    "first_interview",
    "report_window",
    "first_due",
    "contract_end",
    "criteria_meeting",
    "periodic_due",
    "objection_deadline",
]
CalendarSeverity = Literal["overdue", "soon", "upcoming", "past", "done"]


class CalendarEvent(BaseModel):
    """Termin w kalendarzu ocen (wyliczony z umowy, ocen i przepisów; nie jest zapisywany)."""

    id: str
    date: date
    kind: CalendarEventKind
    title: str
    description: str
    legal_basis: str
    employee_id: str
    employee_name: str
    supervisor_id: str
    supervisor_name: str
    severity: CalendarSeverity


class Note(BaseModel):
    id: str
    employee_id: str
    created_at: datetime
    text: str


class AddNoteInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class AdditionalCriterion(BaseModel):
    criterion_id: str
    name: str
    rationale: str


class OspAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    filename: str
    position_title: str
    organizational_unit: str | None = None
    has_management_duties: bool
    subordinates_count: int | None = None
    suggested_form: AssessmentForm
    additional_criteria: list[AdditionalCriterion] = Field(default_factory=list)


class JobDescriptionDocument(BaseModel):
    id: str
    employee_id: str
    filename: str
    uploaded_at: datetime
    version: int
    analysis: OspAnalysis | None


class StarNote(BaseModel):
    situation: str = ""
    action: str = ""
    result: str = ""


class IndicatorAnswer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    competency_id: str
    indicator_id: str
    # null = brak podstaw do oceny; dozwolone 1/3/5/7/9 sprawdza warstwa usług (komunikat po polsku)
    selected_level: int | None = None
    star_note: StarNote | None = None


class CriterionDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")

    competency_id: str
    is_mandatory: bool
    selected_level: int | None = None
    decision_note: str = ""


class AssessmentEvaluation(BaseModel):
    mean: float
    overall_level: str | None
    result: AssessmentResult
    reasons: list[str]
    justification_required: bool
    development_criteria: list[str]
    errors: list[str]
    warnings: list[str]


class AssessmentSummary(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    supervisor_name: str
    kind: AssessmentKind
    form: EmployeeForm
    status: AssessmentStatus
    started_at: datetime | None
    completed_at: datetime | None
    due_date: date
    result: AssessmentResult | None


class AssessmentDetail(AssessmentSummary):
    additional_competency_ids: list[str] | None
    answers: list[IndicatorAnswer]
    decisions: list[CriterionDecision]
    justification_draft: str
    last_step: str | None
    updated_at: datetime | None
    evaluation: AssessmentEvaluation | None
    development_conclusions: str | None = None
    # Tylko pierwsza ocena (opcjonalne; dla arkuszy B i C pomijane w odpowiedzi).
    exam_status: ExamStatus | None = None
    report_on_time: bool | None = None
    initial_interview_date: date | None = None
    evaluation_interview_date: date | None = None

    @model_serializer(mode="wrap")
    def _drop_first_eval_fields(self, handler: SerializerFunctionWrapHandler, info: SerializationInfo) -> Any:
        data = handler(self)
        if self.form != "first" and isinstance(data, dict):
            for key in FIRST_EVAL_FIELDS:
                data.pop(key, None)
        return data


class CreateAssessmentInput(BaseModel):
    employee_id: str
    kind: AssessmentKind


class AssessmentDraftInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    form: AssessmentForm | Literal["first"]
    additional_competency_ids: list[str] | None = None
    answers: list[IndicatorAnswer] = Field(default_factory=list)
    decisions: list[CriterionDecision] = Field(default_factory=list)
    justification_draft: str = ""
    last_step: str | None = None
    development_conclusions: str | None = Field(default=None, max_length=DEVELOPMENT_CONCLUSIONS_MAX_LENGTH)
    # Tylko pierwsza ocena (opcjonalne, ignorowane dla arkuszy B i C).
    exam_status: ExamStatus | None = None
    report_on_time: bool | None = None
    initial_interview_date: date | None = None
    evaluation_interview_date: date | None = None


class CalculateScoreInput(BaseModel):
    answers: list[IndicatorAnswer]


class ScoreResult(BaseModel):
    mean: float | None
    suggested_level: int | None
    counted_indicators: int


# --------------------------------------------------------------------------
# Rekordy przechowywane w repozytoriach (bez pól wyliczanych przez usługę)
# --------------------------------------------------------------------------


class EmployeeRecord(BaseModel):
    id: str
    supervisor_id: str
    first_name: str
    last_name: str
    position_title: str
    organizational_unit: str
    hire_date: date
    contract_type: ContractType
    contract_end_date: date | None = None
    # Zastępstwo: dzień porozumienia pracownika i dyrektora generalnego o pierwszej ocenie
    # (od niego biegną terminy pierwszej oceny – poradnik KPRM „Pierwsza ocena”, pkt 4.2)
    first_eval_agreement_date: date | None = None
    assessment_kind: AssessmentKind
    form: EmployeeForm | None = None


class NewEmployee(BaseModel):
    supervisor_id: str
    first_name: str
    last_name: str
    position_title: str
    organizational_unit: str
    hire_date: date
    contract_type: ContractType
    contract_end_date: date | None = None
    # Zastępstwo: dzień porozumienia pracownika i dyrektora generalnego o pierwszej ocenie
    # (od niego biegną terminy pierwszej oceny – poradnik KPRM „Pierwsza ocena”, pkt 4.2)
    first_eval_agreement_date: date | None = None
    assessment_kind: AssessmentKind
    form: EmployeeForm | None = None


class AssessmentRecord(BaseModel):
    id: str
    employee_id: str
    kind: AssessmentKind
    form: EmployeeForm
    status: StoredAssessmentStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None
    due_date: date
    result: AssessmentResult | None = None
    additional_competency_ids: list[str] | None = None
    answers: list[IndicatorAnswer] = Field(default_factory=list)
    decisions: list[CriterionDecision] = Field(default_factory=list)
    justification_draft: str = ""
    last_step: str | None = None
    updated_at: datetime | None = None
    # Wskazówka poziomu dla kryterium (Supabase: evaluation_criteria.suggested_score); nie trafia do API.
    suggested_levels: dict[str, int | None] = Field(default_factory=dict)
    # Wynik zapisany przy zakończeniu (Supabase: average_score, overall_level); nie trafia do API.
    stored_mean: float | None = None
    stored_overall_level: str | None = None
    # Supabase/Postgres: evaluations.development_conclusions (skrypt 004, zapis osłonięty).
    development_conclusions: str | None = None
    # Pierwsza ocena (Supabase/Postgres: exam_passed, report_on_time, initial_talk_date;
    # evaluation_interview_date nie ma kolumny – trwale tylko w pamięci).
    exam_status: ExamStatus | None = None
    report_on_time: bool | None = None
    initial_interview_date: date | None = None
    evaluation_interview_date: date | None = None


class NewAssessment(BaseModel):
    employee_id: str
    supervisor_id: str
    kind: AssessmentKind
    form: EmployeeForm
    status: StoredAssessmentStatus
    started_at: datetime | None
    due_date: date


# --------------------------------------------------------------------------
# Przypomnienia od kadr dla przełożonych (etap 6)
# --------------------------------------------------------------------------

REMINDER_MAX_LENGTH = 1000


class CreateReminderInput(BaseModel):
    """Długość i pustą treść sprawdza warstwa usług (komunikaty po polsku)."""

    model_config = ConfigDict(extra="ignore")

    supervisor_id: str
    employee_ids: list[str] = Field(default_factory=list)
    message: str


class Reminder(BaseModel):
    """Przypomnienie w odpowiedzi API (nazwiska dołącza usługa przy odczycie)."""

    id: str
    created_at: datetime
    author_id: str | None
    author_name: str
    supervisor_id: str
    supervisor_name: str
    employee_ids: list[str]
    employee_names: list[str]
    message: str


class NewReminder(BaseModel):
    author_id: str
    supervisor_id: str
    employee_ids: list[str]
    message: str
    created_at: datetime


class ReminderRecord(NewReminder):
    id: str
    author_id: str | None  # type: ignore[assignment]


JsonDict = dict[str, Any]
