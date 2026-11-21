from __future__ import annotations

import io
import logging
import re
from datetime import date
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import (
    MANDATORY_CRITERIA_FIRST_EVAL,
    MANDATORY_CRITERIA_FORM_B,
    MANDATORY_CRITERIA_FORM_C,
    MAX_ADDITIONAL_CRITERIA_PERIODIC,
    TEMPLATES_DIR,
    normalize_criterion_name,
)
from app.core.scoring_engine import evaluate
from app.schemas.models import (
    CivilServiceStatus,
    EvaluationRequest,
    EvaluationResponse,
    EvaluationType,
    FormType,
)

logger = logging.getLogger(__name__)

XHTML2PDF_POLISH_FONT_FAMILY = "PolishGovSerif"
_XHTML2PDF_FONT_REGISTERED: bool = False
_LINK_CSS_REGEX = re.compile(
    r'<link\s+[^>]*href=["\']base_gov\.css["\'][^>]*>',
    flags=re.IGNORECASE,
)


def _fmt_date(value: date | None) -> str:
    """Formatuje obiekt daty do polskiego formatu urzędowego dd.mm.rrrr."""
    if value is None:
        return ""
    return value.strftime("%d.%m.%Y")


def _fmt_score(value: float | None) -> str:
    """Formatuje średnią ocen cząstkowych z polskim przecinkiem dziesiętnym (np. 6,71)."""
    if value is None:
        return ""
    return f"{value:.2f}".replace(".", ",")


def _create_jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR), encoding="utf-8"),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["fmt_date"] = _fmt_date
    env.filters["fmt_score"] = _fmt_score
    return env


_JINJA_ENV = _create_jinja_env()


def _select_template_name(request: EvaluationRequest) -> str:
    if request.evaluation_type == EvaluationType.FIRST_EVALUATION or request.form_type == FormType.FIRST_EVAL_FORM:
        return "pierwsza_ocena.html"
    if request.form_type == FormType.FORM_B:
        return "arkusz_b.html"
    return "arkusz_c.html"


def _build_template_context(
    request: EvaluationRequest,
    result: EvaluationResponse,
) -> dict[str, Any]:
    """Przygotowuje kompletny kontekst danych do wyrenderowania arkusza urzędowego w Jinja2."""
    mandatory_scores_map: dict[str, int] = {}
    additional_list: list[dict[str, Any]] = []

    for item in request.oceny_czastkowe:
        norm_name = normalize_criterion_name(item.name)
        if item.is_mandatory:
            mandatory_scores_map[norm_name] = item.score
        else:
            additional_list.append({"name": norm_name, "score": item.score})

    if request.evaluation_type == EvaluationType.FIRST_EVALUATION or request.form_type == FormType.FIRST_EVAL_FORM:
        canonical_order = MANDATORY_CRITERIA_FIRST_EVAL
    elif request.form_type == FormType.FORM_B:
        canonical_order = MANDATORY_CRITERIA_FORM_B
    else:
        canonical_order = MANDATORY_CRITERIA_FORM_C

    mandatory_rows: list[dict[str, Any]] = [
        {"name": crit_name, "score": mandatory_scores_map.get(crit_name)}
        for crit_name in canonical_order
    ]

    additional_slots: list[dict[str, Any]] = list(additional_list[:MAX_ADDITIONAL_CRITERIA_PERIODIC])
    while len(additional_slots) < MAX_ADDITIONAL_CRITERIA_PERIODIC:
        additional_slots.append({"name": "", "score": None})

    if request.wniosek_kolejny_stopien is not None:
        wniosek_stopien_choice = request.wniosek_kolejny_stopien.czy_dolaczono_wniosek.value
    elif request.oceniany.status == CivilServiceStatus.PRACOWNIK_SC:
        wniosek_stopien_choice = "NIE_DOTYCZY"
    else:
        wniosek_stopien_choice = "NIE"

    exam_choice = (
        request.egzamin_sluzba_przygotowawcza.value
        if request.egzamin_sluzba_przygotowawcza is not None
        else ""
    )

    return {
        "req": request,
        "result": result,
        "mandatory_rows": mandatory_rows,
        "additional_slots": additional_slots,
        "wniosek_stopien_choice": wniosek_stopien_choice,
        "exam_choice": exam_choice,
    }


def render_evaluation_html(
    request: EvaluationRequest,
    result: EvaluationResponse | None = None,
) -> str:
    """
    Renderuje gotowy dokument HTML arkusza oceny i osadza zawartość `base_gov.css`
    w miejsce `<link rel="stylesheet" href="base_gov.css">`.
    """
    computed_result = result if result is not None else evaluate(request)
    template_name = _select_template_name(request)
    template = _JINJA_ENV.get_template(template_name)
    context = _build_template_context(request, computed_result)
    rendered_html = template.render(**context)

    base_css_path = TEMPLATES_DIR / "base_gov.css"
    base_css = base_css_path.read_text(encoding="utf-8")
    inlined_style = f"<style>\n{base_css}\n</style>"

    if _LINK_CSS_REGEX.search(rendered_html):
        rendered_html = _LINK_CSS_REGEX.sub(lambda _m: inlined_style, rendered_html, count=1)
    elif "</head>" in rendered_html:
        rendered_html = rendered_html.replace("</head>", f"{inlined_style}\n</head>", 1)

    return rendered_html


def _discover_unicode_font_paths() -> tuple[Path, Path | None, Path | None, Path | None] | None:
    """Wyszukuje w systemie czcionkę TrueType (.ttf) z polskimi znakami UTF-8 na potrzeby xhtml2pdf."""
    candidates: list[tuple[str, str | None, str | None, str | None]] = [
        (
            str(TEMPLATES_DIR / "fonts" / "DejaVuSerif.ttf"),
            str(TEMPLATES_DIR / "fonts" / "DejaVuSerif-Bold.ttf"),
            str(TEMPLATES_DIR / "fonts" / "DejaVuSerif-Italic.ttf"),
            str(TEMPLATES_DIR / "fonts" / "DejaVuSerif-BoldItalic.ttf"),
        ),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
        ),
        (
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
        ),
        (
            "/usr/share/fonts/TTF/DejaVuSerif.ttf",
            "/usr/share/fonts/TTF/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/TTF/DejaVuSerif-Italic.ttf",
            "/usr/share/fonts/TTF/DejaVuSerif-BoldItalic.ttf",
        ),
        (
            "C:/Windows/Fonts/times.ttf",
            "C:/Windows/Fonts/timesbd.ttf",
            "C:/Windows/Fonts/timesi.ttf",
            "C:/Windows/Fonts/timesbi.ttf",
        ),
        (
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/ariali.ttf",
            "C:/Windows/Fonts/arialbi.ttf",
        ),
        (
            "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
            "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
            "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
            "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf",
        ),
    ]

    for reg, bold, italic, bold_italic in candidates:
        reg_path = Path(reg)
        if reg_path.is_file():
            b_path = Path(bold) if bold and Path(bold).is_file() else None
            i_path = Path(italic) if italic and Path(italic).is_file() else None
            bi_path = Path(bold_italic) if bold_italic and Path(bold_italic).is_file() else None
            return reg_path, b_path, i_path, bi_path

    return None


def _ensure_xhtml2pdf_polish_fonts() -> str:
    """Rejestruje czcionkę TTF w ReportLab/xhtml2pdf dla polskich znaków diakrytycznych."""
    global _XHTML2PDF_FONT_REGISTERED

    from reportlab.lib.fonts import addMapping
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from xhtml2pdf.default import DEFAULT_FONT

    discovered = _discover_unicode_font_paths()
    if discovered is None:
        logger.warning("Nie znaleziono systemowej czcionki TTF dla xhtml2pdf.")
        return ""

    reg_path, bold_path, italic_path, bold_italic_path = discovered

    if not _XHTML2PDF_FONT_REGISTERED:
        pdfmetrics.registerFont(TTFont(XHTML2PDF_POLISH_FONT_FAMILY, str(reg_path)))
        bold_name = f"{XHTML2PDF_POLISH_FONT_FAMILY}-Bold"
        italic_name = f"{XHTML2PDF_POLISH_FONT_FAMILY}-Italic"
        bi_name = f"{XHTML2PDF_POLISH_FONT_FAMILY}-BoldItalic"

        pdfmetrics.registerFont(TTFont(bold_name, str(bold_path or reg_path)))
        pdfmetrics.registerFont(TTFont(italic_name, str(italic_path or reg_path)))
        pdfmetrics.registerFont(TTFont(bi_name, str(bold_italic_path or bold_path or reg_path)))

        addMapping(XHTML2PDF_POLISH_FONT_FAMILY, 0, 0, XHTML2PDF_POLISH_FONT_FAMILY)
        addMapping(XHTML2PDF_POLISH_FONT_FAMILY, 1, 0, bold_name)
        addMapping(XHTML2PDF_POLISH_FONT_FAMILY, 0, 1, italic_name)
        addMapping(XHTML2PDF_POLISH_FONT_FAMILY, 1, 1, bi_name)

        DEFAULT_FONT["helvetica"] = XHTML2PDF_POLISH_FONT_FAMILY
        DEFAULT_FONT["times"] = XHTML2PDF_POLISH_FONT_FAMILY
        DEFAULT_FONT["serif"] = XHTML2PDF_POLISH_FONT_FAMILY
        DEFAULT_FONT["sans-serif"] = XHTML2PDF_POLISH_FONT_FAMILY
        _XHTML2PDF_FONT_REGISTERED = True

    return (
        f"\nhtml, body, table, th, td, div, span, p, li {{ "
        f"font-family: '{XHTML2PDF_POLISH_FONT_FAMILY}', serif !important; }}\n"
    )


def _render_with_weasyprint(html_string: str) -> bytes:
    import weasyprint

    pdf_bytes: bytes = weasyprint.HTML(
        string=html_string,
        base_url=str(TEMPLATES_DIR),
    ).write_pdf()
    return pdf_bytes


def _render_with_xhtml2pdf(html_string: str) -> bytes:
    from xhtml2pdf import pisa

    extra_font_css = _ensure_xhtml2pdf_polish_fonts()
    if extra_font_css and "</style>" in html_string:
        html_string = html_string.replace("</style>", f"{extra_font_css}</style>", 1)

    output_buffer = io.BytesIO()
    pisa_status = pisa.CreatePDF(
        src=html_string,
        dest=output_buffer,
        encoding="utf-8",
    )
    if pisa_status.err:
        raise RuntimeError(f"Błąd generowania dokumentu PDF w silniku fallback xhtml2pdf (kod={pisa_status.err}).")

    return output_buffer.getvalue()


def generate_evaluation_pdf(
    request: EvaluationRequest,
    result: EvaluationResponse | None = None,
) -> bytes:
    """
    Generuje urzędowy plik PDF arkusza oceny (Arkusz B, Arkusz C lub Pierwsza Ocena).
    Używa silnika WeasyPrint, a w razie braku bibliotek Pango/GTK przełącza się na xhtml2pdf.
    """
    computed_result = result if result is not None else evaluate(request)
    html_content = render_evaluation_html(request, computed_result)

    try:
        return _render_with_weasyprint(html_content)
    except (ImportError, OSError) as exc:
        logger.info(
            "Biblioteki natywne WeasyPrint (Pango/GTK) są niedostępne (%s) – przełączanie na fallback xhtml2pdf.",
            exc,
        )
        return _render_with_xhtml2pdf(html_content)