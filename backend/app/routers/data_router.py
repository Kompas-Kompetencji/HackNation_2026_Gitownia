"""
Trasy danych dla frontendu (pracownicy, notatki, opisy stanowiska, oceny) oraz wskazówka poziomu.
Rejestrowane pod /api/v1 (app.main). Kształty JSON = frontend/src/types/index.ts.

Użytkownik: nagłówek X-User-Id (logowanie demonstracyjne). Przełożony widzi tylko swoich
pracowników (403 przy cudzych), kadry widzą wszystkich, ale niczego nie zmieniają i nie widzą treści
ocen, notatek ani opisów stanowiska (403); dane pracowników dla kadr to tylko pola do monitorowania.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings as app_settings
from app.core.security import TokenError, create_access_token, decode_access_token
from app.data.factory import get_data_service
from app.data.schemas import (
    AuditEntry,
    AddNoteInput,
    AssessmentDetail,
    AssessmentDraftInput,
    AssessmentSummary,
    CalendarEvent,
    CalculateScoreInput,
    CreateAssessmentInput,
    ContractExtensionInput,
    CreateEmployeeInput,
    CreateReminderInput,
    Employee,
    EmployeeMonitoring,
    JobDescriptionDocument,
    Note,
    OspAnalysis,
    Reminder,
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


def current_user(
    service: Service,
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: UserIdHeader = None,
) -> User:
    """Użytkownik z tokenu `Authorization: Bearer …` (JWT). X-User-Id tylko przy AUTH_ALLOW_DEMO_HEADER=true."""
    if authorization and authorization.lower().startswith("bearer "):
        try:
            claims = decode_access_token(authorization[7:].strip())
        except TokenError as error:
            raise HTTPException(status_code=401, detail=str(error)) from error
        return _call(service.current_user, claims["sub"])
    if x_user_id and app_settings.AUTH_ALLOW_DEMO_HEADER:
        return _call(service.current_user, x_user_id)
    raise HTTPException(status_code=401, detail="Wymagane logowanie (brak tokenu dostępu).")


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


class LoginInput(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)


class LoginOutput(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: User


@data_router.post("/auth/login", response_model=LoginOutput)
def login(payload: LoginInput, service: Service) -> LoginOutput:
    """Logowanie demonstracyjne: wybór konta → podpisany token JWT (docelowo: SSO / Entra ID urzędu)."""
    user = _call(service.current_user, payload.user_id)
    token, ttl = create_access_token(user.id, user.role)
    service.audit(user, "login", "user", user.id)
    return LoginOutput(access_token=token, expires_in=ttl, user=user)


@data_router.get("/auth/me", response_model=User)
def me(user: CurrentUser) -> User:
    return user


@data_router.get("/users/{user_id}", response_model=User)
def get_user(user_id: str, service: Service, user: CurrentUser) -> User:
    """Dane konta: własne albo (kadry) dowolnego użytkownika."""
    if user.role != "hr" and user.id != user_id:
        raise HTTPException(status_code=403, detail="Brak dostępu do danych innego użytkownika.")
    return _call(service.get_user, user_id)


# --- pracownicy ----------------------------------------------------------------------------


# Kadry dostają okrojony widok (EmployeeMonitoring), przełożony pełny (Employee).
@data_router.get("/employees", response_model=list[Employee] | list[EmployeeMonitoring])
def list_employees(service: Service, user: CurrentUser) -> list[Employee] | list[EmployeeMonitoring]:
    return service.list_employees(user)


@data_router.post("/employees", response_model=Employee, status_code=201)
def create_employee(payload: CreateEmployeeInput, service: Service, user: CurrentUser) -> Employee:
    employee = _call(service.create_employee, user, payload)
    service.audit(user, "employee.created", "employee", employee.id, f"umowa: {employee.contract_type}")
    return employee


@data_router.get("/employees/{employee_id}", response_model=Employee | EmployeeMonitoring)
def get_employee(employee_id: str, service: Service, user: CurrentUser) -> Employee | EmployeeMonitoring:
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
    employee = _call(service.extend_contract, user, employee_id, payload.new_end_date, payload.absence_days)
    service.audit(user, "employee.contract_extended", "employee", employee_id, f"do {payload.new_end_date.isoformat()}")
    return employee


@data_router.get("/employees/{employee_id}/notes", response_model=list[Note])
def list_notes(employee_id: str, service: Service, user: CurrentUser) -> list[Note]:
    return _call(service.list_notes, user, employee_id)


@data_router.post("/employees/{employee_id}/notes", response_model=Note, status_code=201)
def add_note(employee_id: str, payload: AddNoteInput, service: Service, user: CurrentUser) -> Note:
    note = _call(service.add_note, user, employee_id, payload.text)
    service.audit(user, "note.added", "employee", employee_id)
    return note


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
    doc = _call(service.attach_job_description, user, employee_id, file.filename or "opis_stanowiska.docx", analysis)
    service.audit(user, "job_description.attached", "employee", employee_id, f"wersja {doc.version}")
    return doc


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
    summary = _call(service.create_assessment_draft, user, payload)
    service.audit(user, "assessment.started", "assessment", summary.id)
    return summary


@data_router.get("/assessments/{assessment_id}", response_model=AssessmentDetail)
def get_assessment(assessment_id: str, service: Service, user: CurrentUser) -> AssessmentDetail:
    detail = _call(service.get_assessment, user, assessment_id)
    service.audit(user, "assessment.viewed", "assessment", assessment_id)
    return detail


@data_router.put("/assessments/{assessment_id}/draft", response_model=AssessmentDetail)
def save_assessment_draft(
    assessment_id: str, payload: AssessmentDraftInput, service: Service, user: CurrentUser
) -> AssessmentDetail:
    detail = _call(service.save_assessment_draft, user, assessment_id, payload)
    service.audit(user, "assessment.draft_saved", "assessment", assessment_id)
    return detail


@data_router.post("/assessments/{assessment_id}/complete", response_model=AssessmentDetail)
def complete_assessment(
    assessment_id: str, payload: AssessmentDraftInput, service: Service, user: CurrentUser
) -> AssessmentDetail:
    detail = _call(service.complete_assessment, user, assessment_id, payload)
    service.audit(user, "assessment.completed", "assessment", assessment_id)
    return detail


@data_router.get(
    "/assessments/{assessment_id}/pdf",
    responses={200: {"content": {"application/pdf": {}}, "description": "Arkusz oceny w formacie PDF (A4)."}},
)
def assessment_pdf(assessment_id: str, service: Service, user: CurrentUser) -> Response:
    """Arkusz oceny złożony z zapisanych danych (ten sam generator co POST /evaluations/pdf)."""
    pdf, filename = _call(service.assessment_pdf, user, assessment_id)
    service.audit(user, "assessment.pdf_downloaded", "assessment", assessment_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@data_router.get(
    "/assessments/{assessment_id}/ezd-package",
    tags=["Integracje"],
    responses={200: {"content": {"application/zip": {}}, "description": "Arkusz PDF + metadane.json do przekazania do EZD."}},
)
def assessment_ezd_package(assessment_id: str, service: Service, user: CurrentUser) -> Response:
    """Paczka dla systemu EZD (akta osobowe): podpisywany arkusz PDF i metadane dokumentu w JSON."""
    data, filename = _call(service.ezd_package, user, assessment_id)
    service.audit(user, "assessment.ezd_package", "assessment", assessment_id)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- integracje i rozliczalność -----------------------------------------------------------


@data_router.get("/export/assessments", tags=["Integracje"])
def export_assessments(
    service: Service, user: CurrentUser, format: Literal["csv", "json"] = Query(default="csv")
) -> Response:
    """Eksport dla systemu kadrowego (np. QNT): statusy, terminy i wyniki ocen, bez treści ocen (tylko kadry)."""
    import csv
    import io

    rows = _call(service.export_assessments, user)
    service.audit(user, "export.assessments", "export", None, f"format {format}, {len(rows)} wierszy")
    if format == "json":
        return Response(
            content=json.dumps(rows, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="oceny_eksport.json"'},
        )
    buffer = io.StringIO()
    columns = list(rows[0].keys()) if rows else ["id_oceny"]
    writer = csv.DictWriter(buffer, fieldnames=columns, delimiter=";")
    writer.writeheader()
    writer.writerows(rows)
    # BOM: poprawne polskie znaki po otwarciu w Excelu
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="oceny_eksport.csv"'},
    )


@data_router.get("/audit-log", response_model=list[AuditEntry], tags=["Integracje"])
def audit_log(service: Service, user: CurrentUser, limit: int = Query(default=200, ge=1, le=1000)) -> list[AuditEntry]:
    """Dziennik zdarzeń (kto, kiedy, jaka czynność, na czym) – dla kadr/administratora, bez treści ocen."""
    return _call(service.list_audit, user, limit)


# --- przypomnienia od kadr ------------------------------------------------------------------


@data_router.post("/reminders", response_model=Reminder, status_code=201, tags=["Przypomnienia"])
def create_reminder(payload: CreateReminderInput, service: Service, user: CurrentUser) -> Reminder:
    """Kadry wysyłają przełożonemu przypomnienie o czynnościach w procesie ocen (bez treści ocen)."""
    reminder = _call(service.create_reminder, user, payload)
    service.audit(user, "reminder.sent", "user", reminder.supervisor_id)
    return reminder


@data_router.get("/reminders", response_model=list[Reminder], tags=["Przypomnienia"])
def list_reminders(service: Service, user: CurrentUser) -> list[Reminder]:
    """Kadry: wszystkie przypomnienia; przełożony: tylko skierowane do niego. Najnowsze pierwsze."""
    return _call(service.list_reminders, user)
