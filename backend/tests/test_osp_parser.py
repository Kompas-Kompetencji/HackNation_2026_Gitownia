"""Parser opisu stanowiska (pkt 1.3): nazwa stanowiska z treści pliku, nie z nagłówka tabeli ani z nazwy pliku."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.osp_parser import parse_osp_docx  # noqa: E402

RAW = BACKEND_ROOT / "data" / "raw"
SAMPLES = {
    "OSP DC WZKSOiC 6 starszy specjalista.docx": (
        "starszy specjalista",
        "Departament Cyberbezpieczeństwa – Wydział Zarządzania Kryzysowego",
        "DC WZKSOiC 6",
    ),
    "OSP DSI WWI 5 radca.docx": (
        "radca",
        "Departament Rozwoju i Bezpieczeństwa Sztucznej Inteligencji – Wydział Wspierania Innowacyjności",
        "DSI WWI 5",
    ),
    "OSP DWM WKAM 1 naczelnik wydziału.docx": (
        "naczelnik wydziału",
        "Departament Współpracy Międzynarodowej – Wydział Koordynacji Aktywności Międzynarodowych",
        "DWM WKAM 1",
    ),
}


def _sample(name: str) -> bytes:
    path = RAW / name
    if not path.is_file():
        pytest.skip(f"Brak pliku przykładowego {name}")
    return path.read_bytes()


@pytest.mark.parametrize(("name", "expected"), SAMPLES.items())
def test_position_title_from_document(name: str, expected: tuple[str, str, str]) -> None:
    title, unit_prefix, symbol = expected
    result = parse_osp_docx(_sample(name), name)
    assert result.stanowisko_pracy == title
    assert result.stanowisko_pracy.upper() != "NAZWA STANOWISKA PRACY"
    assert result.komorka_organizacyjna.startswith(unit_prefix)
    assert result.symbol_stanowiska == symbol
    assert not any("1.3" in w for w in result.warnings)


@pytest.mark.parametrize("name", SAMPLES)
def test_filename_does_not_matter(name: str) -> None:
    """Ten sam dokument pod inną nazwą pliku daje tę samą nazwę stanowiska."""
    original = parse_osp_docx(_sample(name), name)
    renamed = parse_osp_docx(_sample(name), "skan_dokumentu_2026 (kopia).docx")
    assert renamed.stanowisko_pracy == original.stanowisko_pracy == SAMPLES[name][0]


def test_api_renamed_upload_keeps_title() -> None:
    """Przez trasę /osp/parse: plik radcy wysłany jako „opis.docx” → „radca”, nie nazwa pliku."""
    data = _sample("OSP DSI WWI 5 radca.docx")
    client = TestClient(app)
    response = client.post(
        "/api/v1/osp/parse",
        headers={"X-User-Id": "sup-001"},
        files={"file": ("opis.docx", data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stanowisko_pracy"] == "radca"
    assert body["zalecany_arkusz"] == "FORM_C"
