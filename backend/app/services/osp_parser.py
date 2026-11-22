from __future__ import annotations

import io
import re
import zipfile
from collections.abc import Iterator
from typing import Any, Final

from docx import Document
from docx.document import Document as DocxDocument
from docx.oxml.xmlchemy import BaseOxmlElement
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph

from app.core.config import STATUTORY_CRITERIA_CATALOG, normalize_criterion_name
from app.schemas.models import FormType, OspParseResult


# Znaki Unicode oznaczające zaznaczony oraz pusty checkbox
CHECKED_UNICODE_CHARS: Final[tuple[str, ...]] = ("☒", "☑", "✓", "✔", "✗", "✘", "■")
UNCHECKED_UNICODE_CHARS: Final[tuple[str, ...]] = ("☐", "□", "◻", "◯")

CHECKED_TEXT_REGEX: Final[re.Pattern[str]] = re.compile(
    r"^\s*(?:[☒☑✓✔✗✘■]|\[\s*[xX✓✔]\s*\]|\(\s*[xX✓✔]\s*\))"
)
STRIP_CHECKBOX_PREFIX_REGEX: Final[re.Pattern[str]] = re.compile(
    r"^\s*(?:[☒☑☐□◻■✓✔✗✘◯]|\[\s*[xX✓✔ ]?\s*\]|\(\s*[xX✓✔ ]?\s*\)|[-–—•▪])\s*"
)

# Kody znaków zaznaczonego checkboxa w czcionkach symbolicznych MS Word (Wingdings / Wingdings 2)
WINGDINGS_CHECKED_CODES: Final[frozenset[str]] = frozenset(
    {"F0FE", "00FE", "F0FD", "00FD", "F0FC", "00FC", "F052", "0052", "F053", "0053"}
)

# Teksty zastępcze kontrolek Worda (Content Controls), które należy ignorować
WORD_PLACEHOLDERS: Final[frozenset[str]] = frozenset(
    {
        "wybierz element.",
        "wybierz element",
        "kliknij tutaj, aby wprowadzić tekst.",
        "kliknij lub naciśnij tutaj, aby wprowadzić tekst.",
    }
)

# Wzorce opcji z sekcji 5 OSP ("LICZBA PODLEGŁYCH PRACOWNIKÓW")
NO_SUBORDINATES_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"brak\s+podległych\s+pracowników", re.IGNORECASE
)
SUBORDINATES_LEADERSHIP_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"(?:bezpośrednio\s+kieruje\s+lub\s+koordynuje\s+prac[ęe]|"
    r"bezpośrednio\s+podlegają\s+osoby\s+kierujące\s+pracą)",
    re.IGNORECASE,
)


# Tekst zastępczy listy rozwijanej, np. „wybierz nazwę stanowiska pracy z listy” (pole niewypełnione).
WORD_DROPDOWN_PLACEHOLDER: Final[re.Pattern[str]] = re.compile(r"^wybierz\b.*\bz listy\.?$", re.IGNORECASE)

W_NS: Final[str] = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _clean_text(text: str) -> str:
    """Usuwa nadmiarowe białe znaki i pomija placeholdery kontrolek formularza MS Word."""
    cleaned = re.sub(r"[ \t\xa0]+", " ", text or "").strip()
    if cleaned.casefold() in WORD_PLACEHOLDERS or WORD_DROPDOWN_PLACEHOLDER.match(cleaned):
        return ""
    return cleaned


def _row_cell_lines(row: Any) -> list[list[str]]:
    """
    Akapity kolejnych komórek wiersza odczytane wprost z XML, łącznie z komórkami opakowanymi
    w kontrolkę zawartości (w:sdt → w:sdtContent → w:tc). python-docx pomija takie komórki, a w OSP
    tak zapisana jest lista rozwijana nazwy stanowiska (pkt 1.3), więc bez tego wartość ginęła.
    """
    cells: list[list[str]] = []
    for child in row._tr.iterchildren():
        tag = _local_tag_name(child)
        if tag == "tc":
            tcs = [child]
        elif tag == "sdt":
            tcs = list(child.iter(f"{{{W_NS}}}tc"))
        else:
            continue
        for tc in tcs:
            lines: list[str] = []
            for paragraph in tc.iter(f"{{{W_NS}}}p"):
                line = _clean_text("".join(t.text or "" for t in paragraph.iter(f"{{{W_NS}}}t")))
                if line:
                    lines.append(line)
            cells.append(lines)
    return cells


def _clean_multiline_cell(cell: _Cell) -> list[str]:
    """Zwraca listę niepustych, oczyszczonych akapitów z komórki tabeli."""
    lines: list[str] = []
    for paragraph in cell.paragraphs:
        line = _clean_text(paragraph.text)
        if line:
            lines.append(line)
    return lines


def _iter_all_tables(parent: DocxDocument | _Cell) -> Iterator[Table]:
    """Rekurencyjnie iteruje po wszystkich tabelach w dokumencie (wraz z ewentualnymi tabelami zagnieżdżonymi)."""
    for table in parent.tables:
        yield table
        for row in table.rows:
            seen_tc: set[int] = set()
            for cell in row.cells:
                tc_id = id(cell._tc)
                if tc_id in seen_tc:
                    continue
                seen_tc.add(tc_id)
                yield from _iter_all_tables(cell)


def _unique_row_cells(row_cells: list[_Cell]) -> list[_Cell]:
    """Zwraca unikalne komórki wiersza z pominięciem duplikatów wynikających ze scalenia poziomego (gridSpan)."""
    unique: list[_Cell] = []
    seen_tc: set[int] = set()
    for cell in row_cells:
        tc_id = id(cell._tc)
        if tc_id not in seen_tc:
            seen_tc.add(tc_id)
            unique.append(cell)
    return unique


def _local_tag_name(elem: Any) -> str:
    tag = getattr(elem, "tag", "")
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _get_xml_val_attr(elem: Any) -> str | None:
    """Pobiera wartość atrybutu `w:val` lub `w14:val` z elementu XML Worda."""
    for attr_key, attr_val in getattr(elem, "attrib", {}).items():
        local_attr = attr_key.rsplit("}", 1)[-1] if "}" in attr_key else attr_key
        if local_attr == "val":
            return str(attr_val).strip()
    return None


def _has_checked_xml_control(oxml_element: BaseOxmlElement) -> bool:
    """
    Sprawdza w drzewie XML (`cell._element` lub `paragraph._element`), czy znajduje się w nim
    zaznaczony checkbox MS Word:
    1) Word 2010+ SDT Checkbox (`w14:checked` z `w14:val="1"` / `"true"`),
    2) Klasyczny FormField Checkbox (`w:checkBox` -> `w:checked` bez `val="0"` lub `w:default w:val="1"`),
    3) Znak symboliczny Wingdings / Wingdings 2 (`w:sym`).
    """
    false_values = {"0", "false", "off", "none"}

    # 1. Sprawdzenie znaczników w:checked oraz w14:checked
    for elem in oxml_element.iter():
        local_name = _local_tag_name(elem)

        if local_name == "checked":
            val = _get_xml_val_attr(elem)
            # Brak atrybutu val (np. <w:checked/>) oznacza zaznaczenie; val="0" oznacza brak zaznaczenia
            if val is None or val.casefold() not in false_values:
                return True

        elif local_name == "checkBox":
            has_explicit_checked = False
            default_checked = False
            for child in elem:
                child_name = _local_tag_name(child)
                if child_name == "checked":
                    has_explicit_checked = True
                    val = _get_xml_val_attr(child)
                    if val is None or val.casefold() not in false_values:
                        return True
                elif child_name == "default":
                    val = _get_xml_val_attr(child)
                    if val is not None and val.casefold() not in false_values:
                        default_checked = True
            if not has_explicit_checked and default_checked:
                return True

        elif local_name == "sym":
            font_name = ""
            char_code = ""
            for attr_key, attr_val in getattr(elem, "attrib", {}).items():
                local_attr = attr_key.rsplit("}", 1)[-1] if "}" in attr_key else attr_key
                if local_attr == "font":
                    font_name = str(attr_val).strip().casefold()
                elif local_attr == "char":
                    char_code = str(attr_val).strip().upper()
            if "wingdings" in font_name and char_code in WINGDINGS_CHECKED_CODES:
                return True

    return False


def _is_checkbox_checked_in_text_or_xml(text: str, oxml_element: BaseOxmlElement) -> bool:
    """Łączy detekcję znaków Unicode / tekstowych `[x]` z analizą kontrolek XML Worda."""
    if CHECKED_TEXT_REGEX.search(text):
        return True
    for ch in CHECKED_UNICODE_CHARS:
        if ch in text:
            return True
    return _has_checked_xml_control(oxml_element)


def _strip_checkbox_markers(text: str) -> str:
    """Usuwa z początku tekstu symbole checkboxów (np. `☒`, `☐`, `[x]`), zostawiając czystą treść opcji."""
    cleaned = STRIP_CHECKBOX_PREFIX_REGEX.sub("", text or "")
    for ch in CHECKED_UNICODE_CHARS + UNCHECKED_UNICODE_CHARS:
        cleaned = cleaned.replace(ch, "")
    return _clean_text(cleaned)


def _is_subordinate_option_line(text: str) -> bool:
    return bool(NO_SUBORDINATES_PATTERN.search(text) or SUBORDINATES_LEADERSHIP_PATTERN.search(text))


def _parse_part_one_metadata(tables: list[Table]) -> dict[str, str]:
    """
    Wyciąga dane z Części I OSP (punkty 1.1 - 1.5):
    - nazwa_urzedu (1.1)
    - komorka_organizacyjna (1.2 - łącząc wiersze departamentu i wydziału przy scalonych komórkach)
    - stanowisko_pracy (1.3 + opcjonalne rozszerzenie "do spraw" z 1.4)
    - symbol_stanowiska (1.5)
    """
    nazwa_urzedu = ""
    komorka_parts: list[str] = []
    stanowisko_base = ""
    stanowisko_do_spraw = ""
    symbol_stanowiska = ""

    labels = (
        "NAZWA URZĘDU",
        "NAZWA KOMÓRKI ORGANIZACYJNEJ",
        "NAZWA STANOWISKA PRACY",
        "STANOWISKO DO SPRAW",
        "SYMBOL STANOWISKA PRACY",
    )
    last_label = ""
    for table in tables:
        for row in table.rows:
            cells = _row_cell_lines(row)
            if len(cells) < 2:
                continue

            # Układ 3-kolumnowy (np. "1.1." | "NAZWA URZĘDU" | "Ministerstwo Cyfryzacji")
            # lub 2-kolumnowy ("1.1. NAZWA URZĘDU" | "Ministerstwo Cyfryzacji").
            texts = [" ".join(lines) for lines in cells]
            first_text = texts[0]
            second_text = texts[1]
            label_combined = f"{first_text} {second_text}".upper()
            # Wartość to wyłącznie komórki PO komórce z etykietą — nigdy sama etykieta
            # (wcześniej przy pustej wartości trafiał tu nagłówek „NAZWA STANOWISKA PRACY”).
            label_index = next(
                (i for i, text in enumerate(texts[:2]) if any(label in text.upper() for label in labels)),
                0,
            )
            value_lines = [line for lines in cells[label_index + 1:] for line in lines]
            value_joined = " ".join(value_lines)
            # Wiersz kontynuacji z pionowo scaloną etykietą (np. wydział pod departamentem w pkt 1.2):
            # komórki etykiet są puste, wartość należy do poprzedniego punktu.
            continuation = not first_text and not second_text

            if "1.1" in first_text or "NAZWA URZĘDU" in label_combined:
                last_label = "1.1"
                if value_joined and not nazwa_urzedu:
                    nazwa_urzedu = value_joined

            elif (
                "1.2" in first_text
                or "NAZWA KOMÓRKI ORGANIZACYJNEJ" in label_combined
                or (continuation and last_label == "1.2")
            ):
                last_label = "1.2"
                for line in value_lines:
                    if line not in komorka_parts:
                        komorka_parts.append(line)

            elif "1.3" in first_text or "NAZWA STANOWISKA PRACY" in label_combined:
                last_label = "1.3"
                if value_joined and not stanowisko_base:
                    stanowisko_base = value_joined

            elif "1.4" in first_text or "STANOWISKO DO SPRAW" in label_combined:
                last_label = "1.4"
                if value_joined and not stanowisko_do_spraw:
                    stanowisko_do_spraw = value_joined

            elif "1.5" in first_text or "SYMBOL STANOWISKA PRACY" in label_combined:
                last_label = "1.5"
                if value_joined and not symbol_stanowiska:
                    symbol_stanowiska = value_joined

    stanowisko_full = stanowisko_base
    if stanowisko_do_spraw:
        if stanowisko_do_spraw.casefold().startswith("do spraw") or stanowisko_do_spraw.casefold().startswith("ds."):
            stanowisko_full = f"{stanowisko_base} {stanowisko_do_spraw}".strip()
        else:
            stanowisko_full = f"{stanowisko_base} do spraw {stanowisko_do_spraw}".strip()

    return {
        "nazwa_urzedu": nazwa_urzedu,
        "komorka_organizacyjna": " – ".join(komorka_parts) if komorka_parts else "",
        "stanowisko_pracy": stanowisko_full,
        "symbol_stanowiska": symbol_stanowiska,
    }


def _parse_cel_and_subordinates(
    tables: list[Table], warnings: list[str]
) -> tuple[str, bool, str, FormType]:
    """
    Wyciąga Cel istnienia stanowiska pracy (Pkt 4) oraz deterministycznie rozstrzyga
    kierowanie pracownikami i wybór Arkusza B vs C na podstawie Pkt 5 (LICZBA PODLEGŁYCH PRACOWNIKÓW).
    """
    cel_lines: list[str] = []
    checked_options: list[str] = []
    found_subordinates_section = False

    for table in tables:
        mode: str | None = None
        seen_tc_in_mode: set[int] = set()

        for row in table.rows:
            cells = _unique_row_cells(list(row.cells))
            row_header_check = " ".join(_clean_text(c.text) for c in cells).upper()

            if "CEL ISTNIENIA STANOWISKA PRACY" in row_header_check:
                mode = "CEL"
                continue

            if "LICZBA PODLEGŁYCH PRACOWNIKÓW" in row_header_check:
                mode = "SUBORDINATES"
                found_subordinates_section = True
                continue

            # Wyjście z sekcji, jeśli w tej samej tabeli pojawi się kolejny nagłówek (np. pkt 6)
            if re.match(r"^\s*(?:6\.|GŁÓWNE ZADANIA|ZADANIA DOMINUJĄCE)", row_header_check):
                mode = None
                continue

            if mode == "CEL":
                for cell in cells:
                    tc_id = id(cell._tc)
                    if tc_id in seen_tc_in_mode:
                        continue
                    seen_tc_in_mode.add(tc_id)
                    for line in _clean_multiline_cell(cell):
                        if line not in cel_lines:
                            cel_lines.append(line)

            elif mode == "SUBORDINATES":
                for cell in cells:
                    tc_id = id(cell._tc)
                    if tc_id in seen_tc_in_mode:
                        continue
                    seen_tc_in_mode.add(tc_id)

                    non_empty_paras: list[Paragraph] = [
                        p for p in cell.paragraphs if _clean_text(p.text)
                    ]

                    # Przypadek A: Wiele opcji wpisanych jako osobne akapity w jednej komórce
                    if len(non_empty_paras) > 1:
                        for para in non_empty_paras:
                            raw_p = para.text
                            clean_option = _strip_checkbox_markers(raw_p)
                            if not _is_subordinate_option_line(clean_option):
                                continue
                            if _is_checkbox_checked_in_text_or_xml(raw_p, para._element):
                                if clean_option not in checked_options:
                                    checked_options.append(clean_option)

                    # Przypadek B: Pojedyncza opcja w komórce (lub checkbox w sąsiedniej kolumnie wiersza)
                    elif len(non_empty_paras) == 1:
                        raw_p = non_empty_paras[0].text
                        clean_option = _strip_checkbox_markers(raw_p)
                        if not _is_subordinate_option_line(clean_option):
                            continue
                        # Sprawdzamy zarówno całą komórkę z tekstem, jak i ewentualną kolumnę z samym checkboxem
                        row_xml_checked = _is_checkbox_checked_in_text_or_xml(raw_p, cell._element)
                        if not row_xml_checked and len(cells) > 1 and cells[0] is not cell:
                            first_cell_txt = cells[0].text
                            if not _is_subordinate_option_line(first_cell_txt):
                                row_xml_checked = _is_checkbox_checked_in_text_or_xml(
                                    first_cell_txt, cells[0]._element
                                )
                        if row_xml_checked and clean_option not in checked_options:
                            checked_options.append(clean_option)

    cel_stanowiska = "\n".join(cel_lines).strip()

    if not found_subordinates_section:
        warnings.append(
            "Nie znaleziono w dokumencie OSP tabeli z nagłówkiem 'LICZBA PODLEGŁYCH PRACOWNIKÓW'. "
            "Przyjęto domyślnie brak podległych pracowników (FORM_C)."
        )
        return cel_stanowiska, False, "brak podległych pracowników", FormType.FORM_C

    if not checked_options:
        warnings.append(
            "W sekcji 'LICZBA PODLEGŁYCH PRACOWNIKÓW' nie wykryto żadnego zaznaczonego checkboxa. "
            "Przyjęto domyślnie brak podległych pracowników (FORM_C) – zweryfikuj wybór ręcznie."
        )
        return cel_stanowiska, False, "brak podległych pracowników", FormType.FORM_C

    has_no_subordinates = any(NO_SUBORDINATES_PATTERN.search(opt) for opt in checked_options)
    leadership_matches = [opt for opt in checked_options if SUBORDINATES_LEADERSHIP_PATTERN.search(opt)]

    if has_no_subordinates and leadership_matches:
        warnings.append(
            f"Wykryto sprzeczne zaznaczenia w sekcji podległych pracowników: {checked_options}. "
            "Ze względu na zaznaczenie opcji kierowania pracownikami wybrano FORM_B."
        )
        return cel_stanowiska, True, "; ".join(leadership_matches), FormType.FORM_B

    if leadership_matches:
        return cel_stanowiska, True, "; ".join(leadership_matches), FormType.FORM_B

    return cel_stanowiska, False, checked_options[0], FormType.FORM_C


def _parse_tasks(tables: list[Table]) -> tuple[list[str], list[str]]:
    """
    Wyciąga zadania z sekcji `ZADANIA DOMINUJĄCE` oraz `POZOSTAŁE ZADANIA` (Pkt 6 OSP),
    obsługując zarówno jedną wspólną tabelę (jak w OSP `radca`), jak i dwie osobne tabele
    (jak w OSP `starszy specjalista` oraz `naczelnik wydziału`).
    """
    zadania_dominujace: list[str] = []
    zadania_pozostale: list[str] = []

    for table in tables:
        section: str | None = None
        seen_tc: set[int] = set()

        for row in table.rows:
            cells = _unique_row_cells(list(row.cells))
            row_text = " ".join(_clean_text(c.text) for c in cells)
            row_upper = row_text.upper()

            if "ZADANIA DOMINUJĄCE" in row_upper:
                section = "DOMINUJACE"
                continue
            if "POZOSTAŁE ZADANIA" in row_upper:
                section = "POZOSTALE"
                continue
            if re.match(r"^\s*(?:7\.|UPOWAŻNIENIA I PEŁNOMOCNICTWA|8\.|ZŁOŻONOŚĆ)", row_upper):
                section = None
                continue

            if section in {"DOMINUJACE", "POZOSTALE"}:
                target_list = zadania_dominujace if section == "DOMINUJACE" else zadania_pozostale
                for cell in cells:
                    tc_id = id(cell._tc)
                    if tc_id in seen_tc:
                        continue
                    seen_tc.add(tc_id)

                    paragraphs = _clean_multiline_cell(cell)
                    for para_text in paragraphs:
                        if para_text not in target_list:
                            target_list.append(para_text)

    return zadania_dominujace, zadania_pozostale


def _extract_soft_skills_from_block(raw_block: str, warnings: list[str]) -> list[str]:
    """
    Parsuje sekcję `Kompetencje miękkie:` z Pkt 13 OSP i mapuje wyekstrahowane pozycje
    do kanonicznych nazw z katalogu 14 kompetencji ustawowych, zachowując kolejność występowania.
    """
    # Wycięcie fragmentu zaczynającego się po nagłówku "Kompetencje miękkie:"
    match = re.search(r"kompetencje\s+miękkie\s*:?(.*)", raw_block, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return []

    block = match.group(1)
    # Odcięcie ewentualnych kolejnych sekcji tabeli, gdyby znalazły się w tym samym tekście
    block = re.split(
        r"\b(?:DOŚWIADCZENIE\s+ZAWODOWE|WYMAGANIA\s+NIEZBĘDNE|CZĘŚĆ\s+III)\b",
        block,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]

    # Złączenie miękkich złamań wiersza wewnątrz nazw kompetencji (np. "organizacja pracy\ni orientacja...")
    normalized_whitespace = re.sub(r"\s+", " ", block).strip()

    # 1. Dopasowanie kanonicznych kryteriów ustawowych w kolejności ich pojawienia się w tekście
    found_with_pos: list[tuple[int, str]] = []
    remaining_check = normalized_whitespace.casefold()

    for canonical in sorted(STATUTORY_CRITERIA_CATALOG, key=len, reverse=True):
        needle = canonical.casefold()
        pos = remaining_check.find(needle)
        if pos != -1:
            found_with_pos.append((pos, canonical))
            # Zamaskowanie dopasowanego fragmentu, aby uniknąć częściowych nadpisań
            remaining_check = (
                remaining_check[:pos] + (" " * len(needle)) + remaining_check[pos + len(needle) :]
            )

    found_with_pos.sort(key=lambda item: item[0])
    result: list[str] = [name for _, name in found_with_pos]

    # 2. Sprawdzenie, czy w sekcji "Kompetencje miękkie" wpisano dodatkowe kompetencje spoza katalogu 14
    leftover_tokens = re.split(r"[•▪◦,;]+|\s+-\s+|^-\s*", remaining_check)
    for token in leftover_tokens:
        cleaned_tok = token.strip(" .-–—•▪\t\r\n")
        if len(cleaned_tok) >= 4 and cleaned_tok not in WORD_PLACEHOLDERS:
            pretty_tok = normalize_criterion_name(cleaned_tok)
            if pretty_tok not in result:
                warnings.append(
                    f"W sekcji 'Kompetencje miękkie' wykryto pozycję spoza ustawowego katalogu 14 kryteriów: '{pretty_tok}'."
                )
                result.append(pretty_tok)

    return result


def _parse_soft_competencies(tables: list[Table], warnings: list[str]) -> list[str]:
    """
    Przeszukuje tabelę `13. WYMAGANE KOMPETENCJE I DOŚWIADCZENIE ZAWODOWE` (w tym wiersze
    kontynuowane na kolejnej stronie, jak w OSP `radca` i `starszy specjalista`) w celu wyciągnięcia
    listy kompetencji miękkich.
    """
    collected_Soft_text_chunks: list[str] = []
    in_competencies_table = False

    for table in tables:
        table_preview = " ".join(
            _clean_text(cell.text)
            for row in table.rows[:3]
            for cell in _unique_row_cells(list(row.cells))
        ).upper()

        if "WYMAGANIA NIEZBĘDNE" in table_preview or "INNE KOMPETENCJE" in table_preview:
            in_competencies_table = True

        for row in table.rows:
            cells = _unique_row_cells(list(row.cells))
            for cell in cells:
                cell_raw_lines = [p.text.strip() for p in cell.paragraphs if p.text and p.text.strip()]
                joined_cell = "\n".join(cell_raw_lines)
                if "kompetencje miękkie" in joined_cell.casefold():
                    collected_Soft_text_chunks.append(joined_cell)
                elif in_competencies_table and "DOŚWIADCZENIE ZAWODOWE" in joined_cell.upper():
                    in_competencies_table = False

    if not collected_Soft_text_chunks:
        warnings.append(
            "Nie znaleziono bloku 'Kompetencje miękkie' w sekcji 'WYMAGANE KOMPETENCJE I DOŚWIADCZENIE ZAWODOWE'."
        )
        return []

    combined_raw = "\n".join(collected_Soft_text_chunks)
    return _extract_soft_skills_from_block(combined_raw, warnings)


def parse_osp_docx(file_bytes: bytes, filename: str) -> OspParseResult:
    """
    Parsuje dokument Opisu Stanowiska Pracy w formacie `.docx` i zwraca ustrukturyzowany obiekt `OspParseResult`
    wraz z deterministyczną rekomendacją formularza oceny okresowej (`FORM_B` lub `FORM_C`).
    """
    if not file_bytes:
        raise ValueError(f"Przesłany plik '{filename}' jest pusty.")

    if filename.lower().endswith(".doc") and not filename.lower().endswith(".docx"):
        raise ValueError(
            f"Plik '{filename}' ma przestarzały format binarny .doc. Wymagany jest format OpenXML (.docx)."
        )

    try:
        doc = Document(io.BytesIO(file_bytes))
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise ValueError(
            f"Nie udało się otworzyć pliku '{filename}' jako poprawnego dokumentu Word (.docx): {exc}"
        ) from exc

    warnings: list[str] = []
    all_tables = list(_iter_all_tables(doc))

    if not all_tables:
        warnings.append(
            f"Dokument '{filename}' nie zawiera żadnych tabel OSP. Sprawdź, czy wgrano właściwy formularz."
        )
        return OspParseResult(
            zalecany_arkusz=FormType.FORM_C,
            warnings=warnings,
        )

    part_one = _parse_part_one_metadata(all_tables)
    if not part_one["stanowisko_pracy"]:
        warnings.append("Nie udało się odczytać nazwy stanowiska pracy (Pkt 1.3 OSP).")
    if not part_one["nazwa_urzedu"]:
        warnings.append("Nie udało się odczytać nazwy urzędu (Pkt 1.1 OSP).")

    cel_stanowiska, kieruje_pracownikami, liczba_podleglych_tekst, zalecany_arkusz = (
        _parse_cel_and_subordinates(all_tables, warnings)
    )

    zadania_dominujace, zadania_pozostale = _parse_tasks(all_tables)
    if not zadania_dominujace:
        warnings.append("Nie wykryto żadnych pozycji w sekcji 'ZADANIA DOMINUJĄCE'.")

    kompetencje_miekkie = _parse_soft_competencies(all_tables, warnings)

    return OspParseResult(
        nazwa_urzedu=part_one["nazwa_urzedu"],
        komorka_organizacyjna=part_one["komorka_organizacyjna"],
        stanowisko_pracy=part_one["stanowisko_pracy"],
        symbol_stanowiska=part_one["symbol_stanowiska"],
        cel_stanowiska=cel_stanowiska,
        kieruje_pracownikami=kieruje_pracownikami,
        liczba_podleglych_tekst=liczba_podleglych_tekst,
        zalecany_arkusz=zalecany_arkusz,
        zadania_dominujace=zadania_dominujace,
        zadania_pozostale=zadania_pozostale,
        kompetencje_miekkie_z_osp=kompetencje_miekkie,
        warnings=warnings,
    )