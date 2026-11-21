"""
Modele odpowiedzi i żądań tras danych. Nazwy i wartości pól są takie same jak w
frontend/src/types/index.ts (frontend nie potrzebuje adapterów dla tych tras).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

UserRole = Literal["supervisor", "hr"]
ContractType = Literal["fixed_term_first", "indefinite", "appointment"]
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
    assessment_kind: AssessmentKind
    form: EmployeeForm | None
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
    assessment_kind: AssessmentKind
    form: EmployeeForm
    position_title: str = Field(..., min_length=1)
    organizational_unit: str | None = None


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


class NewAssessment(BaseModel):
    employee_id: str
    supervisor_id: str
    kind: AssessmentKind
    form: EmployeeForm
    status: StoredAssessmentStatus
    started_at: datetime | None
    due_date: date


JsonDict = dict[str, Any]
