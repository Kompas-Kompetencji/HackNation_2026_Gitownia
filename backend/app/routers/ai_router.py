from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.schemas.form_contract import (
    CoachingAssistantRequest,
    CoachingAssistantResponse,
    FormalChatRequest,
    FormalChatResponse,
    FormSchemaState,
)
from app.services.coaching_service import run_coaching_assistant
from app.services.rag_service import process_formal_chat

ai_router = APIRouter(tags=["AI - Kompas Kompetencji (RAG + Autofill + Coaching)"])


@ai_router.post("/ai/formal-chat", response_model=FormalChatResponse)
async def formal_chat_endpoint(payload: FormalChatRequest) -> FormalChatResponse:
    """
    Okienko czatowe 'Asystent formalny':
    1) Q&A z twardym progiem RAG w ChromaDB i cytowaniem dokumentu, §/art. i strony (lub `refused: true`),
    2) Real-Time Form Autofill zwracający `form_patches` do akceptacji (Human-in-the-loop).
    """
    return await process_formal_chat(payload)


@ai_router.post("/ai/coaching-assistant", response_model=CoachingAssistantResponse)
async def coaching_assistant_endpoint(payload: CoachingAssistantRequest) -> CoachingAssistantResponse:
    """
    Stale aktywny 'Asystent rozmowy':
    Adaptuje pytania, argumenty STAR, szkic uzasadnienia i plan IPRZ do wyniku POZYTYWNA / NEGATYWNA.
    """
    return await run_coaching_assistant(payload)


# ============================================================================
# MOST KOMPATYBILNOŚCI 1:1 DLA ISTNIEJĄCEGO FRONTENDU ZESPOŁU (`frontend/src/lib/api.ts`)
# ============================================================================


class LegacyFrontendAssistantReq(BaseModel):
    question: str
    mode: Literal["formal", "interview"]


@ai_router.post("/ai-assistant")
async def legacy_frontend_assistant_bridge(req: LegacyFrontendAssistantReq) -> dict[str, Any]:
    """Bezpośrednie wsparcie kontraktu `askAiAssistant(question, mode)` z `frontend/src/lib/api.ts`."""
    if req.mode == "formal":
        res = await process_formal_chat(FormalChatRequest(message=req.question))
        if res.refused:
            return {"mode": "formal", "status": "no_data", "answer": "", "sources": []}
        return {
            "mode": "formal",
            "status": "answered",
            "answer": res.answer,
            "sources": [
                {
                    "document_title": s.dokument,
                    "location": f"{s.paragraf_artykul}, str. {s.strona}",
                    "excerpt": s.excerpt,
                }
                for s in res.sources
            ],
        }

    coach = await run_coaching_assistant(
        CoachingAssistantRequest(form_state=FormSchemaState(), question=req.question)
    )
    return {
        "mode": "interview",
        "status": "answered",
        "answer": coach.coach_reply,
        "sources": [
            {
                "document_title": "Poradnik KPRM: Oceny okresowe i pierwsza ocena w służbie cywilnej",
                "location": "Metodyka rozmowy oceniającej i modelu STAR",
                "excerpt": coach.conversation_questions[0] if coach.conversation_questions else "Rozmowa dialogiczna oparta na zachowaniach.",
            }
        ],
    }