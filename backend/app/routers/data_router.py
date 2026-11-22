"""
Trasy danych dla frontendu (pracownicy, notatki, opisy stanowiska, oceny) oraz wskazówka poziomu.
Rejestrowane pod /api/v1 (app.main). Kształty JSON = frontend/src/types/index.ts.

Użytkownik: nagłówek X-User-Id (logowanie demonstracyjne). Przełożony widzi tylko swoich
pracowników (403 przy cudzych), kadry widzą wszystkich, ale niczego nie zmieniają.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError

from app.data.factory import get_data_service
from app.data.schemas import (
    AddNoteInput,
    AssessmentDetail,
    AssessmentDraftInput,
    AssessmentSummary,
    CalendarEvent,
    CalculateScoreInput,
    CreateAssessmentInput,
    ContractExtensionInput,
    CreateEmployeeInput,
    Employee,
    JobDescriptionDocument,
    Note,
    OspAnalysis,
    ScoreResult,
    User,
)
from app.data.service import DataService, ServiceError, calculate_score

data_router = APIRouter(tags=["Dane: pracownicy i oceny"])

Service = Annotated[DataService, Depends(get_data_service)]
UserIdHeader = Annotated[str | None, Header(alias="X-User-Id")]


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


def current_user(service: Service, x_user_id: UserIdHeader = None) -> User:
    return _call(service.current_user, x_user_id)


CurrentUser = Annotated[User, Depends(current_user)]


# --- wskazówka poziomu ---------------------------------------------------------------------


@data_router.post("/calculate-score", response_model=ScoreResult, tags=["Silnik Oceniania"])
def calculate_score_endpoint(payload: CalculateScoreInput) -> ScoreResult:
    """Średnia ze wskaźników jednego kryterium i sugerowany poziom (tylko wskazówka dla przełożonego)."""
    return _call(calculate_score, payload.answers)


# --- użytkownicy ---------------------------------------------------------------------------


@data_router.get("/auth/demo-users", response_model=list[User])
def list_demo_users(service: Service) -> list[User]:
    """Konta do logowania demonstracyjnego (wybór roli, bez hasła)."""
    return service.list_demo_users()


@data_router.get("/users/{user_id}", response_model=User)
def get_user(user_id: str, service: Service) -> User:
    return _call(service.get_user, user_id)


# --- pracownicy ----------------------------------------------------------------------------


@data_router.get("/employees", response_model=list[Employee])
def list_employees(service: Service, user: CurrentUser) -> list[Employee]:
    return service.list_employees(user)


@data_router.post("/employees", response_model=Employee, status_code=201)
def create_employee(payload: CreateEmployeeInput, service: Service, user: CurrentUser) -> Employee:
    return _call(service.create_employee, user, payload)


@data_router.get("/employees/{employee_id}", response_model=Employee)
def get_employee(employee_id: str, service: Service, user: CurrentUser) -> Employee:
    return _call(service.get_employee, user, employee_id)


@data_router.get("/calendar", response_model=list[CalendarEvent], tags=["Kalendarz terminów"])
def calendar(
    user: CurrentUser,
    service: Service,
    date_from: Annotated[date, Query(alias="from")],
    date_to: Annotated[date, Query(alias="to")],
) -> list[CalendarEvent]:
    """Terminy procesu ocen w zakresie dat: kadry – wszyscy pracownicy, przełożony – tylko swoi podwładni."""
    return _call(service.calendar, user, date_from, date_to)


@data_router.post("/employees/{employee_id}/contract-extension", response_model=Employee)
def extend_contract(employee_id: str, payload: ContractExtensionInput, user: CurrentUser, service: Service) -> Employee:
    """Przedłużenie umowy o czas usprawiedliwionej nieobecności > 3 mies. (art. 35 ust. 4); przesuwa terminy pierwszej oceny."""
    return _call(service.extend_contract, user, employee_id, payload.new_end_date, payload.absence_days)


@data_router.get("/employees/{employee_id}/notes", response_model=list[Note])
def list_notes(employee_id: str, service: Service, user: CurrentUser) -> list[Note]:
    return _call(service.list_notes, user, employee_id)


@data_router.post("/employees/{employee_id}/notes", response_model=Note, status_code=201)
def add_note(employee_id: str, payload: AddNoteInput, service: Service, user: CurrentUser) -> Note:
    return _call(service.add_note, user, employee_id, payload.text)


@data_router.get("/employees/{employee_id}/job-descriptions", response_model=list[JobDescriptionDocument])
def list_job_descriptions(employee_id: str, service: Service, user: CurrentUser) -> list[JobDescriptionDocument]:
    return _call(service.list_job_descriptions, user, employee_id)


@data_router.post("/employees/{employee_id}/job-descriptions", response_model=JobDescriptionDocument, status_code=201)
async def attach_job_description(
    employee_id: str,
    service: Service,
    user: CurrentUser,
    file: UploadFile = File(..., description="Plik opisu stanowiska pracy (.docx)"),
    confirmed_analysis: str | None = Form(default=None, description="Wynik analizy po potwierdzeniu (JSON OspAnalysis)"),
) -> JobDescriptionDocument:
    """Zapisuje nową wersję opisu stanowiska. Treść pliku nie jest przechowywana (tylko nazwa i analiza)."""
    analysis = None
    if confirmed_analysis:
        try:
            analysis = OspAnalysis.model_validate(json.loads(confirmed_analysis))
        except (ValueError, ValidationError) as error:
            raise HTTPException(status_code=422, detail=f"Nieprawidłowe pole confirmed_analysis: {error}") from error
    return _call(service.attach_job_description, user, employee_id, file.filename or "opis_stanowiska.docx", analysis)


# --- oceny ---------------------------------------------------------------------------------


@data_router.get("/assessments", response_model=list[AssessmentSummary])
def list_assessments(
    service: Service,
    user: CurrentUser,
    employee_id: str | None = Query(default=None),
    supervisor_id: str | None = Query(default=None),
    status: Literal["not_started", "draft", "awaiting_interview", "completed", "overdue"] | None = Query(default=None),
) -> list[AssessmentSummary]:
    return service.list_assessments(user, employee_id=employee_id, supervisor_id=supervisor_id, status=status)


@data_router.post("/assessments", response_model=AssessmentSummary, status_code=201)
def create_assessment_draft(payload: CreateAssessmentInput, service: Service, user: CurrentUser) -> AssessmentSummary:
    return _call(service.create_assessment_draft, user, payload)


@data_router.get("/assessments/{assessment_id}", response_model=AssessmentDetail)
def get_assessment(assessment_id: str, service: Service, user: CurrentUser) -> AssessmentDetail:
    return _call(service.get_assessment, user, assessment_id)


@data_router.put("/assessments/{assessment_id}/draft", response_model=AssessmentDetail)
def save_assessment_draft(
    assessment_id: str, payload: AssessmentDraftInput, service: Service, user: CurrentUser
) -> AssessmentDetail:
    return _call(service.save_assessment_draft, user, assessment_id, payload)


@data_router.post("/assessments/{assessment_id}/complete", response_model=AssessmentDetail)
def complete_assessment(
    assessment_id: str, payload: AssessmentDraftInput, service: Service, user: CurrentUser
) -> AssessmentDetail:
    return _call(service.complete_assessment, user, assessment_id, payload)


@data_router.get(
    "/assessments/{assessment_id}/pdf",
    responses={200: {"content": {"application/pdf": {}}, "description": "Arkusz oceny w formacie PDF (A4)."}},
)
def assessment_pdf(assessment_id: str, service: Service, user: CurrentUser) -> Response:
    """Arkusz oceny złożony z zapisanych danych (ten sam generator co POST /evaluations/pdf)."""
    pdf, filename = _call(service.assessment_pdf, user, assessment_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
