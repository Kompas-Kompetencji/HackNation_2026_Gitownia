from __future__ import annotations

import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import (  # noqa: E402
    MANDATORY_CRITERIA_FIRST_EVAL,
    MANDATORY_CRITERIA_FORM_B,
    MANDATORY_CRITERIA_FORM_C,
)
from app.core.deadline_calc import (  # noqa: E402
    add_months_art_112_kc,
    calculate_deadlines,
    compute_easter_sunday,
    get_polish_statutory_holidays,
)
from app.core.scoring_engine import (  # noqa: E402
    evaluate,
    evaluate_first,
    evaluate_periodic,
    round_half_up,
)
from app.schemas.models import (  # noqa: E402
    AbsencePeriod,
    CivilServiceStatus,
    CriterionScore,
    DeadlineRequest,
    EvaluatedPersonData,
    EvaluationRequest,
    EvaluationType,
    FormType,
    NextRankRequestData,
    TriStateOption,
)


def _build_scores(names: tuple[str, ...] | list[str], scores: list[int], mandatory: bool = True) -> list[CriterionScore]:
    return [
        CriterionScore(name=name, score=score, is_mandatory=mandatory)
        for name, score in zip(names, scores, strict=True)
    ]


# ============================================================================
# TESTY ZAOKRĄGLANIA I OCENY OKRESOWEJ (ROZPORZĄDZENIE Z 04.04.2016 R.)
# ============================================================================


def test_round_half_up_exact_behavior() -> None:
    """Weryfikuje matematyczne zaokrąglanie ROUND_HALF_UP (np. .125 -> .13 zamiast bankierskiego .12)."""
    assert round_half_up(Decimal("4.125"), 2) == 4.13
    assert round_half_up(Decimal("4.375"), 2) == 4.38
    assert round_half_up(Decimal("5.005"), 2) == 5.01


def test_periodic_form_b_positive_with_additional_criteria() -> None:
    scores = _build_scores(MANDATORY_CRITERIA_FORM_B, [7, 7, 5, 7, 5], mandatory=True) + [
        CriterionScore(name="Negocjowanie", score=9, is_mandatory=False),
        CriterionScore(name="Wystąpienia publiczne", score=7, is_mandatory=False),
    ]
    req = EvaluationRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        form_type=FormType.FORM_B,
        oceny_czastkowe=scores,
    )
    res = evaluate_periodic(req)

    # Suma = 47 / 7 = 6.714285... -> 6.71
    assert res.errors == []
    assert res.srednia_arytmetyczna == 6.71
    assert res.ogolny_poziom == "powyżej oczekiwań"
    assert res.werdykt == "POZYTYWNA"
    assert res.uzasadnienie_obowiazkowe is False
    assert res.iprz_mandatory_criteria == []
    assert res.include_part_3 is False


def test_periodic_single_score_1_forces_negative_despite_high_average() -> None:
    """Nawet przy czterech ocenach 9 pkt i średniej 7.40 jedna ocena 1 pkt wymusza werdykt NEGATYWNA."""
    scores = _build_scores(MANDATORY_CRITERIA_FORM_C, [9, 9, 9, 9, 1], mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        form_type=FormType.FORM_C,
        oceny_czastkowe=scores,
        uzasadnienie="Stwierdzono rażące naruszenia standardów komunikacji pisemnej.",
    )
    res = evaluate_periodic(req)

    assert res.errors == []
    assert res.srednia_arytmetyczna == 7.40
    assert res.ogolny_poziom == "powyżej oczekiwań"
    assert res.werdykt == "NEGATYWNA"
    assert res.uzasadnienie_obowiazkowe is True
    assert res.iprz_mandatory_criteria == ["Komunikacja"]
    assert any("1 pkt" in reason and "Komunikacja" in reason for reason in res.powody_werdyktu)


@pytest.mark.parametrize(
    ("raw_scores", "expected_avg", "expected_level", "expected_verdict"),
    [
        ([1, 1, 3, 1, 3], 1.80, "znacznie poniżej oczekiwań", "NEGATYWNA"),
        ([3, 5, 5, 3, 3], 3.80, "poniżej oczekiwań", "NEGATYWNA"),
        ([5, 5, 3, 3, 5], 4.20, "na poziomie oczekiwań", "POZYTYWNA"),
        ([7, 7, 7, 7, 9], 7.40, "powyżej oczekiwań", "POZYTYWNA"),
        ([9, 9, 9, 7, 7], 8.20, "znacznie powyżej oczekiwań", "POZYTYWNA"),
    ],
)
def test_periodic_overall_thresholds_and_verdicts(
    raw_scores: list[int],
    expected_avg: float,
    expected_level: str,
    expected_verdict: str,
) -> None:
    scores = _build_scores(MANDATORY_CRITERIA_FORM_C, raw_scores, mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        form_type=FormType.FORM_C,
        oceny_czastkowe=scores,
        uzasadnienie="Uzasadnienie testowe",
    )
    res = evaluate(req)

    assert res.srednia_arytmetyczna == expected_avg
    assert res.ogolny_poziom == expected_level
    assert res.werdykt == expected_verdict


def test_periodic_boundary_exactly_4_00_is_negative() -> None:
    """Średnia dokładnie 4.00 pkt ('powyżej 2 do 4 punktów') oznacza poziom 'poniżej oczekiwań' i ocenę NEGATYWNĄ."""
    scores = _build_scores(MANDATORY_CRITERIA_FORM_C, [5, 5, 3, 3, 3], mandatory=True) + [
        CriterionScore(name="Myślenie analityczne", score=5, is_mandatory=False)
    ]
    req = EvaluationRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        form_type=FormType.FORM_C,
        oceny_czastkowe=scores,
        uzasadnienie="Średnia na granicy 4,00 pkt.",
    )
    res = evaluate_periodic(req)

    assert res.srednia_arytmetyczna == 4.00
    assert res.ogolny_poziom == "poniżej oczekiwań"
    assert res.werdykt == "NEGATYWNA"
    assert set(res.iprz_mandatory_criteria) == {
        "Organizacja pracy i orientacja na osiąganie celów",
        "Współpraca",
        "Komunikacja",
    }


def test_periodic_blocks_duplicate_and_excess_additional_criteria_and_invalid_scale() -> None:
    scores = _build_scores(MANDATORY_CRITERIA_FORM_C, [5, 5, 5, 5, 4], mandatory=True) + [
        CriterionScore(name="Komunikacja", score=5, is_mandatory=False),  # Duplikat obowiązkowego!
        CriterionScore(name="Kreatywność", score=5, is_mandatory=False),
        CriterionScore(name="Negocjowanie", score=5, is_mandatory=False),
        CriterionScore(name="Myślenie analityczne", score=5, is_mandatory=False),  # 4. dodatkowe (> 3)!
    ]
    req = EvaluationRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        form_type=FormType.FORM_C,
        oceny_czastkowe=scores,
    )
    res = evaluate_periodic(req)

    assert any("maksymalną liczbę kryteriów dodatkowych" in err for err in res.errors)
    assert any("powiela kryterium obowiązkowe" in err for err in res.errors)
    assert any("Niedozwolona ocena cząstkowa 4 pkt" in err for err in res.errors)


def test_periodic_include_part_3_only_for_urzednik_sc_with_positive_verdict() -> None:
    scores = _build_scores(MANDATORY_CRITERIA_FORM_C, [7, 7, 7, 7, 7], mandatory=True)

    # 1) Urzędnik SC + POZYTYWNA + wniosek TAK -> include_part_3 = True
    req_ok = EvaluationRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        form_type=FormType.FORM_C,
        oceniany=EvaluatedPersonData(status=CivilServiceStatus.URZEDNIK_SC),
        oceny_czastkowe=scores,
        wniosek_kolejny_stopien=NextRankRequestData(
            czy_dolaczono_wniosek=TriStateOption.TAK,
            umotywowanie_wniosku="Wzorowa realizacja zadań eksperckich.",
        ),
    )
    res_ok = evaluate_periodic(req_ok)
    assert res_ok.include_part_3 is True
    assert res_ok.errors == []

    # 2) Pracownik SC + POZYTYWNA + wniosek TAK -> blokada include_part_3 = False + błąd
    req_pracownik = req_ok.model_copy(
        update={"oceniany": EvaluatedPersonData(status=CivilServiceStatus.PRACOWNIK_SC)}
    )
    res_pracownik = evaluate_periodic(req_pracownik)
    assert res_pracownik.include_part_3 is False
    assert any("Pracownikowi służby cywilnej" in err for err in res_pracownik.errors)

    # 3) Urzędnik SC + NEGATYWNA + wniosek TAK -> blokada include_part_3 = False + błąd
    req_neg = req_ok.model_copy(
        update={
            "oceny_czastkowe": _build_scores(MANDATORY_CRITERIA_FORM_C, [7, 7, 7, 7, 1]),
            "uzasadnienie": "Ocena cząstkowa 1 pkt.",
        }
    )
    res_neg = evaluate_periodic(req_neg)
    assert res_neg.werdykt == "NEGATYWNA"
    assert res_neg.include_part_3 is False
    assert any("pozytywnej oceny okresowej" in err for err in res_neg.errors)


# ============================================================================
# TESTY PIERWSZEJ OCENY W SŁUŻBIE CYWILNEJ (ROZPORZĄDZENIE Z 23.07.2015 R.)
# ============================================================================


def test_first_evaluation_positive_at_exact_threshold() -> None:
    """Jedna ocena 3 pkt, średnia 5.00, zaliczony egzamin i terminowe sprawozdanie -> POZYTYWNA."""
    scores = _build_scores(MANDATORY_CRITERIA_FIRST_EVAL, [7, 5, 5, 5, 3], mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.FIRST_EVALUATION,
        form_type=FormType.FIRST_EVAL_FORM,
        oceny_czastkowe=scores,
        egzamin_sluzba_przygotowawcza=TriStateOption.TAK,
        sprawozdanie_zlozone_w_terminie=True,
        wnioski_rozwojowe_pierwsza_ocena="Wskazane szkolenie z komunikacji międzyzespołowej.",
    )
    res = evaluate_first(req)

    assert res.errors == []
    assert res.srednia_arytmetyczna == 5.00
    assert res.werdykt == "POZYTYWNA"
    assert res.uzasadnienie_obowiazkowe is False
    assert res.wnioski_rozwojowe_dozwolone is True
    assert res.iprz_mandatory_criteria == ["Współpraca"]


def test_first_evaluation_two_threes_fail_even_when_average_above_5() -> None:
    """Pułapka prawna: [7, 7, 7, 3, 3] daje średnią 5.40 (>= 5.00), ale dwie oceny 3 pkt wymuszają NEGATYWNA."""
    scores = _build_scores(MANDATORY_CRITERIA_FIRST_EVAL, [7, 7, 7, 3, 3], mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.FIRST_EVALUATION,
        form_type=FormType.FIRST_EVAL_FORM,
        oceny_czastkowe=scores,
        egzamin_sluzba_przygotowawcza=TriStateOption.NIE_DOTYCZY,
        sprawozdanie_zlozone_w_terminie=True,
        uzasadnienie="Dwa elementy oceniono poniżej oczekiwań.",
    )
    res = evaluate_first(req)

    assert res.srednia_arytmetyczna == 5.40
    assert res.werdykt == "NEGATYWNA"
    assert res.uzasadnienie_obowiazkowe is True
    assert res.wnioski_rozwojowe_dozwolone is False
    assert any("więcej niż jedną ocenę cząstkową w wysokości 3 punktów" in r for r in res.powody_werdyktu)


def test_first_evaluation_one_three_with_average_below_5_fails() -> None:
    """Układ [5, 5, 5, 5, 3] ma tylko jedną ocenę 3 pkt, ale średnia 4.60 (< 5.00) wymusza NEGATYWNA."""
    scores = _build_scores(MANDATORY_CRITERIA_FIRST_EVAL, [5, 5, 5, 5, 3], mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.FIRST_EVALUATION,
        form_type=FormType.FIRST_EVAL_FORM,
        oceny_czastkowe=scores,
        egzamin_sluzba_przygotowawcza=TriStateOption.TAK,
        sprawozdanie_zlozone_w_terminie=True,
        uzasadnienie="Średnia poniżej 5,00 pkt.",
    )
    res = evaluate_first(req)

    assert res.srednia_arytmetyczna == 4.60
    assert res.werdykt == "NEGATYWNA"
    assert any("niższą niż wymagane 5,00 punktów" in r for r in res.powody_werdyktu)


def test_first_evaluation_exam_or_report_failure_and_forbidden_dev_notes() -> None:
    scores = _build_scores(MANDATORY_CRITERIA_FIRST_EVAL, [7, 7, 7, 7, 7], mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.FIRST_EVALUATION,
        form_type=FormType.FIRST_EVAL_FORM,
        oceny_czastkowe=scores,
        egzamin_sluzba_przygotowawcza=TriStateOption.NIE,
        sprawozdanie_zlozone_w_terminie=False,
        uzasadnienie="",  # Pusty string powinien zgłosić błąd braku obowiązkowego uzasadnienia
        wnioski_rozwojowe_pierwsza_ocena="Niedozwolony wpis przy ocenie negatywnej",
    )
    res = evaluate_first(req)

    assert res.werdykt == "NEGATYWNA"
    assert res.uzasadnienie_obowiazkowe is True
    assert res.wnioski_rozwojowe_dozwolone is False
    assert any("uzasadnienie przyznanej oceny jest obowiązkowe" in err for err in res.errors)
    assert any("Wniosków dotyczących rozwoju zawodowego ocenianego nie sporządza się" in err for err in res.errors)


def test_first_evaluation_rejects_scores_1_and_9() -> None:
    scores = _build_scores(MANDATORY_CRITERIA_FIRST_EVAL, [9, 5, 5, 5, 1], mandatory=True)
    req = EvaluationRequest(
        evaluation_type=EvaluationType.FIRST_EVALUATION,
        form_type=FormType.FIRST_EVAL_FORM,
        oceny_czastkowe=scores,
        egzamin_sluzba_przygotowawcza=TriStateOption.TAK,
        sprawozdanie_zlozone_w_terminie=True,
        uzasadnienie="Test błędnej skali.",
    )
    res = evaluate_first(req)

    assert any("Niedozwolona ocena cząstkowa 9 pkt" in err for err in res.errors)
    assert any("Niedozwolona ocena cząstkowa 1 pkt" in err for err in res.errors)


# ============================================================================
# TESTY KALENDARZA ŚWIĄT, ART. 112 KC, ART. 115 KC I NIEOBECNOŚCI
# ============================================================================


def test_movable_holidays_gauss_meeus_and_wigilia() -> None:
    assert compute_easter_sunday(2025) == date(2025, 4, 20)
    holidays_2025 = get_polish_statutory_holidays(2025)

    assert date(2025, 4, 21) in holidays_2025  # Poniedziałek Wielkanocny
    assert date(2025, 6, 8) in holidays_2025   # Zielone Świątki (+49 dni)
    assert date(2025, 6, 19) in holidays_2025  # Boże Ciało (+60 dni)
    assert date(2025, 12, 24) in holidays_2025 # Wigilia Bożego Narodzenia

    assert compute_easter_sunday(2026) == date(2026, 4, 5)
    holidays_2026 = get_polish_statutory_holidays(2026)
    assert date(2026, 6, 4) in holidays_2026   # Boże Ciało 2026


def test_art_112_kc_month_clamping() -> None:
    assert add_months_art_112_kc(date(2025, 1, 31), 1) == date(2025, 2, 28)
    assert add_months_art_112_kc(date(2024, 1, 31), 1) == date(2024, 2, 29)  # Rok przestępny
    assert add_months_art_112_kc(date(2025, 3, 15), 8) == date(2025, 11, 15)


def test_art_115_kc_christmas_chain_and_saturday_warning() -> None:
    """
    1) Zapoznanie z oceną 2025-12-17 + 7 dni na sprzeciw = 2025-12-24 (Wigilia, środa) ->
       25.12 (czw, Boże Narodzenie) -> 26.12 (pt, 2. dzień BN) -> 27.12 (sob) -> 28.12 (ndz) ->
       przesunięcie aż na poniedziałek 2025-12-29!
    2) Poprzednia ocena 2025-04-10 + 30 dni = 2025-05-10 (zwykła sobota) -> ostrzeżenie o sobocie.
    """
    req = DeadlineRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        data_poprzedniej_oceny_lub_zatrudnienia=date(2025, 4, 10),
        data_zapoznania_z_ocena=date(2025, 12, 17),
    )
    res = calculate_deadlines(req)

    assert res.termin_wniesienia_sprzeciwu_max == date(2025, 12, 29)
    assert res.przesunieto_z_art_115_kc["termin_wniesienia_sprzeciwu_max"] is True

    assert res.termin_rozmowy_wstepnej_max == date(2025, 5, 10)
    assert res.przesunieto_z_art_115_kc["termin_rozmowy_wstepnej_max"] is False
    assert any("przypada w sobotę" in w for w in res.warnings)


def test_first_evaluation_window_8_to_11_months_and_21_days_talk() -> None:
    """Zatrudnienie w czwartek 2025-01-09: rozmowa wstępna +21 dni = 2025-01-30, okno oceny 8–11 mies."""
    req = DeadlineRequest(
        evaluation_type=EvaluationType.FIRST_EVALUATION,
        data_nawiazania_stosunku_pracy=date(2025, 1, 9),
    )
    res = calculate_deadlines(req)

    assert res.errors == []
    assert res.termin_rozmowy_wstepnej_max == date(2025, 1, 30)
    assert res.minimalny_okres_sprawozdania_koniec == date(2025, 8, 9)
    assert res.termin_zlozenia_sprawozdania_min == date(2025, 9, 9)
    assert res.termin_dokonania_oceny_min == date(2025, 9, 9)
    assert res.termin_dokonania_oceny_max == date(2025, 12, 9)


def test_periodic_absence_extension_over_1_month_and_short_absence_ignored() -> None:
    """
    Art. 81 ust. 7 ustawy o SC:
    - dwa sąsiadujące zwolnienia (20 dni + 15 dni = 35 dni ciągłej nieobecności > 30 dni) wydłużają termin o 35 dni;
    - krótka 10-dniowa nieobecność jest ignorowana z ostrzeżeniem.
    """
    req = DeadlineRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        data_poprzedniej_oceny_lub_zatrudnienia=date(2025, 3, 3),
        nieobecnosci=[
            AbsencePeriod(od=date(2025, 6, 1), do=date(2025, 6, 20), powod="L4 cz. 1 (20 dni)"),
            AbsencePeriod(od=date(2025, 6, 21), do=date(2025, 7, 5), powod="L4 cz. 2 (15 dni)"),
            AbsencePeriod(od=date(2025, 10, 1), do=date(2025, 10, 10), powod="Krótkie L4 (10 dni)"),
        ],
    )
    res = calculate_deadlines(req)

    # Bazowo 24 mies. od 2025-03-03 -> 2027-03-03 + 35 dni = 2027-04-07 (środa)
    assert res.wydluzono_o_nieobecnosci_dni == 35
    assert res.termin_dokonania_oceny_max == date(2027, 4, 7)
    assert any("Pominięto 1 okres(y) nieobecności" in w for w in res.warnings)


def test_periodic_after_negative_evaluation_short_cycle() -> None:
    """Po ocenie negatywnej: 7 dni na rozmowę z kryteriami (§ 7 pkt 2) i 6 miesięcy na ponowną ocenę (art. 81 ust. 9)."""
    req = DeadlineRequest(
        evaluation_type=EvaluationType.PERIODIC_EVALUATION,
        data_poprzedniej_oceny_lub_zatrudnienia=date(2025, 3, 10),
        data_ustalenia_kryteriów=date(2025, 3, 14),
        poprzednia_ocena_negatywna=True,
    )
    res = calculate_deadlines(req)

    assert res.termin_rozmowy_wstepnej_max == date(2025, 3, 17)
    assert res.termin_dokonania_oceny_max == date(2025, 9, 15)  # 2025-09-14 to niedziela -> przesunięcie na 15.09!
    assert res.przesunieto_z_art_115_kc["termin_dokonania_oceny_max"] is True