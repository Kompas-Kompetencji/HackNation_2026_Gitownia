"""
Logika tras danych: kontrola dostępu, pola wyliczane (statusy, terminy, nazwiska),
szkic i zakończenie oceny, wskazówka poziomu dla kryterium.

Reguły prawne biorą się z istniejącego kodu (app.core.scoring_engine, app.core.deadline_calc,
app.core.config); ta warstwa ich nie powiela.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import lru_cache
from typing import Any

from app.core.config import FIRST_EVAL_ALLOWED_SCORES, PERIODIC_ALLOWED_SCORES, PERIODIC_SCORE_LABELS, settings
from app.core.deadline_calc import add_months_art_112_kc, calculate_deadlines
from app.core.scoring_engine import determine_periodic_overall_level, evaluate, round_half_up
from app.data.repository import DataRepository, StorageError
from app.data.schemas import (
    AssessmentDetail,
    AssessmentDraftInput,
    AssessmentEvaluation,
    AssessmentRecord,
    AssessmentSummary,
    CalendarEvent,
    CreateAssessmentInput,
    CreateEmployeeInput,
    CreateReminderInput,
    Employee,
    EmployeeMonitoring,
    EmployeeRecord,
    IndicatorAnswer,
    JobDescriptionDocument,
    NewAssessment,
    NewEmployee,
    NewReminder,
    Note,
    OspAnalysis,
    REMINDER_MAX_LENGTH,
    Reminder,
    ReminderRecord,
    ScoreResult,
    User,
)
from app.data.settings import today
from app.schemas.models import (
    CriterionScore,
    DeadlineRequest,
    EvaluatedPersonData,
    EvaluationRequest,
    EvaluationResponse,
    EvaluationType,
    EvaluatorPersonData,
    FormType,
    TriStateOption,
)

DUE_SOON_DAYS = 30

# Kadry monitorują terminy i statusy, ale nie widzą treści ocen (minimalizacja danych osobowych).
HR_NO_CONTENT = "Kadry nie mają dostępu do treści ocen. Widzą tylko status, terminy, rodzaj oceny i wynik końcowy."
HR_NO_NOTES = "Kadry nie mają dostępu do notatek przełożonego."
HR_NO_JOB_DESCRIPTIONS = "Kadry nie mają dostępu do opisów stanowiska pracy."
# Numer PESEL (11 cyfr) nie powinien trafiać do treści przypomnienia.
_PESEL_RE = re.compile(r"(?<!\d)\d{11}(?!\d)")

# Pierwsza ocena: egzamin ze służby przygotowawczej → pole silnika (exempt = wyjątek § 10 ust. 3).
EXAM_TO_ENGINE = {"passed": TriStateOption.TAK, "exempt": TriStateOption.NIE_DOTYCZY, "failed": TriStateOption.NIE}


def _first_eval_fields(data: AssessmentDraftInput) -> dict[str, Any]:
    """Pola tylko pierwszej oceny; dla arkuszy B i C zawsze puste (nie zmieniają oceny okresowej)."""
    first = data.form == "first"
    return {
        "exam_status": data.exam_status if first else None,
        "report_on_time": data.report_on_time if first else None,
        "initial_interview_date": data.initial_interview_date if first else None,
        "evaluation_interview_date": data.evaluation_interview_date if first else None,
    }


def _validate_first_eval_scale(data: AssessmentDraftInput) -> None:
    """Pierwsza ocena: decyzje przełożonego tylko w skali 3, 5, 7 (§ 9 ust. 1 rozporządzenia z 2015 r.)."""
    if data.form != "first":
        return
    names = competency_names()
    for d in data.decisions:
        if d.selected_level is not None and d.selected_level not in FIRST_EVAL_ALLOWED_SCORES:
            name = names.get(d.competency_id, d.competency_id)
            raise ServiceError(
                422,
                f"Element „{name}”: w pierwszej ocenie można przyznać tylko 3, 5 albo 7 punktów "
                f"(wybrano {d.selected_level}).",
            )


class ServiceError(Exception):
    """Błąd z kodem HTTP; trasa zamienia go na HTTPException."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


# --------------------------------------------------------------------------
# Model kompetencji (ten sam plik co GET /competencies)
# --------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _competency_model() -> dict[str, Any]:
    path = settings.COMPETENCY_MODEL_JSON_PATH
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    from scripts.parse_excel import build_output_document, build_seed_competencies

    return build_output_document(build_seed_competencies(), source_label="runtime_fallback_seed")


def competency_id_of(backend_id: int) -> str:
    return f"C{backend_id:02d}"


def competency_names() -> dict[str, str]:
    """competency_id ("C01") → nazwa kryterium ze słownika ustawowego."""
    return {competency_id_of(c["id"]): c["name"] for c in _competency_model()["competencies"]}


# --------------------------------------------------------------------------
# Wskazówka poziomu (POST /calculate-score)
# --------------------------------------------------------------------------

_LEVEL_BY_LABEL = {label: score for score, label in PERIODIC_SCORE_LABELS.items()}


def _validate_levels(answers: list[IndicatorAnswer]) -> None:
    for a in answers:
        if a.selected_level is not None and a.selected_level not in PERIODIC_ALLOWED_SCORES:
            raise ServiceError(
                422,
                f"Niedozwolony poziom {a.selected_level} dla wskaźnika {a.indicator_id}. "
                f"Dozwolone poziomy: {', '.join(str(s) for s in sorted(PERIODIC_ALLOWED_SCORES))}.",
            )


def calculate_score(answers: list[IndicatorAnswer]) -> ScoreResult:
    """
    Średnia ze wskaźników JEDNEGO kryterium i sugerowany poziom. „Brak podstaw do oceny”
    (selected_level = None) nie wchodzi do średniej. Poziom według progów § 11 ust. 1 pkt 2
    rozporządzenia z 2016 r. (remis na granicy przedziału daje niższy poziom, np. 4,00 → 3).
    """
    if not answers:
        raise ServiceError(422, "Brak odpowiedzi do obliczenia średniej.")
    _validate_levels(answers)
    levels = [a.selected_level for a in answers if a.selected_level is not None]
    if not levels:
        return ScoreResult(mean=None, suggested_level=None, counted_indicators=0)
    raw_avg = Decimal(sum(levels)) / Decimal(len(levels))
    label = determine_periodic_overall_level(raw_avg)
    return ScoreResult(
        mean=round_half_up(raw_avg, places=2),
        suggested_level=_LEVEL_BY_LABEL.get(label) if label else None,
        counted_indicators=len(levels),
    )


def _suggested_levels(answers: list[IndicatorAnswer]) -> dict[str, int | None]:
    by_competency: dict[str, list[IndicatorAnswer]] = {}
    for a in answers:
        by_competency.setdefault(a.competency_id, []).append(a)
    return {cid: calculate_score(items).suggested_level for cid, items in by_competency.items()}


# --------------------------------------------------------------------------
# Usługa danych
# --------------------------------------------------------------------------


# Umowy, przy których przeprowadza się ocenę danego rodzaju (ustawa o służbie cywilnej):
# pierwsza ocena – umowa na czas określony 12 mies. (art. 35 ust. 3) albo, za porozumieniem,
# zastępstwo (art. 37 ust. 2); ocena okresowa – tylko czas nieokreślony i mianowanie (art. 81 ust. 1).
FIRST_EVAL_CONTRACTS = ("fixed_term_first", "replacement")
PERIODIC_CONTRACTS = ("indefinite", "appointment")


def first_eval_start(record: EmployeeRecord) -> date:
    """Początek biegu terminów pierwszej oceny: zatrudnienie, a przy zastępstwie – dzień porozumienia stron."""
    if record.contract_type == "replacement" and record.first_eval_agreement_date:
        return record.first_eval_agreement_date
    return record.hire_date


def first_assessment_deadlines(record: EmployeeRecord):  # noqa: ANN201
    return calculate_deadlines(
        DeadlineRequest(
            evaluation_type=EvaluationType.FIRST_EVALUATION,
            data_nawiazania_stosunku_pracy=first_eval_start(record),
            data_zakonczenia_umowy=record.contract_end_date,
        )
    )


class DataService:
    def __init__(self, repo: DataRepository) -> None:
        self.repo = repo

    # --- użytkownik i uprawnienia ----------------------------------------------------------

    def current_user(self, user_id: str | None) -> User:
        if not user_id:
            raise ServiceError(401, "Brak nagłówka X-User-Id (zaloguj się kontem demonstracyjnym).")
        user = self.repo.get_user(user_id)
        if user is None:
            raise ServiceError(401, "Nieznany użytkownik.")
        return user

    def _employee_for_read(self, user: User, employee_id: str) -> EmployeeRecord:
        employee = self.repo.get_employee(employee_id)
        if employee is None:
            raise ServiceError(404, "Nie znaleziono pracownika.")
        if user.role != "hr" and employee.supervisor_id != user.id:
            raise ServiceError(403, "Brak dostępu do pracownika.")
        return employee

    @staticmethod
    def _deny_hr(user: User, detail: str) -> None:
        """Treść ocen, notatki i opisy stanowiska widzi tylko przełożony pracownika."""
        if user.role == "hr":
            raise ServiceError(403, detail)

    def _employee_for_write(self, user: User, employee_id: str) -> EmployeeRecord:
        employee = self._employee_for_read(user, employee_id)
        if user.role != "supervisor" or employee.supervisor_id != user.id:
            raise ServiceError(403, "Zmiany wprowadza wyłącznie przełożony pracownika.")
        return employee

    def _assessment_for(self, user: User, assessment_id: str, write: bool) -> tuple[AssessmentRecord, EmployeeRecord]:
        record = self.repo.get_assessment(assessment_id)
        if record is None:
            raise ServiceError(404, "Nie znaleziono oceny.")
        try:
            employee = (self._employee_for_write if write else self._employee_for_read)(user, record.employee_id)
        except ServiceError as error:
            if error.status_code == 404:
                raise ServiceError(404, "Nie znaleziono oceny.") from error
            raise ServiceError(error.status_code, "Brak dostępu do oceny.") from error
        return record, employee

    # --- użytkownicy -----------------------------------------------------------------------

    def list_demo_users(self) -> list[User]:
        return self.repo.list_users()

    def get_user(self, user_id: str) -> User:
        user = self.repo.get_user(user_id)
        if user is None:
            raise ServiceError(404, "Nie znaleziono użytkownika.")
        return user

    # --- pracownicy ------------------------------------------------------------------------

    def _employee_view(self, record: EmployeeRecord, assessments: list[AssessmentRecord]) -> Employee:
        own = [a for a in assessments if a.employee_id == record.id]
        completed = sorted((a for a in own if a.status == "completed" and a.completed_at), key=lambda a: a.completed_at)
        last = completed[-1] if completed else None
        open_ = [a for a in own if a.status != "completed"]

        next_due: date | None
        if open_:
            next_due = min(a.due_date for a in open_)
        elif last is not None and last.completed_at is not None:
            # § 7 rozporządzenia z 2016 r.: kolejna ocena po 24 miesiącach, po negatywnej po 6
            months = 6 if last.result == "negative" else 24
            next_due = add_months_art_112_kc(last.completed_at.date(), months)
        elif record.assessment_kind == "first":
            next_due = first_assessment_deadlines(record).termin_dokonania_oceny_max
        else:
            next_due = None

        now = today()
        if next_due is not None and next_due < now:
            status = "assessment_overdue"
        elif next_due is not None and next_due <= now + timedelta(days=DUE_SOON_DAYS):
            status = "assessment_due_soon"
        elif any(a.status == "draft" for a in open_):
            status = "assessment_in_progress"
        elif record.assessment_kind == "first" and last is None:
            status = "awaiting_first_assessment"
        else:
            status = "up_to_date"

        return Employee(
            **record.model_dump(),
            last_assessment_date=last.completed_at.date() if last and last.completed_at else None,
            last_assessment_result=last.result if last else None,
            next_assessment_due=next_due,
            status=status,  # type: ignore[arg-type]
        )

    def _views(self, records: list[EmployeeRecord]) -> list[Employee]:
        assessments = self.repo.list_assessments({r.id for r in records})
        return [self._employee_view(r, assessments) for r in records]

    def _monitoring(self, views: list[Employee]) -> list[EmployeeMonitoring]:
        """Kadry: tylko pola potrzebne do monitorowania (bez stanowiska, umowy i arkusza)."""
        users = {u.id: u for u in self.repo.list_users()}
        fields = set(EmployeeMonitoring.model_fields) - {"supervisor_name"}
        out = []
        for e in views:
            sup = users.get(e.supervisor_id)
            name = f"{sup.first_name} {sup.last_name}".strip() if sup else ""
            out.append(EmployeeMonitoring(**e.model_dump(include=fields), supervisor_name=name))
        return out

    def list_employees(self, user: User) -> list[Employee] | list[EmployeeMonitoring]:
        records = self.repo.list_employees(None if user.role == "hr" else user.id)
        views = sorted(self._views(records), key=lambda e: (e.last_name, e.first_name))
        return self._monitoring(views) if user.role == "hr" else views

    def get_employee(self, user: User, employee_id: str) -> Employee | EmployeeMonitoring:
        view = self._views([self._employee_for_read(user, employee_id)])[0]
        return self._monitoring([view])[0] if user.role == "hr" else view

    def _full_employee(self, user: User, employee_id: str) -> Employee:
        """Pełny widok (wewnętrznie, np. po zapisie przez przełożonego)."""
        return self._views([self._employee_for_read(user, employee_id)])[0]

    def create_employee(self, user: User, data: CreateEmployeeInput) -> Employee:
        if user.role != "supervisor":
            raise ServiceError(403, "Pracownika dodaje przełożony.")
        if data.assessment_kind == "first" and data.form != "first":
            raise ServiceError(422, "Dla pierwszej oceny arkusz to „first”.")
        if data.assessment_kind == "periodic" and data.form == "first":
            raise ServiceError(422, "Dla oceny okresowej arkusz to B albo C.")
        if data.assessment_kind == "periodic" and data.contract_type not in PERIODIC_CONTRACTS:
            raise ServiceError(
                422,
                "Ocenie okresowej podlegają tylko osoby zatrudnione na czas nieokreślony i urzędnicy "
                "(art. 81 ust. 1 ustawy o służbie cywilnej). Umowa na czas określony lub w celu zastępstwa – bez oceny okresowej.",
            )
        if data.assessment_kind == "first" and data.contract_type not in FIRST_EVAL_CONTRACTS:
            raise ServiceError(
                422,
                "Pierwszą ocenę przeprowadza się przy pierwszej umowie na czas określony albo – za porozumieniem – "
                "przy umowie w celu zastępstwa (art. 35 ust. 3, art. 37 ust. 2).",
            )
        if data.contract_type in FIRST_EVAL_CONTRACTS and data.contract_end_date is None:
            raise ServiceError(422, "Podaj datę zakończenia umowy (przy zastępstwie – przewidywaną).")
        if data.contract_type == "replacement":
            agreed = data.first_eval_agreement_date
            if agreed is None:
                raise ServiceError(
                    422,
                    "Pracownik zatrudniony w celu zastępstwa podlega pierwszej ocenie tylko za porozumieniem "
                    "z dyrektorem generalnym urzędu (art. 37 ust. 2). Podaj datę tego porozumienia.",
                )
            if agreed < data.hire_date or agreed > today():
                raise ServiceError(422, "Data porozumienia musi przypadać między datą zatrudnienia a dniem dzisiejszym.")
            latest_start = add_months_art_112_kc(agreed, 9)
            if data.contract_end_date is not None and data.contract_end_date < latest_start:
                raise ServiceError(
                    422,
                    "Przewidywany okres zastępstwa nie pozwala dokonać pierwszej oceny: ocenę dokonuje się nie wcześniej "
                    "niż po 8 miesiącach od porozumienia i najpóźniej miesiąc przed końcem umowy "
                    f"(umowa musi trwać co najmniej do {latest_start.isoformat()}).",
                )
        record = self.repo.create_employee(
            NewEmployee(
                supervisor_id=user.id,
                first_name=data.first_name.strip(),
                last_name=data.last_name.strip(),
                position_title=data.position_title.strip(),
                organizational_unit=(data.organizational_unit or user.organizational_unit).strip(),
                hire_date=data.hire_date,
                contract_type=data.contract_type,
                contract_end_date=data.contract_end_date if data.contract_type in FIRST_EVAL_CONTRACTS else None,
                first_eval_agreement_date=data.first_eval_agreement_date if data.contract_type == "replacement" else None,
                assessment_kind=data.assessment_kind,
                form=data.form,
            )
        )
        if record.assessment_kind == "first":
            # Pierwsza ocena czeka od razu na liście ocen (status „nierozpoczęta”).
            view = self._employee_view(record, [])
            self.repo.create_assessment(
                NewAssessment(
                    employee_id=record.id,
                    supervisor_id=user.id,
                    kind="first",
                    form="first",
                    status="not_started",
                    started_at=None,
                    due_date=view.next_assessment_due or today(),
                )
            )
        return self._full_employee(user, record.id)

    def extend_contract(self, user: User, employee_id: str, new_end_date: date, absence_days: int) -> Employee:
        """
        Art. 35 ust. 4 ustawy: przy usprawiedliwionej nieobecności nowego pracownika > 3 miesięcy dyrektor
        generalny może (na wniosek pracownika) przedłużyć umowę o czas tej nieobecności. Terminy pierwszej
        oceny przesuwają się razem z końcem umowy.
        """
        employee = self._employee_for_write(user, employee_id)
        if employee.contract_type not in FIRST_EVAL_CONTRACTS or employee.contract_end_date is None:
            raise ServiceError(422, "Przedłużenie z art. 35 ust. 4 dotyczy umowy na czas określony przed pierwszą oceną.")
        if absence_days <= 90:
            raise ServiceError(422, "Przedłużenie przysługuje przy nieobecności dłuższej niż 3 miesiące.")
        if new_end_date <= employee.contract_end_date:
            raise ServiceError(422, "Nowa data zakończenia umowy musi być późniejsza niż obecna.")
        if new_end_date > employee.contract_end_date + timedelta(days=absence_days):
            raise ServiceError(422, "Umowę przedłuża się najwyżej o czas usprawiedliwionej nieobecności.")
        updated = self.repo.update_employee(employee_id, {"contract_end_date": new_end_date})
        new_due = first_assessment_deadlines(updated).termin_dokonania_oceny_max
        if new_due is not None:
            for a in self.repo.list_assessments({employee_id}):
                if a.kind == "first" and a.status != "completed":
                    self.repo.save_assessment(a.model_copy(update={"due_date": new_due}))
        return self._full_employee(user, employee_id)

    # --- kalendarz terminów ----------------------------------------------------------------

    def calendar(self, user: User, start: date, end: date) -> list[CalendarEvent]:
        """
        Terminy procesu ocen w oknie [start, end]: kadry – wszyscy pracownicy, przełożony – tylko swoi.
        Źródła: ustawa o służbie cywilnej, rozporządzenia z 2015 r. (pierwsza ocena) i 2016 r. (ocena okresowa).
        """
        if end < start:
            raise ServiceError(422, "Koniec zakresu nie może być wcześniejszy niż początek.")
        if (end - start).days > 400:
            raise ServiceError(422, "Zakres kalendarza może obejmować najwyżej ok. 13 miesięcy.")
        records = self.repo.list_employees(None if user.role == "hr" else user.id)
        assessments = self.repo.list_assessments({r.id for r in records}) if records else []
        users = {u.id: u for u in self.repo.list_users()}
        now = today()
        events: list[CalendarEvent] = []

        for record in records:
            own = [a for a in assessments if a.employee_id == record.id]
            completed = sorted((a for a in own if a.status == "completed" and a.completed_at), key=lambda a: a.completed_at)
            open_ = [a for a in own if a.status != "completed"]
            sup = users.get(record.supervisor_id)
            base = {
                "employee_id": record.id,
                "employee_name": f"{record.first_name} {record.last_name}".strip(),
                "supervisor_id": record.supervisor_id,
                "supervisor_name": f"{sup.first_name} {sup.last_name}".strip() if sup else "",
            }

            def add(kind: str, when: date | None, title: str, description: str, legal: str, *, done: bool = False,
                    can_be_overdue: bool = True) -> None:
                if when is None or not (start <= when <= end):
                    return
                if done:
                    severity = "done"
                elif when < now:
                    severity = "overdue" if can_be_overdue else "past"
                elif when <= now + timedelta(days=14):
                    severity = "soon"
                else:
                    severity = "upcoming"
                events.append(
                    CalendarEvent(id=f"{kind}-{record.id}-{when.isoformat()}", date=when, kind=kind, title=title,  # type: ignore[arg-type]
                                  description=description, legal_basis=legal, severity=severity, **base)  # type: ignore[arg-type]
                )

            if record.assessment_kind == "first":
                first_done = any(a.kind == "first" for a in completed)
                d = first_assessment_deadlines(record)
                add("first_interview", d.termin_rozmowy_wstepnej_max, "Rozmowa wstępna z nowym pracownikiem",
                    "Ostatni dzień na rozmowę wstępną: omówienie zadań, elementów oceny i terminów.",
                    "§ 3 rozporządzenia z 2015 r. (21 dni od nawiązania stosunku pracy)",
                    done=first_done, can_be_overdue=False)
                add("report_window", d.termin_zlozenia_sprawozdania_min, "Otwarcie okna na sprawozdanie i pierwszą ocenę",
                    "Od tego dnia pracownik może złożyć sprawozdanie z realizacji zadań, a przełożony – dokonać pierwszej oceny.",
                    "art. 38 ust. 1 ustawy; § 4 rozporządzenia z 2015 r. (po 8 miesiącach)",
                    done=first_done, can_be_overdue=False)
                open_first = next((a for a in open_ if a.kind == "first"), None)
                due = open_first.due_date if open_first else d.termin_dokonania_oceny_max
                add("first_due", due, "Termin pierwszej oceny",
                    "Ostatni dzień na dokonanie pierwszej oceny (najpóźniej miesiąc przed końcem umowy).",
                    "art. 38 ust. 1 ustawy o służbie cywilnej", done=first_done)
                add("contract_end", record.contract_end_date, "Koniec umowy na czas określony",
                    "Przy pozytywnej pierwszej ocenie kierujący komórką występuje o umowę na czas nieokreślony.",
                    "art. 38 ust. 3 ustawy o służbie cywilnej", can_be_overdue=False)
            else:
                last = completed[-1] if completed else None
                negative = bool(last and last.result == "negative")
                cycle_start = last.completed_at.date() if last and last.completed_at else record.hire_date
                add("criteria_meeting", cycle_start + timedelta(days=7 if negative else 30),
                    "Rozmowa o kryteriach oceny okresowej",
                    "Zapoznanie pracownika z kryteriami (w tym do 3 kryteriów dodatkowych) na nowy okres oceny.",
                    "§ 7 rozporządzenia z 2016 r. (30 dni; 7 dni po ocenie negatywnej)", can_be_overdue=False)
                open_periodic = next((a for a in open_ if a.kind == "periodic"), None)
                if open_periodic:
                    due: date | None = open_periodic.due_date
                elif last and last.completed_at:
                    due = add_months_art_112_kc(last.completed_at.date(), 6 if negative else 24)
                else:
                    due = add_months_art_112_kc(record.hire_date, 24)
                add("periodic_due", due, "Termin oceny okresowej",
                    "Ocenę sporządza się co 24 miesiące, a po ocenie negatywnej – po 6 miesiącach.",
                    "art. 81 ust. 4 i 9 ustawy o służbie cywilnej")

            for a in completed:
                if a.kind == "periodic" and a.completed_at:
                    add("objection_deadline", a.completed_at.date() + timedelta(days=7), "Termin na sprzeciw od oceny okresowej",
                        "Pracownik może wnieść sprzeciw do dyrektora generalnego w ciągu 7 dni od zapoznania się z oceną.",
                        "art. 83 ust. 1 ustawy o służbie cywilnej", can_be_overdue=False)

        order = {"overdue": 0, "soon": 1, "upcoming": 2, "past": 3, "done": 4}
        return sorted(events, key=lambda e: (e.date, order[e.severity], e.employee_name))

    # --- notatki ---------------------------------------------------------------------------

    def list_notes(self, user: User, employee_id: str) -> list[Note]:
        self._employee_for_read(user, employee_id)
        self._deny_hr(user, HR_NO_NOTES)
        return self.repo.list_notes(employee_id, user.id)

    def add_note(self, user: User, employee_id: str, text: str) -> Note:
        self._employee_for_write(user, employee_id)
        if not text.strip():
            raise ServiceError(422, "Notatka nie może być pusta.")
        return self.repo.add_note(employee_id, user.id, text.strip(), _now())

    # --- opisy stanowiska ------------------------------------------------------------------

    def list_job_descriptions(self, user: User, employee_id: str) -> list[JobDescriptionDocument]:
        self._employee_for_read(user, employee_id)
        self._deny_hr(user, HR_NO_JOB_DESCRIPTIONS)
        return self.repo.list_job_descriptions(employee_id)

    def attach_job_description(
        self, user: User, employee_id: str, filename: str, analysis: OspAnalysis | None
    ) -> JobDescriptionDocument:
        employee = self._employee_for_write(user, employee_id)
        doc = self.repo.add_job_description(employee_id, filename, analysis, _now())
        if analysis is not None and employee.assessment_kind == "periodic":
            # Potwierdzona analiza ustala arkusz oceny okresowej i nazwę stanowiska.
            self.repo.update_employee(
                employee_id, {"form": analysis.suggested_form, "position_title": analysis.position_title}
            )
        return doc

    # --- oceny -----------------------------------------------------------------------------

    def _names(self) -> tuple[dict[str, User], dict[str, EmployeeRecord]]:
        users = {u.id: u for u in self.repo.list_users()}
        employees = {e.id: e for e in self.repo.list_employees(None)}
        return users, employees

    def _summary(self, record: AssessmentRecord, users: dict[str, User], employees: dict[str, EmployeeRecord]) -> AssessmentSummary:
        employee = employees.get(record.employee_id)
        supervisor = users.get(employee.supervisor_id) if employee else None
        status = record.status
        if status == "not_started" and record.due_date < today():
            status = "overdue"  # type: ignore[assignment]
        return AssessmentSummary(
            id=record.id,
            employee_id=record.employee_id,
            employee_name=f"{employee.first_name} {employee.last_name}" if employee else "",
            supervisor_name=f"{supervisor.first_name} {supervisor.last_name}" if supervisor else "",
            kind=record.kind,
            form=record.form,
            status=status,
            started_at=record.started_at,
            completed_at=record.completed_at,
            due_date=record.due_date,
            result=record.result,
        )

    def _detail(self, record: AssessmentRecord) -> AssessmentDetail:
        users, employees = self._names()
        summary = self._summary(record, users, employees)
        evaluation = None
        if record.status == "completed" and record.decisions:
            evaluation = _to_evaluation(self._evaluate(record, employees.get(record.employee_id), users))
        return AssessmentDetail(
            **summary.model_dump(),
            additional_competency_ids=record.additional_competency_ids,
            answers=record.answers,
            decisions=record.decisions,
            justification_draft=record.justification_draft,
            last_step=record.last_step,
            updated_at=record.updated_at,
            evaluation=evaluation,
            exam_status=record.exam_status,
            report_on_time=record.report_on_time,
            initial_interview_date=record.initial_interview_date,
            evaluation_interview_date=record.evaluation_interview_date,
        )

    def list_assessments(
        self, user: User, employee_id: str | None = None, supervisor_id: str | None = None, status: str | None = None
    ) -> list[AssessmentSummary]:
        users, employees = self._names()
        visible = {e.id for e in employees.values() if user.role == "hr" or e.supervisor_id == user.id}
        if employee_id:
            visible &= {employee_id}
        if supervisor_id:
            visible &= {e.id for e in employees.values() if e.supervisor_id == supervisor_id}
        summaries = [self._summary(a, users, employees) for a in self.repo.list_assessments(visible)]
        if status:
            summaries = [s for s in summaries if s.status == status]
        return sorted(summaries, key=lambda s: (s.completed_at is not None, s.due_date), reverse=False)

    def get_assessment(self, user: User, assessment_id: str) -> AssessmentDetail:
        record, _ = self._assessment_for(user, assessment_id, write=False)
        self._deny_hr(user, HR_NO_CONTENT)
        return self._detail(record)

    def create_assessment_draft(self, user: User, data: CreateAssessmentInput) -> AssessmentSummary:
        employee = self._employee_for_write(user, data.employee_id)
        if employee.form is None:
            raise ServiceError(409, "Pracownik nie ma ustalonego arkusza oceny (wgraj opis stanowiska).")
        now = _now()
        open_ = [
            a
            for a in self.repo.list_assessments({employee.id})
            if a.kind == data.kind and a.status in ("not_started", "draft")
        ]
        if open_:
            # Istniejąca nierozpoczęta (także przeterminowana) ocena zamienia się w szkic.
            record = open_[0]
            if record.status == "not_started":
                record = self.repo.save_assessment(
                    record.model_copy(update={"status": "draft", "started_at": now, "form": employee.form})
                )
        else:
            view = self._views([employee])[0]
            record = self.repo.create_assessment(
                NewAssessment(
                    employee_id=employee.id,
                    supervisor_id=employee.supervisor_id,
                    kind=data.kind,
                    form=employee.form,
                    status="draft",
                    started_at=now,
                    due_date=view.next_assessment_due or now.date(),
                )
            )
        users, employees = self._names()
        return self._summary(record, users, employees)

    def save_assessment_draft(self, user: User, assessment_id: str, data: AssessmentDraftInput) -> AssessmentDetail:
        record, _ = self._assessment_for(user, assessment_id, write=True)
        if record.status == "completed":
            raise ServiceError(409, "Ocena jest już zakończona.")
        _validate_levels(data.answers)
        for d in data.decisions:
            if d.selected_level is not None and d.selected_level not in PERIODIC_ALLOWED_SCORES:
                raise ServiceError(422, f"Niedozwolony poziom {d.selected_level} dla kryterium {d.competency_id}.")
        _validate_first_eval_scale(data)
        updated = record.model_copy(
            update={
                "form": data.form,
                "status": "draft",
                "started_at": record.started_at or _now(),
                "additional_competency_ids": data.additional_competency_ids,
                "answers": data.answers,
                "decisions": data.decisions,
                "justification_draft": data.justification_draft,
                "last_step": data.last_step,
                "updated_at": _now(),
                "suggested_levels": _suggested_levels(data.answers),
                **_first_eval_fields(data),
            }
        )
        return self._detail(self.repo.save_assessment(updated))

    def _evaluation_request(
        self, record: AssessmentRecord, employee: EmployeeRecord | None, users: dict[str, User]
    ) -> EvaluationRequest:
        names = competency_names()
        first = record.form == "first"
        supervisor = users.get(employee.supervisor_id) if employee else None
        first_fields: dict[str, Any] = {}
        if first:
            try:
                deadlines = first_assessment_deadlines(employee) if employee else None
            except Exception:  # noqa: BLE001 – niepełne dane pracownika nie mogą blokować oceny ani PDF
                deadlines = None
            first_fields = {
                "egzamin_sluzba_przygotowawcza": EXAM_TO_ENGINE.get(record.exam_status or ""),
                "sprawozdanie_zlozone_w_terminie": record.report_on_time,
                "data_rozmowy_wstepnej": record.initial_interview_date,
                "data_rozmowy_oceniajacej": record.evaluation_interview_date,
                # Termin sprawozdania: od upływu 8 miesięcy (§ 4 ust. 1) do ostatniego dnia na ocenę.
                "termin_zlozenia_sprawozdania_od": deadlines.termin_zlozenia_sprawozdania_min if deadlines else None,
                "termin_zlozenia_sprawozdania_do": deadlines.termin_dokonania_oceny_max if deadlines else None,
                # Okres, w którym powinna zostać dokonana pierwsza ocena.
                "okres_oceny_od": deadlines.termin_dokonania_oceny_min if deadlines else None,
                "okres_oceny_do": deadlines.termin_dokonania_oceny_max if deadlines else None,
            }
        return EvaluationRequest(
            evaluation_type=EvaluationType.FIRST_EVALUATION if first else EvaluationType.PERIODIC_EVALUATION,
            form_type=FormType.FIRST_EVAL_FORM if first else FormType(f"FORM_{record.form}"),
            oceniany=EvaluatedPersonData(
                imie=employee.first_name if employee else "",
                nazwisko=employee.last_name if employee else "",
                komorka_organizacyjna=employee.organizational_unit if employee else "",
                stanowisko_pracy=employee.position_title if employee else "",
                data_nawiazania_stosunku_pracy=employee.hire_date if employee else None,
            ),
            oceniajacy=EvaluatorPersonData(
                imie=supervisor.first_name if supervisor else "",
                nazwisko=supervisor.last_name if supervisor else "",
                komorka_organizacyjna=supervisor.organizational_unit if supervisor else "",
                stanowisko_pracy=supervisor.job_title if supervisor else "",
            ),
            data_sporzadzenia_oceny=record.completed_at.date() if record.completed_at else None,
            oceny_czastkowe=[
                CriterionScore(name=names.get(d.competency_id, d.competency_id), score=d.selected_level, is_mandatory=d.is_mandatory)
                for d in record.decisions
                if d.selected_level is not None
            ],
            uzasadnienie=record.justification_draft.strip() or None,
            **first_fields,
        )

    def _evaluate(self, record: AssessmentRecord, employee: EmployeeRecord | None, users: dict[str, User]) -> EvaluationResponse:
        return evaluate(self._evaluation_request(record, employee, users))

    def complete_assessment(self, user: User, assessment_id: str, data: AssessmentDraftInput) -> AssessmentDetail:
        record, employee = self._assessment_for(user, assessment_id, write=True)
        if record.status == "completed":
            raise ServiceError(409, "Ocena jest już zakończona.")
        if not data.decisions or any(d.selected_level is None for d in data.decisions):
            raise ServiceError(422, "Nie wszystkie kryteria mają decyzję.")
        _validate_levels(data.answers)
        _validate_first_eval_scale(data)
        if data.form in ("B", "C", "first"):
            # Model kompetencji: "brak podstaw do oceny" dotyczy pojedynczego wskaźnika. Każde wybrane
            # kryterium otrzymuje ocenę cząstkową, więc musi mieć co najmniej jeden oceniony wskaźnik.
            names = competency_names()
            for d in data.decisions:
                own = [a for a in data.answers if a.competency_id == d.competency_id]
                if own and all(a.selected_level is None for a in own):
                    name = names.get(d.competency_id, d.competency_id)
                    label = "Element" if data.form == "first" else "Kryterium"
                    raise ServiceError(
                        422,
                        f"{label} „{name}”: wszystkie wskaźniki mają „brak podstaw do oceny”. "
                        "Oceń co najmniej jeden wskaźnik – każde kryterium otrzymuje ocenę cząstkową.",
                    )
        now = _now()
        candidate = record.model_copy(
            update={
                "form": data.form,
                "additional_competency_ids": data.additional_competency_ids,
                "answers": data.answers,
                "decisions": data.decisions,
                "justification_draft": data.justification_draft,
                "last_step": data.last_step,
                "updated_at": now,
                "completed_at": now,
                "suggested_levels": _suggested_levels(data.answers),
                **_first_eval_fields(data),
            }
        )
        users = {u.id: u for u in self.repo.list_users()}
        result = self._evaluate(candidate, employee, users)
        if result.errors:
            raise ServiceError(422, " ".join(result.errors))
        if result.uzasadnienie_obowiazkowe and not data.justification_draft.strip():
            raise ServiceError(422, "Uzasadnienie jest obowiązkowe przy ocenie negatywnej.")
        saved = self.repo.save_assessment(
            candidate.model_copy(
                update={
                    "status": "completed",
                    "started_at": record.started_at or now,
                    "result": "positive" if result.werdykt == "POZYTYWNA" else "negative",
                    "stored_mean": result.srednia_arytmetyczna,
                    "stored_overall_level": result.ogolny_poziom,
                }
            )
        )
        if data.form in ("B", "C") and employee.form != data.form:
            self.repo.update_employee(employee.id, {"form": data.form})
        return self._detail(saved)

    def assessment_pdf(self, user: User, assessment_id: str) -> tuple[bytes, str]:
        from app.services.pdf_generator import generate_evaluation_pdf

        record, employee = self._assessment_for(user, assessment_id, write=False)
        self._deny_hr(user, HR_NO_CONTENT)
        users = {u.id: u for u in self.repo.list_users()}
        request = self._evaluation_request(record, employee, users)
        pdf = generate_evaluation_pdf(request=request, result=evaluate(request))
        # Nazwa pliku bez polskich znaków (nagłówek Content-Disposition musi być w ASCII).
        return pdf, f"Arkusz_oceny_{record.id}.pdf"


    # --- przypomnienia od kadr ------------------------------------------------------------

    def _reminder_view(self, r: ReminderRecord, users: dict[str, User], employees: dict[str, EmployeeRecord]) -> Reminder:
        def name(u: User | None) -> str:
            return f"{u.first_name} {u.last_name}".strip() if u else ""

        return Reminder(
            id=r.id,
            created_at=r.created_at,
            author_id=r.author_id,
            author_name=name(users.get(r.author_id or "")),
            supervisor_id=r.supervisor_id,
            supervisor_name=name(users.get(r.supervisor_id)),
            employee_ids=r.employee_ids,
            employee_names=[
                f"{e.first_name} {e.last_name}".strip() if (e := employees.get(i)) else "" for i in r.employee_ids
            ],
            message=r.message,
        )

    def create_reminder(self, user: User, data: CreateReminderInput) -> Reminder:
        """Kadry przypominają przełożonemu o czynnościach w procesie ocen (bez treści ocen)."""
        if user.role != "hr":
            raise ServiceError(403, "Przypomnienia wysyłają wyłącznie kadry.")
        supervisor = self.repo.get_user(data.supervisor_id)
        if supervisor is None or supervisor.role != "supervisor":
            raise ServiceError(422, "Nie znaleziono przełożonego, do którego ma trafić przypomnienie.")
        message = data.message.strip()
        if not message:
            raise ServiceError(422, "Treść przypomnienia nie może być pusta.")
        if len(message) > REMINDER_MAX_LENGTH:
            raise ServiceError(
                422, f"Treść przypomnienia może mieć najwyżej {REMINDER_MAX_LENGTH} znaków (obecnie {len(message)})."
            )
        if _PESEL_RE.search(message):
            raise ServiceError(422, "Treść przypomnienia nie może zawierać numeru PESEL ani innych danych osobowych.")
        employee_ids = list(dict.fromkeys(data.employee_ids))
        for employee_id in employee_ids:
            employee = self.repo.get_employee(employee_id)
            if employee is None:
                raise ServiceError(422, f"Nie znaleziono pracownika o identyfikatorze „{employee_id}”.")
            if employee.supervisor_id != supervisor.id:
                raise ServiceError(
                    422,
                    f"Pracownik {employee.first_name} {employee.last_name} nie podlega przełożonemu "
                    f"{supervisor.first_name} {supervisor.last_name}.",
                )
        try:
            record = self.repo.add_reminder(
                NewReminder(
                    author_id=user.id,
                    supervisor_id=supervisor.id,
                    employee_ids=employee_ids,
                    message=message,
                    created_at=_now(),
                )
            )
        except StorageError as error:
            raise ServiceError(503, "Nie udało się zapisać przypomnienia. Spróbuj ponownie za chwilę.") from error
        users, employees = self._names()
        return self._reminder_view(record, users, employees)

    def list_reminders(self, user: User) -> list[Reminder]:
        """Kadry: wszystkie przypomnienia; przełożony: tylko skierowane do niego. Najnowsze pierwsze."""
        try:
            records = self.repo.list_reminders(None if user.role == "hr" else user.id)
        except StorageError as error:
            raise ServiceError(503, "Nie udało się wczytać przypomnień. Spróbuj ponownie za chwilę.") from error
        users, employees = self._names()
        views = [self._reminder_view(r, users, employees) for r in records]
        return sorted(views, key=lambda r: r.created_at, reverse=True)


def _to_evaluation(r: EvaluationResponse) -> AssessmentEvaluation:
    return AssessmentEvaluation(
        mean=r.srednia_arytmetyczna,
        overall_level=r.ogolny_poziom,
        result="positive" if r.werdykt == "POZYTYWNA" else "negative",
        reasons=r.powody_werdyktu,
        justification_required=r.uzasadnienie_obowiazkowe,
        development_criteria=r.iprz_mandatory_criteria,
        errors=r.errors,
        warnings=r.warnings,
    )
