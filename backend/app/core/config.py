from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any, Final

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


BASE_DIR: Final[Path] = Path(__file__).resolve().parents[2]
DATA_RAW_DIR: Final[Path] = BASE_DIR / "data" / "raw"
DATA_PROCESSED_DIR: Final[Path] = BASE_DIR / "data" / "processed"
TEMPLATES_DIR: Final[Path] = BASE_DIR / "app" / "templates"


class Settings(BaseSettings):
    APP_NAME: str = "Kompas Kompetencji API"
    APP_VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Lista adresów frontendu oddzielona przecinkami (lub JSON). Domyślnie: lokalny serwer Vite.
    # Frontend serwowany z tego samego kontenera (/) nie potrzebuje CORS.
    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
    ALLOW_CREDENTIALS: bool = True
    ALLOWED_METHODS: list[str] = ["*"]
    ALLOWED_HEADERS: list[str] = ["*"]

    COMPETENCY_MODEL_EXCEL_PATH: Path = DATA_RAW_DIR / "Model_kompetencji.xlsx"
    COMPETENCY_MODEL_JSON_PATH: Path = DATA_PROCESSED_DIR / "competency_model.json"

    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None

    LLM_BASE_URL: str | None = None
    LLM_API_KEY: str | None = None
    # Uwierzytelnianie: tokeny JWT (HS256) podpisane JWT_SECRET; nagłówek X-User-Id tylko w testach/dev.
    JWT_SECRET: str | None = None
    AUTH_TOKEN_TTL_MINUTES: int = 480
    AUTH_ALLOW_DEMO_HEADER: bool = False

    LLM_MODEL_NAME: str | None = None
    LLM_MODEL: str | None = None  # alias zgodności wstecznej dla LLM_MODEL_NAME
    LLM_PROVIDER: str | None = None  # opcjonalnie: gemini | openai | groq | openrouter
    LLM_FALLBACK_MODELS: str | None = None  # np. "gemini-3.5-flash,gemini-3.1-flash-lite"; "" = bez zapasowych
    LLM_TEMPERATURE: float = 0.25
    LLM_TIMEOUT_SECONDS: float = 25.0  # limit jednej próby (jednego modelu)
    LLM_TOTAL_BUDGET_SECONDS: float = 55.0  # limit całej odpowiedzi asystenta (z modelami zapasowymi)
    # Po ilu sekundach bez odpowiedzi modelu głównego równolegle startuje model zapasowy.
    LLM_HEDGE_SECONDS: float = 4.0
    # Budżet „myślenia” Gemini (0 = wyłączone, szybkie odpowiedzi; puste = domyślne modelu).
    LLM_THINKING_BUDGET: int | None = 0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @model_validator(mode="before")
    @classmethod
    def _strip_quotes(cls, data: Any) -> Any:
        """`--env-file` (podman/docker) i panele chmurowe przekazują cudzysłowy dosłownie: KEY="wartość"."""
        if isinstance(data, dict):
            return {
                k: (v.strip().strip("'\"").strip() if isinstance(v, str) else v)
                for k, v in data.items()
            }
        return data


    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            raw = value.strip().strip("'\"")
            if not raw:
                return ["http://localhost:5173", "http://127.0.0.1:5173"]
            if raw.startswith("["):
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip().strip("'\"") for item in raw.split(",") if item.strip().strip("'\"")]
        return ["*"]


CRITERION_RZETELNOSC: Final[str] = "Rzetelność"
CRITERION_KOMUNIKACJA: Final[str] = "Komunikacja"
CRITERION_WYKORZYSTYWANIE_WIEDZY: Final[str] = "Wykorzystywanie wiedzy i doskonalenie zawodowe"
CRITERION_ORGANIZACJA_PRACY: Final[str] = "Organizacja pracy i orientacja na osiąganie celów"
CRITERION_KREATYWNOSC: Final[str] = "Kreatywność"
CRITERION_WSPOLPRACA: Final[str] = "Współpraca"
CRITERION_MYSLENIE_ANALITYCZNE: Final[str] = "Myślenie analityczne"
CRITERION_NEGOCJOWANIE: Final[str] = "Negocjowanie"
CRITERION_WYSTAPIENIA_PUBLICZNE: Final[str] = "Wystąpienia publiczne"
CRITERION_ORIENTACJA_NA_KLIENTA: Final[str] = "Orientacja na klienta/interesanta"
CRITERION_SYTUACJE_KRYZYSOWE: Final[str] = "Radzenie sobie w sytuacjach kryzysowych"
CRITERION_ZARZADZANIE_STRATEGICZNE: Final[str] = "Zarządzanie strategiczne"
CRITERION_ZARZADZANIE_LUDZMI: Final[str] = "Zarządzanie ludźmi"
CRITERION_PODEJMOWANIE_DECYZJI: Final[str] = "Podejmowanie decyzji i odpowiedzialność"

STATUTORY_CRITERIA_CATALOG: Final[tuple[str, ...]] = (
    CRITERION_RZETELNOSC,
    CRITERION_KOMUNIKACJA,
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_KREATYWNOSC,
    CRITERION_WSPOLPRACA,
    CRITERION_MYSLENIE_ANALITYCZNE,
    CRITERION_NEGOCJOWANIE,
    CRITERION_WYSTAPIENIA_PUBLICZNE,
    CRITERION_ORIENTACJA_NA_KLIENTA,
    CRITERION_SYTUACJE_KRYZYSOWE,
    CRITERION_ZARZADZANIE_STRATEGICZNE,
    CRITERION_ZARZADZANIE_LUDZMI,
    CRITERION_PODEJMOWANIE_DECYZJI,
)

EXPECTED_INDICATOR_COUNTS: Final[dict[str, int]] = {
    CRITERION_RZETELNOSC: 2,
    CRITERION_KOMUNIKACJA: 4,
    CRITERION_WYKORZYSTYWANIE_WIEDZY: 3,
    CRITERION_ORGANIZACJA_PRACY: 5,
    CRITERION_KREATYWNOSC: 2,
    CRITERION_WSPOLPRACA: 6,
    CRITERION_MYSLENIE_ANALITYCZNE: 3,
    CRITERION_NEGOCJOWANIE: 3,
    CRITERION_WYSTAPIENIA_PUBLICZNE: 4,
    CRITERION_ORIENTACJA_NA_KLIENTA: 2,
    CRITERION_SYTUACJE_KRYZYSOWE: 3,
    CRITERION_ZARZADZANIE_STRATEGICZNE: 3,
    CRITERION_ZARZADZANIE_LUDZMI: 6,
    CRITERION_PODEJMOWANIE_DECYZJI: 3,
}
EXPECTED_TOTAL_COMPETENCIES: Final[int] = 14
EXPECTED_TOTAL_INDICATORS: Final[int] = 49
EXPECTED_RATING_LEVELS_COUNT: Final[int] = 5

MANDATORY_CRITERIA_FORM_A: Final[tuple[str, ...]] = (
    CRITERION_ZARZADZANIE_LUDZMI,
    CRITERION_PODEJMOWANIE_DECYZJI,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_WSPOLPRACA,
    CRITERION_KOMUNIKACJA,
    CRITERION_ZARZADZANIE_STRATEGICZNE,
)

MANDATORY_CRITERIA_FORM_B: Final[tuple[str, ...]] = (
    CRITERION_ZARZADZANIE_LUDZMI,
    CRITERION_PODEJMOWANIE_DECYZJI,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_WSPOLPRACA,
    CRITERION_KOMUNIKACJA,
)

MANDATORY_CRITERIA_FORM_C: Final[tuple[str, ...]] = (
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_RZETELNOSC,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_WSPOLPRACA,
    CRITERION_KOMUNIKACJA,
)

MANDATORY_CRITERIA_FIRST_EVAL: Final[tuple[str, ...]] = (
    CRITERION_RZETELNOSC,
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_KOMUNIKACJA,
    CRITERION_WSPOLPRACA,
)

MAX_ADDITIONAL_CRITERIA_PERIODIC: Final[int] = 3
MAX_ADDITIONAL_CRITERIA_FIRST_EVAL: Final[int] = 0

PERIODIC_ALLOWED_SCORES: Final[frozenset[int]] = frozenset({1, 3, 5, 7, 9})
FIRST_EVAL_ALLOWED_SCORES: Final[frozenset[int]] = frozenset({3, 5, 7})

PERIODIC_SCORE_LABELS: Final[dict[int, str]] = {
    1: "znacznie poniżej oczekiwań",
    3: "poniżej oczekiwań",
    5: "na poziomie oczekiwań",
    7: "powyżej oczekiwań",
    9: "znacznie powyżej oczekiwań",
}

FIRST_EVAL_SCORE_LABELS: Final[dict[int, str]] = {
    3: "poniżej oczekiwań",
    5: "na poziomie oczekiwań",
    7: "powyżej oczekiwań",
}

PERIODIC_OVERALL_THRESHOLDS: Final[tuple[tuple[float, float, bool, str, bool], ...]] = (
    (1.0, 2.0, True, "znacznie poniżej oczekiwań", False),
    (2.0, 4.0, False, "poniżej oczekiwań", False),
    (4.0, 6.0, False, "na poziomie oczekiwań", True),
    (6.0, 8.0, False, "powyżej oczekiwań", True),
    (8.0, 9.0, False, "znacznie powyżej oczekiwań", True),
)

FIRST_EVAL_MIN_AVERAGE_SCORE: Final[float] = 5.0
FIRST_EVAL_MAX_COUNT_OF_SCORE_3: Final[int] = 1
PERIODIC_CRITICAL_FAIL_SCORE: Final[int] = 1
IPRZ_RECOMMENDED_THRESHOLD_SCORE: Final[int] = 3

FIRST_EVAL_INITIAL_INTERVIEW_DAYS: Final[int] = 21
FIRST_EVAL_MIN_WORKED_MONTHS_FOR_REPORT: Final[int] = 7
FIRST_EVAL_REPORT_AFTER_MONTHS: Final[int] = 8
FIRST_EVAL_DEFAULT_CONTRACT_MONTHS: Final[int] = 12
FIRST_EVAL_MIN_MONTHS_BEFORE_CONTRACT_END: Final[int] = 1

PERIODIC_CRITERIA_SETUP_DAYS_STANDARD: Final[int] = 30
PERIODIC_CRITERIA_SETUP_DAYS_AFTER_NEGATIVE: Final[int] = 7
PERIODIC_STANDARD_INTERVAL_MONTHS: Final[int] = 24
PERIODIC_AFTER_NEGATIVE_INTERVAL_MONTHS: Final[int] = 6
PERIODIC_POSITION_CHANGE_MIN_MONTHS: Final[int] = 6
PERIODIC_POSITION_CHANGE_DAYS_BEFORE: Final[int] = 7
PERIODIC_POSITION_CHANGE_DAYS_AFTER: Final[int] = 30
APPEAL_DEADLINE_DAYS: Final[int] = 7


def normalize_criterion_name(raw_name: str) -> str:
    cleaned = " ".join(raw_name.strip().rstrip(".,;").split()).casefold()
    for canonical in STATUTORY_CRITERIA_CATALOG:
        if canonical.casefold() == cleaned:
            return canonical
    return " ".join(raw_name.strip().split())


settings = Settings()
