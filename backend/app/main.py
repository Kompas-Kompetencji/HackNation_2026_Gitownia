from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.core.config import settings
from app.core.deadline_calc import calculate_deadlines
from app.core.scoring_engine import evaluate
from app.schemas.models import (
    DeadlineRequest,
    DeadlineResponse,
    EvaluationRequest,
    EvaluationResponse,
    FormType,
    OspParseResult,
)
from app.services.osp_parser import parse_osp_docx
from app.services.pdf_generator import generate_evaluation_pdf
from scripts.parse_excel import build_output_document, build_seed_competencies

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Deterministyczny, bezbazodanowy mikroserwis reguł prawnych służby cywilnej, "
        "parsera OSP (.docx), kalkulatora terminów oraz generatora urzędowych arkuszy PDF."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=settings.ALLOW_CREDENTIALS,
    allow_methods=settings.ALLOWED_METHODS,
    allow_headers=settings.ALLOWED_HEADERS,
    expose_headers=["Content-Disposition"],
)

router = APIRouter(prefix=settings.API_V1_PREFIX)


def _load_competency_model() -> dict[str, Any]:
    """Wczytuje competency_model.json z dysku lub generuje go w locie ze specyfikacji ustawowej."""
    path = settings.COMPETENCY_MODEL_JSON_PATH
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))

    competencies = build_seed_competencies()
    payload = build_output_document(competencies, source_label="runtime_fallback_seed")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


@router.get("/health", tags=["System"])
def health_check() -> dict[str, Any]:
    """1. Sprawdzenie stanu usługi i dostępności modelu kompetencji."""
    model_data = _load_competency_model()
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "competencies_loaded": model_data["summary"]["competencies_count"],
        "indicators_loaded": model_data["summary"]["behavioral_indicators_count"],
    }


@router.get("/competencies", tags=["Model Kompetencji"])
def get_competencies(
    form_type: FormType | None = Query(
        default=None,
        description="Opcjonalny filtr zwracający oznaczenie obowiązkowości pod konkretny formularz (FORM_B, FORM_C, FIRST_EVAL_FORM)",
    ),
) -> dict[str, Any]:
    """2. Zwraca pełny Model Kompetencji Służby Cywilnej (14 kompetencji, 49 wskaźników, 5 poziomów)."""
    model_data = _load_competency_model()
    if form_type is None:
        return model_data

    flag_map = {
        FormType.FORM_B: "mandatory_for_B",
        FormType.FORM_C: "mandatory_for_C",
        FormType.FIRST_EVAL_FORM: "mandatory_for_first_eval",
    }
    flag_key = flag_map[form_type]

    enriched = []
    for comp in model_data["competencies"]:
        comp_copy = dict(comp)
        comp_copy["is_mandatory_for_selected_form"] = bool(comp.get(flag_key, False))
        enriched.append(comp_copy)

    return {
        **model_data,
        "selected_form_type": form_type,
        "competencies": enriched,
    }


@router.post("/osp/parse", response_model=OspParseResult, tags=["Parser OSP"])
async def upload_and_parse_osp(
    file: UploadFile = File(..., description="Plik Opisu Stanowiska Pracy w formacie .docx"),
) -> OspParseResult:
    """3. Parsuje plik .docx Opisu Stanowiska Pracy i deterministycznie rekomenduje Arkusz B lub C."""
    filename = file.filename or "opis_stanowiska.docx"
    content = await file.read()
    try:
        return parse_osp_docx(file_bytes=content, filename=filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/deadlines/calculate", response_model=DeadlineResponse, tags=["Terminy Ustawowe"])
def compute_evaluation_deadlines(payload: DeadlineRequest) -> DeadlineResponse:
    """4. Wylicza daty graniczne oceny z uwzględnieniem świąt, art. 112 KC, art. 115 KC i nieobecności."""
    return calculate_deadlines(payload)


@router.post("/evaluations/evaluate", response_model=EvaluationResponse, tags=["Silnik Oceniania"])
def validate_and_score_evaluation(payload: EvaluationRequest) -> EvaluationResponse:
    """5. Waliduje kryteria, skale i warunki ustawowe oraz wylicza wiążący werdykt oceny."""
    return evaluate(payload)


@router.post(
    "/evaluations/pdf",
    tags=["Generator PDF"],
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "Wygenerowany urzędowy arkusz oceny w formacie PDF (A4).",
        }
    },
)
def export_evaluation_pdf(payload: EvaluationRequest) -> Response:
    """6. Generuje gotowy do druku i podpisu urzędowy dokument PDF (Arkusz B, Arkusz C lub Pierwsza Ocena)."""
    eval_result = evaluate(payload)
    pdf_bytes = generate_evaluation_pdf(request=payload, result=eval_result)

    filename_map = {
        FormType.FORM_B: "Arkusz_B_ocena_okresowa.pdf",
        FormType.FORM_C: "Arkusz_C_ocena_okresowa.pdf",
        FormType.FIRST_EVAL_FORM: "Arkusz_pierwszej_oceny.pdf",
    }
    download_name = filename_map.get(payload.form_type, "Arkusz_oceny_sluzba_cywilna.pdf")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
        },
    )


app.include_router(router)
from app.routers.ai_router import ai_router

# Rejestracja zarówno bezpośrednio pod /ai/... , pod /api/... (proxy Vite z frontend/), jak i /api/v1/ai/...
app.include_router(ai_router)
app.include_router(ai_router, prefix="/api")
app.include_router(ai_router, prefix=settings.API_V1_PREFIX)

# Trasy danych (pracownicy, notatki, opisy stanowiska, oceny) i wskazówka poziomu: /api/v1/...
from app.routers.data_router import data_router  # noqa: E402

app.include_router(data_router, prefix=settings.API_V1_PREFIX)
