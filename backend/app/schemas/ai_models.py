from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.models import (
    DeadlineRequest,
    DeadlineResponse,
    EvaluationRequest,
    EvaluationResponse,
    EvaluationType,
    FormType,
    OspParseResult,
)


class ChatAssistantType(StrEnum):
    OSP_ADVISOR = "OSP_ADVISOR"
    START_EVALUATION = "START_EVALUATION"
    FINISH_EVALUATION = "FINISH_EVALUATION"
    FORMAL_ASSISTANT = "FORMAL_ASSISTANT"
    CONVERSATION_COACHING = "CONVERSATION_COACHING"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=12000)


class AiChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistant_type: ChatAssistantType = ChatAssistantType.FORMAL_ASSISTANT
    evaluation_type: EvaluationType = EvaluationType.PERIODIC_EVALUATION
    messages: list[ChatMessage] = Field(..., min_length=1)
    osp_context: OspParseResult | None = None
    evaluation_context: EvaluationRequest | None = None
    deadline_context: DeadlineRequest | None = None


class AiChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistant_type: ChatAssistantType
    reply: str
    provider: str
    model: str
    quick_replies: list[str] = Field(default_factory=list)
    m1_evaluation_check: EvaluationResponse | None = None
    m1_deadline_check: DeadlineResponse | None = None


class CriterionSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    rationale: str
    behavioral_indicators: list[str]


class OspAnalysisAiResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zalecany_arkusz: FormType
    mandatory_criteria: list[str]
    suggested_additional_criteria: list[CriterionSuggestion]
    proposed_goals: list[str]
    advisor_comment: str
    provider: str


class AutoDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evaluation: EvaluationRequest
    osp_context: OspParseResult | None = None
    supervisor_notes: str | None = None


class AutoDraftResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    m1_validation: EvaluationResponse
    uzasadnienie_draft: str
    wnioski_rozwojowe_draft: str | None
    umotywowanie_stopnia_draft: str | None
    conversation_agenda: list[str]
    provider: str
