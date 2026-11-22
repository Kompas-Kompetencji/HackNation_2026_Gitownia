"""
Dane przykładowe wersji pamięciowej. Odpowiadają makietom frontendu (frontend/src/lib/mocks):
dwóch przełożonych, użytkownik kadr, czworo pracowników w różnych sytuacjach:
- Joanna Pietrzyk (sup-001): ocena okresowa, termin wkrótce, szkic w toku, w historii ocena negatywna,
- Grzegorz Łuczak (sup-001): ocena okresowa aktualna (zakończona w 2025 r.),
- Małgorzata Wróbel-Sośnicka (sup-001): termin oceny okresowej przekroczony, brak opisu stanowiska,
- Paweł Żmijewski (sup-002): nowo zatrudniony, pierwsza ocena nierozpoczęta,
- Karolina Mazur (sup-002): umowa na czas określony, trwa okno pierwszej oceny (szkic w toku),
- Adam Wilk (sup-002): umowa na zastępstwo, pierwsza ocena liczona od porozumienia stron (art. 37 ust. 2),
- Ewa Kubiak (sup-001): urzędniczka mianowana, termin oceny okresowej za niecały miesiąc.
Wszystkie dane są fikcyjne.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from app.data.schemas import (
    AdditionalCriterion,
    AssessmentRecord,
    CriterionDecision,
    EmployeeRecord,
    JobDescriptionDocument,
    Note,
    OspAnalysis,
    User,
)

# Kryteria obowiązkowe w kolejności arkusza (identyfikatory jak we frontendzie: "C" + id z /competencies)
MANDATORY_C = ["C03", "C01", "C04", "C06", "C02"]
MANDATORY_B = ["C13", "C14", "C04", "C06", "C02"]


def _utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


@dataclass
class SeedData:
    users: list[User]
    employees: list[EmployeeRecord]
    notes: list[tuple[Note, str]]  # (notatka, id autora)
    job_descriptions: list[JobDescriptionDocument]
    assessments: list[AssessmentRecord]


def _analysis(filename: str) -> OspAnalysis:
    """Wynik analizy opisu stanowiska potwierdzony przez przełożonego (jak makieta analyzeOsp)."""
    name = filename.lower()
    if "radca" in name:
        return OspAnalysis(
            filename=filename,
            position_title="Radca",
            organizational_unit="Wydział Prawny",
            has_management_duties=False,
            subordinates_count=0,
            suggested_form="C",
            additional_criteria=[
                AdditionalCriterion(criterion_id="C07", name="Myślenie analityczne", rationale="Stanowisko obejmuje opiniowanie projektów aktów prawnych."),
                AdditionalCriterion(criterion_id="C08", name="Negocjowanie", rationale="Opis wymaga uzgadniania stanowiska urzędu z innymi resortami."),
                AdditionalCriterion(criterion_id="C09", name="Wystąpienia publiczne", rationale="Radca reprezentuje urząd na posiedzeniach komisji."),
            ],
        )
    return OspAnalysis(
        filename=filename,
        position_title="Starszy specjalista",
        organizational_unit="Wydział Skarg i Wniosków",
        has_management_duties=False,
        subordinates_count=0,
        suggested_form="C",
        additional_criteria=[
            AdditionalCriterion(criterion_id="C10", name="Orientacja na klienta/interesanta", rationale="Stanowisko obsługuje skargi i wnioski mieszkańców."),
            AdditionalCriterion(criterion_id="C07", name="Myślenie analityczne", rationale="Opis stanowiska wskazuje analizę zasadności skarg i wskazywanie ich przyczyn."),
            AdditionalCriterion(criterion_id="C11", name="Radzenie sobie w sytuacjach kryzysowych", rationale="Do obowiązków należą rozmowy z wzburzonymi skarżącymi."),
        ],
    )


def _history(
    assessment_id: str,
    employee_id: str,
    form: str,
    completed: str,
    result: str,
    additional: dict[str, int] | None = None,
    mandatory_levels: list[int] | None = None,
    justification: str = "",
) -> AssessmentRecord:
    """Zakończona ocena z przeszłości: same decyzje (bez odpowiedzi do wskaźników)."""
    decisions: list[CriterionDecision] = []
    additional_ids: list[str] | None = None
    if form in ("B", "C") and mandatory_levels:
        mandatory = MANDATORY_B if form == "B" else MANDATORY_C
        decisions = [
            CriterionDecision(competency_id=cid, is_mandatory=True, selected_level=level)
            for cid, level in zip(mandatory, mandatory_levels)
        ]
        decisions += [
            CriterionDecision(competency_id=cid, is_mandatory=False, selected_level=level)
            for cid, level in (additional or {}).items()
        ]
        additional_ids = list((additional or {}).keys())
    return AssessmentRecord(
        id=assessment_id,
        employee_id=employee_id,
        kind="first" if form == "first" else "periodic",
        form=form,  # type: ignore[arg-type]
        status="completed",
        started_at=_utc(f"{completed}T08:00:00Z"),
        completed_at=_utc(f"{completed}T14:00:00Z"),
        due_date=date.fromisoformat(completed),
        result=result,  # type: ignore[arg-type]
        additional_competency_ids=additional_ids,
        decisions=decisions,
        justification_draft=justification,
    )


def build_seed() -> SeedData:
    users = [
        User(id="sup-001", role="supervisor", first_name="Halina", last_name="Zawadzka-Nowicka",
             job_title="Dyrektor Departamentu Spraw Obywatelskich", organizational_unit="Departament Spraw Obywatelskich"),
        User(id="sup-002", role="supervisor", first_name="Tomasz", last_name="Kędzierski",
             job_title="Naczelnik Wydziału Zamówień Publicznych", organizational_unit="Wydział Zamówień Publicznych"),
        User(id="hr-001", role="hr", first_name="Bożena", last_name="Ślęzak",
             job_title="Główny specjalista do spraw kadr", organizational_unit="Biuro Kadr i Szkoleń"),
    ]

    employees = [
        EmployeeRecord(id="emp-001", supervisor_id="sup-001", first_name="Joanna", last_name="Pietrzyk",
                       position_title="Starszy specjalista", organizational_unit="Wydział Skarg i Wniosków",
                       hire_date=date(2019, 3, 1), contract_type="indefinite", assessment_kind="periodic", form="C"),
        EmployeeRecord(id="emp-002", supervisor_id="sup-001", first_name="Grzegorz", last_name="Łuczak",
                       position_title="Radca", organizational_unit="Wydział Prawny",
                       hire_date=date(2016, 9, 15), contract_type="appointment", assessment_kind="periodic", form="C"),
        EmployeeRecord(id="emp-003", supervisor_id="sup-001", first_name="Małgorzata", last_name="Wróbel-Sośnicka",
                       position_title="Naczelnik wydziału", organizational_unit="Wydział Obsługi Interesantów",
                       hire_date=date(2021, 2, 1), contract_type="indefinite", assessment_kind="periodic", form=None),
        EmployeeRecord(id="emp-004", supervisor_id="sup-002", first_name="Paweł", last_name="Żmijewski",
                       position_title="Specjalista", organizational_unit="Wydział Zamówień Publicznych",
                       hire_date=date(2026, 11, 16), contract_type="fixed_term_first", contract_end_date=date(2027, 11, 15),
                       assessment_kind="first", form="first"),
        EmployeeRecord(id="emp-005", supervisor_id="sup-002", first_name="Karolina", last_name="Mazur",
                       position_title="Starszy referent", organizational_unit="Wydział Zamówień Publicznych",
                       hire_date=date(2026, 2, 2), contract_type="fixed_term_first", contract_end_date=date(2027, 2, 1),
                       assessment_kind="first", form="first"),
        EmployeeRecord(id="emp-006", supervisor_id="sup-002", first_name="Adam", last_name="Wilk",
                       position_title="Specjalista", organizational_unit="Wydział Zamówień Publicznych",
                       hire_date=date(2026, 5, 4), contract_type="replacement", contract_end_date=date(2027, 8, 31),
                       first_eval_agreement_date=date(2026, 6, 1), assessment_kind="first", form="first"),
        EmployeeRecord(id="emp-007", supervisor_id="sup-001", first_name="Ewa", last_name="Kubiak",
                       position_title="Główny specjalista", organizational_unit="Wydział Prawny",
                       hire_date=date(2018, 1, 8), contract_type="appointment", assessment_kind="periodic", form="C"),
    ]

    def note(note_id: str, employee_id: str, created: str, text: str) -> tuple[Note, str]:
        return Note(id=note_id, employee_id=employee_id, created_at=_utc(created), text=text), "sup-001"

    notes = [
        note("note-001", "emp-001", "2026-10-02T09:40:00Z", "Samodzielnie przygotowała odpowiedź na skargę zbiorczą mieszkańców, termin dotrzymany mimo dwóch tygodni zastępstwa."),
        note("note-003", "emp-001", "2026-06-17T11:20:00Z", "Zauważyła błędną podstawę prawną w projekcie odpowiedzi kolegi i poprawiła ją przed wysyłką; skarżący nie odwołał się."),
        note("note-004", "emp-001", "2026-03-05T14:00:00Z", "Dwa pisma w lutym wysłane po terminie ustawowym; nie zgłosiła wcześniej ryzyka opóźnienia."),
        note("note-005", "emp-001", "2025-11-24T08:45:00Z", "Przeprowadziła dla zespołu krótkie szkolenie z nowej instrukcji kancelaryjnej po kursie w październiku."),
        note("note-006", "emp-002", "2026-09-09T10:10:00Z", "Opinia do projektu uchwały wskazała dwie kolizje z ustawą; projekt poprawiono przed posiedzeniem zarządu."),
        note("note-002", "emp-003", "2026-09-18T13:05:00Z", "Wprowadziła nowy grafik dyżurów w punkcie obsługi; kolejki w poniedziałki krótsze o około połowę."),
        note("note-008", "emp-007", "2026-08-21T10:00:00Z", "Przygotowała analizę orzecznictwa do sprawy spornej; zarząd przyjął rekomendowane stanowisko bez poprawek."),
        note("note-007", "emp-003", "2026-05-12T09:30:00Z", "Przy awarii systemu kolejkowego w ciągu godziny zorganizowała ręczną obsługę i poinformowała interesantów."),
    ]

    def doc(doc_id: str, employee_id: str, filename: str, uploaded: str, version: int) -> JobDescriptionDocument:
        return JobDescriptionDocument(id=doc_id, employee_id=employee_id, filename=filename,
                                      uploaded_at=_utc(uploaded), version=version, analysis=_analysis(filename))

    job_descriptions = [
        doc("jd-001a", "emp-001", "opis_stanowiska_specjalista_skargi_2022.docx", "2022-11-03T09:15:00Z", 1),
        doc("jd-001", "emp-001", "opis_stanowiska_starszy_specjalista_skargi.docx", "2024-11-20T10:00:00Z", 2),
        doc("jd-002", "emp-002", "opis_stanowiska_radca_wydzial_prawny.docx", "2025-04-30T08:30:00Z", 1),
        # emp-003 celowo bez opisu stanowiska: przed oceną okresową aplikacja prosi o jego wgranie.
    ]

    assessments = [
        AssessmentRecord(id="as-001", employee_id="emp-001", kind="periodic", form="C", status="draft",
                         started_at=_utc("2026-11-12T08:00:00Z"), due_date=date(2026, 12, 9)),
        _history("as-101", "emp-001", "C", "2024-12-09", "positive", {"C10": 7, "C07": 5}, [5, 7, 5, 7, 5]),
        _history(
            "as-102", "emp-001", "C", "2022-12-12", "negative", {"C10": 5}, [3, 1, 3, 5, 3],
            "W okresie oceny siedem z dwudziestu odpowiedzi na skargi zostało wysłanych po terminie ustawowym, "
            "bez wcześniejszej informacji o ryzyku opóźnienia. Pracownica nie skorzystała z zaplanowanego "
            "szkolenia z postępowania administracyjnego.",
        ),
        _history("as-103", "emp-001", "first", "2019-08-28", "positive"),
        _history("as-002", "emp-002", "C", "2025-05-20", "positive", {"C07": 9, "C08": 7, "C09": 5}, [7, 7, 5, 5, 7]),
        _history("as-201", "emp-002", "C", "2023-05-18", "positive", {"C07": 7}, [7, 5, 5, 5, 5]),
        AssessmentRecord(id="as-003", employee_id="emp-003", kind="periodic", form="B", status="not_started",
                         due_date=date(2026, 10, 14)),
        _history("as-301", "emp-003", "B", "2024-10-14", "positive", {"C10": 7, "C11": 7}, [5, 7, 7, 5, 5]),
        _history("as-302", "emp-003", "first", "2021-07-30", "positive"),
        AssessmentRecord(id="as-004", employee_id="emp-004", kind="first", form="first", status="not_started",
                         due_date=date(2027, 11, 14)),
        AssessmentRecord(id="as-005", employee_id="emp-005", kind="first", form="first", status="draft",
                         started_at=_utc("2026-11-18T09:00:00Z"), due_date=date(2027, 1, 1)),
        AssessmentRecord(id="as-006", employee_id="emp-006", kind="first", form="first", status="not_started",
                         due_date=date(2027, 7, 31)),
        _history("as-701", "emp-007", "C", "2024-12-17", "positive", {"C07": 7, "C08": 5}, [7, 7, 5, 5, 7]),
        _history("as-702", "emp-007", "C", "2022-12-15", "positive", {"C07": 7}, [5, 5, 5, 5, 7]),
    ]

    return SeedData(users=users, employees=employees, notes=notes, job_descriptions=job_descriptions, assessments=assessments)
