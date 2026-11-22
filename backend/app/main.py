from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

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
from app.data.supabase_repo import SupabaseError
from app.services.llm_client import llm_status
from app.routers.auth_dep import require_user
from scripts.parse_excel import build_output_document, build_seed_competencies

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("kompas")

# Zbudowany frontend (Vite) kopiowany do obrazu przez Dockerfile; lokalnie katalog nie istnieje.
FRONTEND_DIST = Path(__file__).resolve().parents[1] / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Przy starcie: połączenie z bazą i idempotentna migracja schematu (błąd nie zatrzymuje API)."""
    from app.data.factory import get_data_service
    from app.data.settings import data_settings

    try:
        get_data_service()
        logger.info("Warstwa danych gotowa: %s", data_settings.backend)
    except Exception as exc:  # baza niedostępna – API (AI, reguły, PDF) działa dalej
        logger.error("Warstwa danych (%s) niedostępna przy starcie: %s", data_settings.backend, exc)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    description=(
        "Kompas Kompetencji: reguły prawne służby cywilnej (pierwsza ocena i ocena okresowa), "
        "model kompetencji, parser OSP (.docx), terminy, generator urzędowych arkuszy PDF, "
        "dane ocen (Supabase/Postgres) oraz asystent AI z RAG i cytowaniem źródeł."
    ),
)


@app.exception_handler(SupabaseError)
async def database_error_handler(_request: Request, exc: SupabaseError) -> JSONResponse:
    logger.error("Błąd bazy danych: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Baza danych jest chwilowo niedostępna. Spróbuj ponownie za chwilę."},
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
    from app.data.factory import get_data_service
    from app.data.settings import data_settings
    from app.services.rag_service import knowledge_base_stats

    model_data = _load_competency_model()
    database: dict[str, Any] = {"backend": data_settings.backend, "ok": True}
    try:
        repo = get_data_service().repo
        if hasattr(repo, "ping"):
            repo.ping()
    except Exception as exc:
        database = {"backend": data_settings.backend, "ok": False, "error": type(exc).__name__}
    return {
        "status": "ok" if database["ok"] else "degraded",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "competency_model_source": model_data.get("source"),
        "competencies_loaded": model_data["summary"]["competencies_count"],
        "indicators_loaded": model_data["summary"]["behavioral_indicators_count"],
        "database": database,
        "llm": llm_status(),
        "rag": knowledge_base_stats(),
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


@router.post("/osp/parse", response_model=OspParseResult, tags=["Parser OSP"], dependencies=[Depends(require_user)])
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
    dependencies=[Depends(require_user)],
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


# --- Frontend (SPA) z tego samego kontenera: jeden adres dla jury, bez CORS --------------------

_RESERVED_PREFIXES = ("api/", "ai/", "ai-assistant", "docs", "redoc", "openapi.json")


@app.get("/", include_in_schema=False)
def root() -> Response:
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse({"status": "ok", "service": settings.APP_NAME, "docs": "/docs", "health": "/api/v1/health"})


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str) -> Response:
    if full_path.startswith(_RESERVED_PREFIXES) or not FRONTEND_DIST.is_dir():
        raise HTTPException(status_code=404, detail="Nie znaleziono zasobu.")
    candidate = (FRONTEND_DIST / full_path).resolve()
    if candidate.is_file() and FRONTEND_DIST.resolve() in candidate.parents:
        return FileResponse(candidate)
    return FileResponse(FRONTEND_DIST / "index.html")
