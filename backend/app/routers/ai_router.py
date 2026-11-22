from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.schemas.form_contract import (
    ChatTurn,
    CoachingAssistantRequest,
    CoachingAssistantResponse,
    FormalChatRequest,
    FormalChatResponse,
    FormSchemaState,
)
from app.data.schemas import User
from app.routers.auth_dep import require_user
from app.services.ai_quality import (
    PERSON_DECISION_ANSWER,
    asks_for_person_decision,
    coverage_of,
    record_unanswered,
    run_quality_check,
    unanswered_log,
)
from app.services.coaching_service import run_coaching_assistant
from app.services.llm_client import llm_status
from app.services.rag_service import knowledge_base_stats, process_formal_chat

ai_router = APIRouter(tags=["AI - Kompas Kompetencji (RAG + Autofill + Coaching)"])


@ai_router.get("/ai/status")
def ai_status_endpoint() -> dict[str, Any]:
    """Stan asystenta: skonfigurowany dostawca LLM (bez klucza) i rozmiar bazy wiedzy RAG."""
    return {"llm": llm_status(), "knowledge_base": knowledge_base_stats()}


@ai_router.get("/ai/quality")
def ai_quality_endpoint(user: Annotated[User, Depends(require_user)]) -> dict[str, Any]:
    """Wiarygodność asystenta (kadry/administrator): test kontrolny na banku pytań i pytania bez odpowiedzi."""
    if user.role != "hr":
        raise HTTPException(status_code=403, detail="Raport jakości asystenta jest dostępny dla kadr (administratora).")
    return {"check": run_quality_check(), "unanswered": unanswered_log()}


@ai_router.post("/ai/formal-chat", response_model=FormalChatResponse, dependencies=[Depends(require_user)])
async def formal_chat_endpoint(payload: FormalChatRequest) -> FormalChatResponse:
    """
    Okienko czatowe 'Asystent formalny':
    1) Q&A z twardym progiem RAG w ChromaDB i cytowaniem dokumentu, §/art. i strony (lub `refused: true`),
    2) Real-Time Form Autofill zwracający `form_patches` do akceptacji (Human-in-the-loop).
    """
    return await process_formal_chat(payload)


@ai_router.post("/ai/coaching-assistant", response_model=CoachingAssistantResponse, dependencies=[Depends(require_user)])
async def coaching_assistant_endpoint(payload: CoachingAssistantRequest) -> CoachingAssistantResponse:
    """
    Stale aktywny 'Asystent rozmowy':
    Adaptuje pytania, argumenty STAR, szkic uzasadnienia i plan IPRZ do wyniku POZYTYWNA / NEGATYWNA.
    """
    return await run_coaching_assistant(payload)


# ============================================================================
# MOST KOMPATYBILNOŚCI 1:1 DLA ISTNIEJĄCEGO FRONTENDU ZESPOŁU (`frontend/src/lib/api.ts`)
# ============================================================================


_REF_MARKERS = re.compile(r"\s*\[\d+(?:\s*[,–-]\s*\d+)*\]")


def _strip_refs(text: str) -> str:
    """Znaczniki [1], [2, 3] z odpowiedzi modelu – panel pokazuje źródła osobno."""
    return _REF_MARKERS.sub("", text).strip()


class LegacyFrontendAssistantReq(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    mode: Literal["formal", "interview"]
    # Kontekst rozmowy w panelu (ostatnie wymiany) – pytania doprecyzowujące typu „a w pierwszej ocenie?”.
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    # Zanonimizowany stan arkusza (tylko asystent rozmowy): poziomy, wybrane zachowania, przykłady STAR.
    form_state: FormSchemaState | None = None


def _bullets(title: str, items: list[str]) -> str:
    items = [i.strip() for i in items if i and i.strip()]
    return f"\n\n{title}:\n" + "\n".join(f"• {i}" for i in items) if items else ""


def _src(s: Any) -> dict[str, str]:
    return {"document_title": s.dokument, "location": f"{s.paragraf_artykul}, str. {s.strona}", "excerpt": s.excerpt}


@ai_router.post("/ai-assistant", dependencies=[Depends(require_user)])
async def legacy_frontend_assistant_bridge(req: LegacyFrontendAssistantReq) -> dict[str, Any]:
    """Kontrakt `askAiAssistant(question, mode, {history, formState})` z `frontend/src/lib/api.ts`."""
    # AI nie wskazuje poziomu ani wyniku oceny konkretnej osoby (decyzja należy do przełożonego).
    if asks_for_person_decision(req.question):
        return {"mode": req.mode, "status": "answered", "answer": PERSON_DECISION_ANSWER, "sources": [], "guard": "person_decision"}

    if req.mode == "formal":
        res = await process_formal_chat(FormalChatRequest(message=req.question, history=req.history[-6:]))
        if res.refused or not res.sources:
            record_unanswered(req.question, "formal")
            return {"mode": "formal", "status": "no_data", "answer": "", "sources": []}
        return {
            "mode": "formal",
            "status": "answered",
            "answer": _strip_refs(res.answer),
            "sources": [_src(s) for s in res.sources],
            "coverage": coverage_of(res.sources),
        }

    has_form = req.form_state is not None and any(v is not None for v in req.form_state.scores.values())
    coach = await run_coaching_assistant(
        CoachingAssistantRequest(
            form_state=req.form_state or FormSchemaState(),
            question=req.question,
            history=req.history[-6:],
        )
    )
    answer = coach.coach_reply
    answer += _bullets("Propozycje pytań do pracownika", coach.conversation_questions)
    if has_form:
        answer += _bullets("Argumenty oparte na zachowaniach (do omówienia)", coach.star_arguments)
        answer += _bullets("Propozycje rozwojowe", coach.iprz_recommendations)
        if coach.rank_promotion_hint:
            answer += f"\n\n{coach.rank_promotion_hint}"
    # Tylko rzeczywiście wyszukane fragmenty – bez „stałego” źródła, którego asystent nie użył.
    sources = [_src(s) for s in coach.sources]
    out: dict[str, Any] = {
        "mode": "interview",
        "status": "answered",
        "answer": _strip_refs(answer),
        "sources": sources,
        "coverage": coverage_of(coach.sources),
    }
    wants_draft = re.search(r"uzasadni|argument|szkic|podsumow|przygotuj", req.question, re.IGNORECASE)
    if has_form and wants_draft and coach.justification_draft.strip():
        out["justification_draft"] = _strip_refs(coach.justification_draft)
    return out
