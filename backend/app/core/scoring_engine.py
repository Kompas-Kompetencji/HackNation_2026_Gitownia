from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from app.core.config import (
    CRITERION_KOMUNIKACJA,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_PODEJMOWANIE_DECYZJI,
    CRITERION_RZETELNOSC,
    CRITERION_WSPOLPRACA,
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_ZARZADZANIE_LUDZMI,
    FIRST_EVAL_ALLOWED_SCORES,
    FIRST_EVAL_MAX_COUNT_OF_SCORE_3,
    FIRST_EVAL_MIN_AVERAGE_SCORE,
    IPRZ_RECOMMENDED_THRESHOLD_SCORE,
    MANDATORY_CRITERIA_FIRST_EVAL,
    MANDATORY_CRITERIA_FORM_B,
    MANDATORY_CRITERIA_FORM_C,
    MAX_ADDITIONAL_CRITERIA_PERIODIC,
    PERIODIC_ALLOWED_SCORES,
    PERIODIC_CRITICAL_FAIL_SCORE,
    PERIODIC_OVERALL_THRESHOLDS,
    STATUTORY_CRITERIA_CATALOG,
    normalize_criterion_name,
)
from app.schemas.models import (
    CivilServiceStatus,
    EvaluationRequest,
    EvaluationResponse,
    EvaluationType,
    FormType,
    TriStateOption,
)

# Jawne potwierdzenie powiązania stałych z wymogami rozporządzeń
assert list(MANDATORY_CRITERIA_FORM_B) == [
    CRITERION_ZARZADZANIE_LUDZMI,
    CRITERION_PODEJMOWANIE_DECYZJI,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_WSPOLPRACA,
    CRITERION_KOMUNIKACJA,
]
assert list(MANDATORY_CRITERIA_FORM_C) == [
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_RZETELNOSC,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_WSPOLPRACA,
    CRITERION_KOMUNIKACJA,
]
assert list(MANDATORY_CRITERIA_FIRST_EVAL) == [
    CRITERION_RZETELNOSC,
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_KOMUNIKACJA,
    CRITERION_WSPOLPRACA,
]


def round_half_up(value: Decimal | float | str, places: int = 2) -> float:
    """Zaokrągla liczbę dziesiętną matematycznie (ROUND_HALF_UP) do wskazanej liczby miejsc po przecinku."""
    dec_value = value if isinstance(value, Decimal) else Decimal(str(value))
    quantizer = Decimal("1") if places == 0 else Decimal(f"1.{'0' * places}")
    return float(dec_value.quantize(quantizer, rounding=ROUND_HALF_UP))


def determine_periodic_overall_level(avg: Decimal) -> str | None:
    """
    Wyznacza ogólny poziom spełniania kryteriów oceny okresowej zgodnie z § 11 ust. 1 pkt 2
    rozporządzenia Prezesa Rady Ministrów z dnia 4 kwietnia 2016 r. (Dz. U. poz. 470):
    - od 1 punktu do 2 punktów: 'znacznie poniżej oczekiwań'
    - powyżej 2 punktów do 4 punktów: 'poniżej oczekiwań'
    - powyżej 4 punktów do 6 punktów: 'na poziomie oczekiwań'
    - powyżej 6 punktów do 8 punktów: 'powyżej oczekiwań'
    - powyżej 8 punktów do 9 punktów: 'znacznie powyżej oczekiwań'
    """
    for low, high, closed_low, label, _is_pos in PERIODIC_OVERALL_THRESHOLDS:
        dec_low = Decimal(str(low))
        dec_high = Decimal(str(high))
        if closed_low:
            if dec_low <= avg <= dec_high:
                return label
        else:
            if dec_low < avg <= dec_high:
                return label
    return None


def evaluate_periodic(request: EvaluationRequest) -> EvaluationResponse:
    """
    Deterministyczny silnik oceny okresowej urzędnika lub pracownika służby cywilnej
    (Rozporządzenie PRM z dnia 4 kwietnia 2016 r., Dz. U. poz. 470 – Arkusz B oraz Arkusz C).
    """
    errors: list[str] = []
    warnings: list[str] = []
    powody_werdyktu: list[str] = []

    if request.evaluation_type != EvaluationType.PERIODIC_EVALUATION:
        errors.append(
            f"Niezgodny typ ścieżki oceny: oczekiwano PERIODIC_EVALUATION, otrzymano {request.evaluation_type}."
        )

    if request.form_type == FormType.FORM_B:
        expected_mandatory = list(MANDATORY_CRITERIA_FORM_B)
    elif request.form_type == FormType.FORM_C:
        expected_mandatory = list(MANDATORY_CRITERIA_FORM_C)
    else:
        expected_mandatory = list(MANDATORY_CRITERIA_FORM_C)
        errors.append(
            f"Dla oceny okresowej dozwolony jest wyłącznie arkusz FORM_B lub FORM_C (otrzymano: {request.form_type})."
        )

    expected_mandatory_set = set(expected_mandatory)
    statutory_set = set(STATUTORY_CRITERIA_CATALOG)

    mandatory_items = [item for item in request.oceny_czastkowe if item.is_mandatory]
    additional_items = [item for item in request.oceny_czastkowe if not item.is_mandatory]

    # 1. Walidacja kryteriów obowiązkowych (5 sztywnych kryteriów dla Arkusza B / C)
    provided_mandatory_names: list[str] = []
    for item in mandatory_items:
        norm_name = normalize_criterion_name(item.name)
        if norm_name in provided_mandatory_names:
            errors.append(f"Zduplikowane kryterium obowiązkowe: '{norm_name}'.")
        provided_mandatory_names.append(norm_name)

    missing_mandatory = [c for c in expected_mandatory if c not in provided_mandatory_names]
    unexpected_mandatory = [c for c in provided_mandatory_names if c not in expected_mandatory_set]

    if missing_mandatory:
        errors.append(
            f"Brakuje wymaganych kryteriów obowiązkowych dla {request.form_type}: {', '.join(missing_mandatory)}."
        )
    if unexpected_mandatory:
        errors.append(
            f"Wskazano kryteria spoza listy obowiązkowej dla {request.form_type}: {', '.join(unexpected_mandatory)}."
        )

    # 2. Walidacja kryteriów dodatkowych (0 do max 3 z katalogu 14, zakaz duplikatów względem obowiązkowych)
    if len(additional_items) > MAX_ADDITIONAL_CRITERIA_PERIODIC:
        errors.append(
            f"Przekroczono maksymalną liczbę kryteriów dodatkowych: wybrano {len(additional_items)}, "
            f"dozwolone maksymalnie {MAX_ADDITIONAL_CRITERIA_PERIODIC} (§ 5 ust. 2 rozporządzenia z 2016 r.)."
        )

    seen_additional: set[str] = set()
    for item in additional_items:
        norm_name = normalize_criterion_name(item.name)
        if norm_name not in statutory_set:
            errors.append(
                f"Kryterium dodatkowe '{item.name}' nie pochodzi z ustawowego wykazu 14 kryteriów (Załącznik nr 1)."
            )
        if norm_name in expected_mandatory_set or norm_name in provided_mandatory_names:
            errors.append(
                f"Kryterium dodatkowe '{norm_name}' powiela kryterium obowiązkowe dla {request.form_type}."
            )
        if norm_name in seen_additional:
            errors.append(f"Zduplikowane kryterium dodatkowe: '{norm_name}'.")
        seen_additional.add(norm_name)

    # 3. Walidacja skali punktowej {1, 3, 5, 7, 9} oraz zbieranie ocen krytycznych i rozwojowych
    critical_ones: list[str] = []
    iprz_mandatory_criteria: list[str] = []

    if not request.oceny_czastkowe:
        errors.append("Lista ocen cząstkowych jest pusta – nie można obliczyć wyniku oceny okresowej.")

    for item in request.oceny_czastkowe:
        norm_name = normalize_criterion_name(item.name)
        if item.score not in PERIODIC_ALLOWED_SCORES:
            errors.append(
                f"Niedozwolona ocena cząstkowa {item.score} pkt dla kryterium '{norm_name}'. "
                f"Dozwolona skala w ocenie okresowej to wyłącznie: {sorted(PERIODIC_ALLOWED_SCORES)}."
            )
        if item.score == PERIODIC_CRITICAL_FAIL_SCORE:
            critical_ones.append(norm_name)
        if item.score <= IPRZ_RECOMMENDED_THRESHOLD_SCORE and norm_name not in iprz_mandatory_criteria:
            iprz_mandatory_criteria.append(norm_name)

    # 4. Wyliczenie średniej arytmetycznej i ogólnego poziomu spełniania kryteriów
    if request.oceny_czastkowe:
        total_points = sum(Decimal(item.score) for item in request.oceny_czastkowe)
        raw_avg = total_points / Decimal(len(request.oceny_czastkowe))
        srednia_arytmetyczna = round_half_up(raw_avg, places=2)
        avg_for_thresholds = Decimal(f"{srednia_arytmetyczna:.2f}")
        ogolny_poziom = determine_periodic_overall_level(raw_avg) or determine_periodic_overall_level(avg_for_thresholds)
    else:
        raw_avg = Decimal("0")
        srednia_arytmetyczna = 0.0
        ogolny_poziom = None

    # 5. Ustalenie werdyktu zgodnie z § 11 ust. 1 pkt 3 i 4 rozporządzenia z 2016 r.
    werdykt: Literal["POZYTYWNA", "NEGATYWNA"]
    if not request.oceny_czastkowe:
        werdykt = "NEGATYWNA"
        powody_werdyktu.append("Brak przyznanych ocen cząstkowych.")
    else:
        is_avg_positive = raw_avg > Decimal("4")
        has_critical_one = len(critical_ones) > 0

        if is_avg_positive and not has_critical_one:
            werdykt = "POZYTYWNA"
            powody_werdyktu.append(
                f"Uzyskano średnią arytmetyczną {srednia_arytmetyczna:.2f} pkt (ogólny poziom: '{ogolny_poziom}', powyżej 4,00 pkt) "
                "oraz nie uzyskano żadnej oceny cząstkowej na poziomie 'znacznie poniżej oczekiwań' (1 pkt) "
                "(§ 11 ust. 1 pkt 3 rozporządzenia z 2016 r.)."
            )
        else:
            werdykt = "NEGATYWNA"
            if not is_avg_positive:
                powody_werdyktu.append(
                    f"Uzyskano średnią arytmetyczną {srednia_arytmetyczna:.2f} pkt (nieprzekraczającą progu 4,00 pkt; "
                    f"ogólny poziom: '{ogolny_poziom}') – § 11 ust. 1 pkt 4 rozporządzenia z 2016 r."
                )
            if has_critical_one:
                powody_werdyktu.append(
                    "Uzyskano co najmniej jedną ocenę cząstkową na poziomie 'znacznie poniżej oczekiwań' (1 pkt) "
                    f"w kryteriach: {', '.join(critical_ones)} – § 11 ust. 1 pkt 4 rozporządzenia z 2016 r."
                )

    # 6. Obligatoryjność uzasadnienia oraz wnioski IPRZ
    uzasadnienie_obowiazkowe = werdykt == "NEGATYWNA"
    wnioski_rozwojowe_dozwolone = True  # W ocenie okresowej wnioski dot. IPRZ (§ 11 ust. 1 pkt 5) są zawsze obecne

    if uzasadnienie_obowiazkowe and request.uzasadnienie is not None and not request.uzasadnienie.strip():
        errors.append(
            "Uzasadnienie przyznanej oceny okresowej jest obligatoryjne w przypadku oceny negatywnej "
            "(§ 11 ust. 3 rozporządzenia z 2016 r.)."
        )
    elif uzasadnienie_obowiazkowe and request.uzasadnienie is None:
        warnings.append(
            "Pamiętaj o obowiązkowym sporządzeniu pisemnego uzasadnienia dla negatywnej oceny okresowej "
            "(§ 11 ust. 3 rozporządzenia z 2016 r.)."
        )

    if iprz_mandatory_criteria and not (request.wnioski_iprz or "").strip():
        warnings.append(
            "We wnioskach dotyczących IPRZ należy uwzględnić działania rozwojowe dla kryteriów ocenionych poniżej oczekiwań: "
            f"{', '.join(iprz_mandatory_criteria)}."
        )

    # 7. Logika Części III arkusza (wniosek o przyznanie kolejnego stopnia służbowego - art. 89 ust. 1 ustawy o SC)
    wniosek_data = request.wniosek_kolejny_stopien
    wniosek_o_stopien = (
        wniosek_data is not None and wniosek_data.czy_dolaczono_wniosek == TriStateOption.TAK
    )

    if request.oceniany.status == CivilServiceStatus.PRACOWNIK_SC:
        include_part_3 = False
        if wniosek_data is not None and wniosek_data.czy_dolaczono_wniosek in {
            TriStateOption.TAK,
            TriStateOption.NIE,
        }:
            if wniosek_o_stopien:
                errors.append(
                    "Pracownikowi służby cywilnej (niemianowanemu) nie przysługuje wniosek o kolejny stopień służbowy "
                    "(Części III nie dołącza się – przypis 18 do arkusza oceny)."
                )
            else:
                warnings.append(
                    "Dla pracownika służby cywilnej w pytaniu o wniosek o stopień służbowy należy zaznaczyć opcję 'NIE DOTYCZY'."
                )
    else:
        # URZEDNIK_SC
        if wniosek_o_stopien and werdykt != "POZYTYWNA":
            include_part_3 = False
            errors.append(
                "Wniosek o przyznanie kolejnego stopnia służbowego można złożyć wyłącznie w przypadku uzyskania "
                "pozytywnej oceny okresowej (art. 89 ust. 1 ustawy o służbie cywilnej oraz § 11 ust. 5 rozporządzenia)."
            )
        elif wniosek_o_stopien and werdykt == "POZYTYWNA":
            include_part_3 = True
            if not (wniosek_data and (wniosek_data.umotywowanie_wniosku or "").strip()):
                warnings.append(
                    "Dołączono wniosek o przyznanie kolejnego stopnia służbowego (Część III) – wymagane jest jego umotywowanie (§ 11 ust. 5)."
                )
        else:
            include_part_3 = False

    return EvaluationResponse(
        srednia_arytmetyczna=srednia_arytmetyczna,
        ogolny_poziom=ogolny_poziom,
        werdykt=werdykt,
        powody_werdyktu=powody_werdyktu,
        iprz_mandatory_criteria=iprz_mandatory_criteria,
        uzasadnienie_obowiazkowe=uzasadnienie_obowiazkowe,
        wnioski_rozwojowe_dozwolone=wnioski_rozwojowe_dozwolone,
        include_part_3=include_part_3,
        errors=errors,
        warnings=warnings,
    )


def evaluate_first(request: EvaluationRequest) -> EvaluationResponse:
    """
    Deterministyczny silnik pierwszej oceny w służbie cywilnej
    (Rozporządzenie PRM z dnia 23 lipca 2015 r., Dz. U. poz. 1144 – Załącznik nr 2).
    """
    errors: list[str] = []
    warnings: list[str] = []
    powody_werdyktu: list[str] = []

    if request.evaluation_type != EvaluationType.FIRST_EVALUATION:
        errors.append(
            f"Niezgodny typ ścieżki oceny: oczekiwano FIRST_EVALUATION, otrzymano {request.evaluation_type}."
        )

    if request.form_type != FormType.FIRST_EVAL_FORM:
        errors.append(
            f"Dla pierwszej oceny w służbie cywilnej wymagany jest formularz FIRST_EVAL_FORM (otrzymano: {request.form_type})."
        )

    expected_elements = list(MANDATORY_CRITERIA_FIRST_EVAL)
    expected_set = set(expected_elements)

    # 1. Walidacja 5 sztywnych elementów oceny (zakaz kryteriów dodatkowych)
    non_mandatory = [item for item in request.oceny_czastkowe if not item.is_mandatory]
    if non_mandatory:
        errors.append(
            "W pierwszej ocenie w służbie cywilnej nie występują kryteria dodatkowe – ocenie podlega wyłącznie 5 stałych elementów."
        )

    provided_names: list[str] = []
    for item in request.oceny_czastkowe:
        norm_name = normalize_criterion_name(item.name)
        if norm_name in provided_names:
            errors.append(f"Zduplikowany element pierwszej oceny: '{norm_name}'.")
        provided_names.append(norm_name)

    missing_elements = [el for el in expected_elements if el not in provided_names]
    unexpected_elements = [el for el in provided_names if el not in expected_set]

    if missing_elements:
        errors.append(f"Brakuje wymaganych elementów pierwszej oceny: {', '.join(missing_elements)}.")
    if unexpected_elements:
        errors.append(f"Wskazano nieprawidłowe elementy pierwszej oceny: {', '.join(unexpected_elements)}.")

    # 2. Walidacja skali punktowej {3, 5, 7}
    scores_of_3: list[str] = []
    if not request.oceny_czastkowe:
        errors.append("Brak ocen cząstkowych za elementy pierwszej oceny.")

    for item in request.oceny_czastkowe:
        norm_name = normalize_criterion_name(item.name)
        if item.score not in FIRST_EVAL_ALLOWED_SCORES:
            errors.append(
                f"Niedozwolona ocena cząstkowa {item.score} pkt dla elementu '{norm_name}'. "
                f"Dozwolona skala w pierwszej ocenie to wyłącznie: {sorted(FIRST_EVAL_ALLOWED_SCORES)} (§ 9 ust. 1 rozporządzenia z 2015 r.)."
            )
        if item.score == 3 and norm_name not in scores_of_3:
            scores_of_3.append(norm_name)

    # 3. Średnia arytmetyczna z 5 elementów (Ocena łączna wg § 7 pkt 3)
    if request.oceny_czastkowe:
        total_points = sum(Decimal(item.score) for item in request.oceny_czastkowe)
        raw_avg = total_points / Decimal(len(request.oceny_czastkowe))
        srednia_arytmetyczna = round_half_up(raw_avg, places=2)
    else:
        raw_avg = Decimal("0")
        srednia_arytmetyczna = 0.0

    # 4. Weryfikacja 4 łącznych warunków pozytywnej pierwszej oceny (§ 10 ust. 1 rozporządzenia z 2015 r.)
    if request.egzamin_sluzba_przygotowawcza is None:
        errors.append("Nie wskazano informacji o zaliczeniu egzaminu ze służby przygotowawczej (TAK / NIE / NIE_DOTYCZY).")
        cond_exam = False
    else:
        cond_exam = request.egzamin_sluzba_przygotowawcza in {
            TriStateOption.TAK,
            TriStateOption.NIE_DOTYCZY,
        }

    if request.sprawozdanie_zlozone_w_terminie is None:
        errors.append("Nie wskazano informacji, czy sprawozdanie zostało złożone w wyznaczonym terminie.")
        cond_report = False
    else:
        cond_report = request.sprawozdanie_zlozone_w_terminie is True

    cond_max_one_three = len(scores_of_3) <= FIRST_EVAL_MAX_COUNT_OF_SCORE_3
    cond_min_average = (
        len(request.oceny_czastkowe) == len(expected_elements)
        and raw_avg >= Decimal(str(FIRST_EVAL_MIN_AVERAGE_SCORE))
    )

    werdykt: Literal["POZYTYWNA", "NEGATYWNA"]
    if cond_exam and cond_report and cond_max_one_three and cond_min_average:
        werdykt = "POZYTYWNA"
        powody_werdyktu.append(
            f"Spełniono łącznie wszystkie 4 warunki ustawowe (§ 10 ust. 1 rozporządzenia z 2015 r.): "
            f"egzamin ({request.egzamin_sluzba_przygotowawcza}), terminowe złożenie sprawozdania, "
            f"liczba ocen 3 pkt ({len(scores_of_3)} <= 1) oraz ocena łączna {srednia_arytmetyczna:.2f} pkt (>= 5,00 pkt)."
        )
    else:
        werdykt = "NEGATYWNA"
        if not cond_exam:
            powody_werdyktu.append(
                "Niezaliczenie egzaminu ze służby przygotowawczej lub brak wymaganego rozstrzygnięcia (§ 10 ust. 1 pkt 1 rozporządzenia z 2015 r.)."
            )
        if not cond_report:
            powody_werdyktu.append(
                "Niezłożenie sprawozdania w wyznaczonym terminie (§ 10 ust. 1 pkt 2 rozporządzenia z 2015 r.)."
            )
        if not cond_max_one_three:
            powody_werdyktu.append(
                f"Uzyskano więcej niż jedną ocenę cząstkową w wysokości 3 punktów ({len(scores_of_3)} oceny 3 pkt w elementach: "
                f"{', '.join(scores_of_3)}) – § 10 ust. 1 pkt 3 rozporządzenia z 2015 r."
            )
        if not cond_min_average:
            powody_werdyktu.append(
                f"Uzyskano ocenę łączną {srednia_arytmetyczna:.2f} pkt, tj. niższą niż wymagane 5,00 punktów "
                "(§ 10 ust. 1 pkt 4 rozporządzenia z 2015 r.)."
            )

    # 5. Reguły uzasadnienia i wniosków rozwojowych przy Pierwszej Ocenie (§ 10 ust. 4-6 oraz przypisy 7 i 8)
    uzasadnienie_obowiazkowe = werdykt == "NEGATYWNA"
    wnioski_rozwojowe_dozwolone = werdykt == "POZYTYWNA"

    if uzasadnienie_obowiazkowe and request.uzasadnienie is not None and not request.uzasadnienie.strip():
        errors.append(
            "W przypadku przyznania negatywnej pierwszej oceny uzasadnienie przyznanej oceny jest obowiązkowe "
            "(§ 10 ust. 4 rozporządzenia z 2015 r.)."
        )
    elif uzasadnienie_obowiazkowe and request.uzasadnienie is None:
        warnings.append(
            "Pamiętaj o obowiązkowym sporządzeniu pisemnego uzasadnienia dla negatywnej pierwszej oceny "
            "(§ 10 ust. 4 rozporządzenia z 2015 r.)."
        )

    if not wnioski_rozwojowe_dozwolone and (request.wnioski_rozwojowe_pierwsza_ocena or "").strip():
        errors.append(
            "Wniosków dotyczących rozwoju zawodowego ocenianego nie sporządza się w przypadku przyznania negatywnej "
            "pierwszej oceny (§ 10 ust. 6 oraz przypis 8 do Załącznika nr 2 rozporządzenia z 2015 r.)."
        )

    return EvaluationResponse(
        srednia_arytmetyczna=srednia_arytmetyczna,
        ogolny_poziom=None,
        werdykt=werdykt,
        powody_werdyktu=powody_werdyktu,
        iprz_mandatory_criteria=scores_of_3,
        uzasadnienie_obowiazkowe=uzasadnienie_obowiazkowe,
        wnioski_rozwojowe_dozwolone=wnioski_rozwojowe_dozwolone,
        include_part_3=False,
        errors=errors,
        warnings=warnings,
    )


def evaluate(request: EvaluationRequest) -> EvaluationResponse:
    """Główny punkt wejścia silnika oceniania kierujący do odpowiedniej ścieżki prawnej."""
    if request.evaluation_type == EvaluationType.FIRST_EVALUATION:
        return evaluate_first(request)
    return evaluate_periodic(request)