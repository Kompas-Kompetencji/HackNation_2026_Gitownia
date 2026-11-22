from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


FormVariant = Literal["pierwsza_ocena", "okresowa_A", "okresowa_B", "okresowa_C"]
FieldKind = Literal[
    "text", "textarea", "number", "select", "multiselect", "boolean", "date", "score"
]


class FormFieldDefinition(BaseModel):
    """Pojedyncze pole aktywnego formularza przesyłane dynamicznie z dowolnego frontendu."""

    model_config = ConfigDict(extra="ignore")

    field_id: str = Field(..., min_length=1, description="Unikalny identyfikator pola w UI")
    label: str = Field(..., min_length=1, description="Etykieta pola czytelna dla człowieka")
    field_type: FieldKind = Field(default="text")
    options: list[str | int] | None = Field(default=None, description="Dozwolone wartości pola")
    current_value: Any = Field(default=None, description="Aktualna wartość w formularzu")
    changed: bool = Field(default=False, description="Czy pole zmieniło się od ostatniego wywołania")


class AnonymizedEmployeeContext(BaseModel):
    """Zanonimizowany kontekst stanowiska (RODO: zero imion, nazwisk i PESEL!)."""

    model_config = ConfigDict(extra="ignore")

    stanowisko: str = Field(default="specjalista", description="Nazwa stanowiska pracy")
    komorka_organizacyjna: str = Field(default="", description="Wydział / departament")
    status_sluzby: Literal["PRACOWNIK_SC", "URZEDNIK_SC"] = Field(default="PRACOWNIK_SC")
    opis_zadan_osp: str = Field(default="", description="Główne zadania z OSP (bez danych osobowych)")
    podsumowanie_sprawozdania: str = Field(
        default="", description="Streszczenie sprawozdania ocenianego (dla pierwszej oceny)"
    )


class FormSchemaState(BaseModel):
    """
    Form-agnostic kontrakt formularza. Backend nie hardcoduje nazw pól UI –
    operuje na przekazanej liście `fields` oraz ustrukturyzowanych ocenach cząstkowych.
    """

    model_config = ConfigDict(extra="ignore")

    form_type: FormVariant = Field(default="okresowa_C")
    fields: list[FormFieldDefinition] = Field(default_factory=list)
    employee_context: AnonymizedEmployeeContext = Field(default_factory=AnonymizedEmployeeContext)

    # Oceny cząstkowe i kryteria dodatkowe do deterministycznej walidacji w Pythonie przed wywołaniem LLM
    scores: dict[str, int | None] = Field(
        default_factory=dict,
        description="Mapa: nazwa_kryterium -> ocena (1/3/5/7/9 lub 3/5/7; None = brak podstaw / niewypełnione)",
    )
    additional_criteria: list[str] = Field(
        default_factory=list,
        description="Wybrane kryteria dodatkowe (0–3 dla oceny okresowej)",
    )
    star_notes: dict[str, str] = Field(
        default_factory=dict,
        description="Zanonimizowane obserwacje zachowań STAR (Sytuacja - Działanie - Rezultat)",
    )
    egzamin_sluzba_przygotowawcza: Literal["TAK", "NIE", "NIE_DOTYCZY"] | None = None
    sprawozdanie_w_terminie: bool | None = None


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=6000)


class RagSourceCitation(BaseModel):
    """Dokładne źródło prawne z zaindeksowanych PDF-ów."""

    model_config = ConfigDict(extra="forbid")

    dokument: str
    paragraf_artykul: str
    strona: str
    excerpt: str
    # Pełna treść fragmentu dla modelu LLM (nie trafia do odpowiedzi API)
    full_text: str = Field(default="", exclude=True)
    # Trafność dopasowania z wyszukiwania (0–1+); do oceny pokrycia źródłami, nie trafia do API
    score: float = Field(default=0.0, exclude=True)


class FormPatch(BaseModel):
    """Propozycja zmiany pola formularza (Human-in-the-loop: zawsze wymaga akceptacji przełożonego)."""

    model_config = ConfigDict(extra="forbid")

    field_id: str
    suggested_value: Any
    rationale: str
    requires_approval: bool = True


class DeterministicEvalSummary(BaseModel):
    """Twarde wyliczenie matematyczno-prawne w Pythonie (zero liczenia przez LLM)."""

    model_config = ConfigDict(extra="forbid")

    form_type: FormVariant
    mandatory_criteria: list[str]
    allowed_additional_pool: list[str]
    allowed_scale: list[int]
    average: float | None
    overall_level: str | None
    verdict: Literal["POZYTYWNA", "NEGATYWNA", "NIEKOMPLETNA"]
    verdict_reasons: list[str]
    low_scored_criteria: list[str]
    justification_mandatory: bool
    dev_plan_allowed: bool
    next_rank_eligible: bool
    validation_errors: list[str]


class FormalChatRequest(BaseModel):
    """Wejście do okna 'Asystent formalny' (obsługuje tryb Q&A RAG oraz Real-Time Form Autofill)."""

    model_config = ConfigDict(extra="ignore")

    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatTurn] = Field(default_factory=list)
    form_state: FormSchemaState | None = None


class FormalChatResponse(BaseModel):
    """Ustrukturyzowana odpowiedź Asystenta formalnego."""

    model_config = ConfigDict(extra="forbid")

    intent: Literal["QA", "FORM_AUTOFILL"]
    answer: str
    refused: bool = Field(
        default=False,
        description="True, gdy brak pokrycia w zaindeksowanych aktach prawnych i poradnikach KPRM",
    )
    sources: list[RagSourceCitation] = Field(default_factory=list)
    form_patches: list[FormPatch] = Field(default_factory=list)
    deterministic_summary: DeterministicEvalSummary | None = None
    pii_redacted: bool = False
    provider: str = "gemini"


class CoachingAssistantRequest(BaseModel):
    """Wejście do stale aktywnego 'Asystenta rozmowy' w prawym panelu."""

    model_config = ConfigDict(extra="ignore")

    form_state: FormSchemaState
    question: str | None = Field(
        default=None,
        max_length=3000,
        description="Opcjonalne dopytanie przełożonego; gdy puste -> generuje proaktywny briefing",
    )
    history: list[ChatTurn] = Field(default_factory=list)


class CoachingAssistantResponse(BaseModel):
    """Adaptacyjny briefing i odpowiedź Asystenta rozmowy (dopasowany do wyniku POZYTYWNA / NEGATYWNA)."""

    model_config = ConfigDict(extra="forbid")

    deterministic_summary: DeterministicEvalSummary
    mode_tone: Literal["POSITIVE_DEVELOPMENTAL", "NEGATIVE_CORRECTIVE", "INCOMPLETE_PREPARATION"]
    coach_reply: str = Field(..., description="Główna wskazówka / odpowiedź dla przełożonego")
    conversation_questions: list[str] = Field(
        default_factory=list,
        description="Pytania otwarte i dialogiczne do zadania pracownikowi podczas rozmowy",
    )
    star_arguments: list[str] = Field(
        default_factory=list,
        description="Uporządkowane argumenty behawioralne oparte na faktach (zero ocen personalnych)",
    )
    justification_draft: str = Field(
        default="",
        description="Gotowy szkic uzasadnienia oceny do akceptacji przez przełożonego",
    )
    iprz_recommendations: list[str] = Field(
        default_factory=list,
        description="Propozycje rozwojowe / naprawcze do IPRZ (lub puste, gdy niedozwolone w negatywnej I ocenie)",
    )
    rank_promotion_hint: str | None = Field(
        default=None,
        description="Informacja o możliwości wnioskowania o kolejny stopień służbowy (art. 89 ust. 1)",
    )
    suggested_patches: list[FormPatch] = Field(
        default_factory=list,
        description="Gotowe patche (np. wstawienie szkicu uzasadnienia i IPRZ jednym kliknięciem)",
    )
    sources: list[RagSourceCitation] = Field(
        default_factory=list,
        description="Fragmenty poradników/przepisów (RAG), na których oparto wskazówki do rozmowy",
    )
    pii_redacted: bool = False
    provider: str = "gemini"