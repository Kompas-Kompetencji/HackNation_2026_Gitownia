from __future__ import annotations

import calendar
from datetime import date, timedelta
from functools import lru_cache

from app.core.config import (
    APPEAL_DEADLINE_DAYS,
    FIRST_EVAL_DEFAULT_CONTRACT_MONTHS,
    FIRST_EVAL_INITIAL_INTERVIEW_DAYS,
    FIRST_EVAL_MIN_MONTHS_BEFORE_CONTRACT_END,
    FIRST_EVAL_MIN_WORKED_MONTHS_FOR_REPORT,
    FIRST_EVAL_REPORT_AFTER_MONTHS,
    PERIODIC_AFTER_NEGATIVE_INTERVAL_MONTHS,
    PERIODIC_CRITERIA_SETUP_DAYS_AFTER_NEGATIVE,
    PERIODIC_CRITERIA_SETUP_DAYS_STANDARD,
    PERIODIC_POSITION_CHANGE_DAYS_AFTER,
    PERIODIC_POSITION_CHANGE_DAYS_BEFORE,
    PERIODIC_POSITION_CHANGE_MIN_MONTHS,
    PERIODIC_STANDARD_INTERVAL_MONTHS,
)
from app.schemas.models import (
    AbsencePeriod,
    DeadlineRequest,
    DeadlineResponse,
    EvaluationType,
)

# Próg ciągłej usprawiedliwionej nieobecności wydłużającej termin oceny okresowej
# (art. 81 ust. 7 ustawy o służbie cywilnej w zw. z art. 114 KC: powyżej 1 miesiąca = > 30 dni)
CONTINUOUS_ABSENCE_MONTH_DAYS_THRESHOLD: int = 30


@lru_cache(maxsize=128)
def compute_easter_sunday(year: int) -> date:
    """
    Oblicza datę Niedzieli Wielkanocnej w kalendarzu gregoriańskim algorytmem Meeusa/Jonesa/Butchera
    (rozszerzony algorytm Gaussa bez wyjątków stuleci).
    """
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l_val = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_val) // 451
    month = (h + l_val - 7 * m + 114) // 31
    day = ((h + l_val - 7 * m + 114) % 31) + 1
    return date(year, month, day)


@lru_cache(maxsize=128)
def get_polish_statutory_holidays(year: int) -> dict[date, str]:
    """
    Zwraca słownik polskich świąt ustawowo wolnych od pracy dla zadanego roku
    (ustawa z dnia 18 stycznia 1951 r. o dniach wolnych od pracy – święta stałe, w tym Wigilia 24.12,
    oraz święta ruchome wyliczane względem Wielkanocy).
    """
    easter = compute_easter_sunday(year)
    easter_monday = easter + timedelta(days=1)
    pentecost = easter + timedelta(days=49)      # Pierwszy dzień Zielonych Świątek
    corpus_christi = easter + timedelta(days=60)  # Dzień Bożego Ciała

    holidays: dict[date, str] = {
        date(year, 1, 1): "Nowy Rok",
        date(year, 1, 6): "Święto Trzech Króli",
        easter: "Pierwszy dzień Wielkiej Nocy (Wielkanoc)",
        easter_monday: "Drugi dzień Wielkiej Nocy (Poniedziałek Wielkanocny)",
        date(year, 5, 1): "Święto Państwowe (Święto Pracy)",
        date(year, 5, 3): "Święto Narodowe Trzeciego Maja",
        pentecost: "Pierwszy dzień Zielonych Świątek",
        corpus_christi: "Dzień Bożego Ciała",
        date(year, 8, 15): "Wniebowzięcie Najświętszej Maryi Panny",
        date(year, 11, 1): "Wszystkich Świętych",
        date(year, 11, 11): "Narodowe Święto Niepodległości",
        date(year, 12, 24): "Wigilia Bożego Narodzenia",
        date(year, 12, 25): "Pierwszy dzień Bożego Narodzenia",
        date(year, 12, 26): "Drugi dzień Bożego Narodzenia",
    }
    return holidays


def is_statutory_free_day(target: date) -> bool:
    """Sprawdza, czy dany dzień jest niedzielą lub polskim świętem ustawowo wolnym od pracy."""
    if target.weekday() == 6:  # Niedziela
        return True
    return target in get_polish_statutory_holidays(target.year)


def is_working_day(target: date) -> bool:
    """Sprawdza, czy dany dzień jest dniem roboczym urzędu administracji rządowej (poniedziałek–piątek, poza świętami)."""
    if target.weekday() >= 5:  # Sobota (5) lub Niedziela (6)
        return False
    return target not in get_polish_statutory_holidays(target.year)


def add_months_art_112_kc(base_date: date, months: int) -> date:
    """
    Oblicza upływ terminu oznaczonego w miesiącach zgodnie z art. 112 Kodeksu cywilnego:
    termin kończy się z upływem dnia, który datą odpowiada początkowemu dniowi terminu,
    a gdyby takiego dnia w ostatnim miesiącu nie było – w ostatnim dniu tego miesiąca.
    Obsługuje zarówno dodatnią, jak i ujemną liczbę miesięcy.
    """
    total_months = (base_date.year * 12 + (base_date.month - 1)) + months
    target_year = total_months // 12
    target_month = (total_months % 12) + 1
    max_day = calendar.monthrange(target_year, target_month)[1]
    target_day = min(base_date.day, max_day)
    return date(target_year, target_month, target_day)


def apply_art_115_kc(
    raw_date: date,
    field_name: str,
    shifted_flags: dict[str, bool],
    warnings: list[str],
    human_label: str,
) -> date:
    """
    Stosuje regułę przesuwania końca terminu przypadającego na niedzielę lub święto ustawowe
    na kolejny dzień roboczy (art. 115 KC), a gdy termin wypada w zwykłą sobotę (niebędącą świętem),
    generuje wyraźne ostrzeżenie formalne dla oceniającego.
    """
    if is_statutory_free_day(raw_date):
        holidays = get_polish_statutory_holidays(raw_date.year)
        reason = holidays.get(raw_date, "niedziela")
        current = raw_date + timedelta(days=1)
        while not is_working_day(current):
            current += timedelta(days=1)
        shifted_flags[field_name] = True
        warnings.append(
            f"Termin '{human_label}' wypadał w dzień ustawowo wolny od pracy ({raw_date.isoformat()} – {reason}) "
            f"i został przesunięty zgodnie z art. 115 KC na najbliższy dzień roboczy: {current.isoformat()}."
        )
        return current

    shifted_flags[field_name] = False
    if raw_date.weekday() == 5:  # Zwykła sobota (niebędąca świętem ustawowym)
        prev_friday = raw_date - timedelta(days=1)
        while not is_working_day(prev_friday):
            prev_friday -= timedelta(days=1)
        warnings.append(
            f"Uwaga: termin '{human_label}' ({raw_date.isoformat()}) przypada w sobotę. "
            f"Ze względu na organizację pracy urzędu zaleca się dokonanie czynności najpóźniej w poprzedzający dzień roboczy ({prev_friday.isoformat()})."
        )
    return raw_date


def merge_absence_periods(absences: list[AbsencePeriod]) -> list[AbsencePeriod]:
    """
    Scala nakładające się lub bezpośrednio sąsiadujące ze sobą okresy nieobecności
    (np. kolejne zwolnienia lekarskie następujące dzień po dniu), zachowując ciągłość biegu nieobecności.
    """
    if not absences:
        return []

    sorted_abs = sorted(absences, key=lambda a: (a.od, a.do))
    merged: list[AbsencePeriod] = [sorted_abs[0].model_copy()]

    for current in sorted_abs[1:]:
        last = merged[-1]
        if current.od <= last.do + timedelta(days=1):
            new_do = max(last.do, current.do)
            combined_reason: str | None
            if last.powod and current.powod and current.powod not in last.powod:
                combined_reason = f"{last.powod}; {current.powod}"
            else:
                combined_reason = last.powod or current.powod
            merged[-1] = AbsencePeriod(od=last.od, do=new_do, powod=combined_reason)
        else:
            merged.append(current.model_copy())

    return merged


def _calculate_first_evaluation_deadlines(request: DeadlineRequest) -> DeadlineResponse:
    errors: list[str] = []
    warnings: list[str] = []
    shifted_flags: dict[str, bool] = {}

    hire_date = request.data_nawiazania_stosunku_pracy
    if hire_date is None:
        errors.append(
            "Dla ścieżki FIRST_EVALUATION wymagane jest podanie daty nawiązania stosunku pracy (data_nawiazania_stosunku_pracy)."
        )
        return DeadlineResponse(
            evaluation_type=request.evaluation_type,
            errors=errors,
            warnings=warnings,
        )

    contract_end = request.data_zakonczenia_umowy or add_months_art_112_kc(
        hire_date, FIRST_EVAL_DEFAULT_CONTRACT_MONTHS
    )
    if contract_end <= hire_date:
        errors.append(
            f"Data zakończenia umowy ({contract_end.isoformat()}) musi być późniejsza niż data nawiązania stosunku pracy ({hire_date.isoformat()})."
        )

    # 1. Rozmowa wstępna: 21 dni od dnia nawiązania stosunku pracy (§ 3 rozp. z 2015 r. + art. 111 § 2 KC)
    raw_initial_talk = hire_date + timedelta(days=FIRST_EVAL_INITIAL_INTERVIEW_DAYS)
    termin_rozmowy_wstepnej_max = apply_art_115_kc(
        raw_initial_talk,
        field_name="termin_rozmowy_wstepnej_max",
        shifted_flags=shifted_flags,
        warnings=warnings,
        human_label="Rozmowa wstępna (21 dni)",
    )

    # 2. Sprawdzenie nieobecności przedłużających termin sprawozdania (§ 5 ust. 1–3 rozp. z 2015 r.)
    merged_absences = merge_absence_periods(request.nieobecnosci)
    extension_days = 0
    for period in merged_absences:
        # Uwzględniamy wyłącznie dni nieobecności przypadające od dnia nawiązania stosunku pracy
        eff_start = max(period.od, hire_date)
        if period.do >= eff_start:
            extension_days += (period.do - eff_start).days + 1

    # 3. Minimalny przepracowany okres sprawozdania (7 miesięcy wg § 6 ust. 1)
    base_min_report = add_months_art_112_kc(hire_date, FIRST_EVAL_MIN_WORKED_MONTHS_FOR_REPORT)
    minimalny_okres_sprawozdania_koniec = base_min_report + timedelta(days=extension_days)

    # 4. Termin na złożenie sprawozdania i najwcześniejsza data pierwszej oceny:
    # po upływie 8 miesięcy od nawiązania stosunku pracy (§ 4 ust. 1 rozp. z 2015 r. oraz art. 38 ust. 1 ustawy o SC)
    base_after_8m = add_months_art_112_kc(hire_date, FIRST_EVAL_REPORT_AFTER_MONTHS)
    termin_zlozenia_sprawozdania_min = base_after_8m + timedelta(days=extension_days)
    termin_dokonania_oceny_min = termin_zlozenia_sprawozdania_min

    # 5. Ostateczny termin dokonania pierwszej oceny: nie później niż 1 miesiąc przed zakończeniem umowy
    # (dla standardowej umowy 12-miesięcznej przypada w 11. miesiącu od zatrudnienia)
    raw_eval_max = add_months_art_112_kc(contract_end, -FIRST_EVAL_MIN_MONTHS_BEFORE_CONTRACT_END)
    termin_dokonania_oceny_max = apply_art_115_kc(
        raw_eval_max,
        field_name="termin_dokonania_oceny_max",
        shifted_flags=shifted_flags,
        warnings=warnings,
        human_label="Ostateczny termin dokonania pierwszej oceny (1 mies. przed końcem umowy)",
    )

    informacja_o_wydluzeniu: str | None = None
    if extension_days > 0:
        informacja_o_wydluzeniu = (
            f"Uwzględniono łącznie {extension_days} dni usprawiedliwionej nieobecności / pracy poza urzędem "
            "(§ 5 ust. 1 rozporządzenia z 2015 r.)."
        )
        if termin_dokonania_oceny_min > termin_dokonania_oceny_max:
            warnings.append(
                f"Wydłużony o nieobecności termin złożenia sprawozdania ({termin_zlozenia_sprawozdania_min.isoformat()}) "
                f"przekracza ostateczny termin dokonania pierwszej oceny ({termin_dokonania_oceny_max.isoformat()}, "
                "tj. 1 miesiąc przed końcem umowy). Rozważ przedłużenie umowy o pracę w trybie art. 35 ust. 4 ustawy o SC."
            )

    termin_sprzeciwu: date | None = None
    if request.data_zapoznania_z_ocena is not None:
        warnings.append(
            "Uwaga: od pierwszej oceny w służbie cywilnej nie przysługuje sprzeciw z art. 83 ust. 1 ustawy o SC "
            "(instytucja sprzeciwu dotyczy wyłącznie oceny okresowej)."
        )

    return DeadlineResponse(
        evaluation_type=request.evaluation_type,
        termin_rozmowy_wstepnej_max=termin_rozmowy_wstepnej_max,
        minimalny_okres_sprawozdania_koniec=minimalny_okres_sprawozdania_koniec,
        termin_zlozenia_sprawozdania_min=termin_zlozenia_sprawozdania_min,
        termin_dokonania_oceny_min=termin_dokonania_oceny_min,
        termin_dokonania_oceny_max=termin_dokonania_oceny_max,
        termin_wniesienia_sprzeciwu_max=termin_sprzeciwu,
        przesunieto_z_art_115_kc=shifted_flags,
        wydluzono_o_nieobecnosci_dni=extension_days,
        informacja_o_wydluzeniu=informacja_o_wydluzeniu,
        errors=errors,
        warnings=warnings,
    )


def _calculate_periodic_evaluation_deadlines(request: DeadlineRequest) -> DeadlineResponse:
    errors: list[str] = []
    warnings: list[str] = []
    shifted_flags: dict[str, bool] = {}

    anchor_date = request.data_poprzedniej_oceny_lub_zatrudnienia
    criteria_date = request.data_ustalenia_kryteriów

    if anchor_date is None and criteria_date is None and request.data_zapoznania_z_ocena is None:
        errors.append(
            "Dla ścieżki PERIODIC_EVALUATION należy podać co najmniej jedną datę bazową: "
            "data_poprzedniej_oceny_lub_zatrudnienia, data_ustalenia_kryteriów lub data_zapoznania_z_ocena."
        )
        return DeadlineResponse(
            evaluation_type=request.evaluation_type,
            errors=errors,
            warnings=warnings,
        )

    # 1. Termin rozmowy rozpoczynającej i zapoznania z kryteriami (§ 7 rozporządzenia z 2016 r.):
    # - 7 dni od sporządzenia negatywnej oceny (§ 7 pkt 2)
    # - 30 dni od sporządzenia poprzedniej oceny pozytywnej lub zatrudnienia na czas nieokreślony (§ 7 pkt 1)
    termin_rozmowy_wstepnej_max: date | None = None
    if anchor_date is not None:
        setup_days = (
            PERIODIC_CRITERIA_SETUP_DAYS_AFTER_NEGATIVE
            if request.poprzednia_ocena_negatywna
            else PERIODIC_CRITERIA_SETUP_DAYS_STANDARD
        )
        label = (
            f"Zapoznanie z kryteriami po ocenie negatywnej ({setup_days} dni)"
            if request.poprzednia_ocena_negatywna
            else f"Rozmowa i zapoznanie z kryteriami oceny okresowej ({setup_days} dni)"
        )
        termin_rozmowy_wstepnej_max = apply_art_115_kc(
            anchor_date + timedelta(days=setup_days),
            field_name="termin_rozmowy_wstepnej_max",
            shifted_flags=shifted_flags,
            warnings=warnings,
            human_label=label,
        )

    # 2. Obliczenie wydłużenia terminu oceny okresowej o ciągłe nieobecności > 1 miesiąc (art. 81 ust. 7 ustawy o SC)
    merged_absences = merge_absence_periods(request.nieobecnosci)
    qualifying_days = 0
    ignored_periods_count = 0

    cycle_start = anchor_date or criteria_date
    for period in merged_absences:
        eff_start = max(period.od, cycle_start) if cycle_start is not None else period.od
        if period.do < eff_start:
            continue
        duration_days = (period.do - eff_start).days + 1
        if duration_days > CONTINUOUS_ABSENCE_MONTH_DAYS_THRESHOLD:
            qualifying_days += duration_days
        else:
            ignored_periods_count += 1

    informacja_o_wydluzeniu: str | None = None
    if qualifying_days > 0:
        informacja_o_wydluzeniu = (
            f"Termin sporządzenia oceny okresowej wydłużono łącznie o {qualifying_days} dni z tytułu ciągłych "
            "usprawiedliwionych nieobecności trwających dłużej niż 1 miesiąc (art. 81 ust. 7 ustawy o służbie cywilnej)."
        )
    if ignored_periods_count > 0:
        msg_short = (
            f"Pominięto {ignored_periods_count} okres(y) nieobecności nieprzekraczające 1 miesiąca (<= 30 dni), "
            "które nie wydłużają terminu oceny okresowej w świetle art. 81 ust. 7 ustawy o służbie cywilnej."
        )
        warnings.append(msg_short)
        if informacja_o_wydluzeniu is None:
            informacja_o_wydluzeniu = msg_short

    # 3. Termin sporządzenia oceny okresowej:
    # - standardowo 24 miesiące od poprzedniej oceny albo od ustalenia kryteriów przy pierwszej ocenie okresowej (art. 81 ust. 4)
    # - 6 miesięcy w razie uzyskania oceny negatywnej (art. 81 ust. 9 - liczony od zapoznania z kryteriami lub poprzedniej oceny)
    termin_dokonania_oceny_max: date | None = None
    eval_base = (criteria_date or anchor_date) if request.poprzednia_ocena_negatywna else (anchor_date or criteria_date)

    if eval_base is not None:
        months_interval = (
            PERIODIC_AFTER_NEGATIVE_INTERVAL_MONTHS
            if request.poprzednia_ocena_negatywna
            else PERIODIC_STANDARD_INTERVAL_MONTHS
        )
        base_due_date = add_months_art_112_kc(eval_base, months_interval) + timedelta(days=qualifying_days)
        termin_dokonania_oceny_max = apply_art_115_kc(
            base_due_date,
            field_name="termin_dokonania_oceny_max",
            shifted_flags=shifted_flags,
            warnings=warnings,
            human_label=f"Sporządzenie oceny okresowej ({months_interval} mies.)",
        )

    # 4. Zmiana stanowiska pracy z istotną zmianą zakresu obowiązków (§ 9 ust. 1 i 2 rozporządzenia z 2016 r.)
    zmiana_od: date | None = None
    zmiana_do: date | None = None
    if request.data_zmiany_stanowiska is not None:
        pos_change = request.data_zmiany_stanowiska
        ref_start = anchor_date or criteria_date
        six_months_mark = add_months_art_112_kc(ref_start, PERIODIC_POSITION_CHANGE_MIN_MONTHS) if ref_start else None

        if six_months_mark is not None and pos_change < six_months_mark:
            # Poniżej 6 miesięcy (§ 9 ust. 1): nie sporządza się oceny, lecz w 30 dni ponownie ustala kryteria
            zmiana_do = apply_art_115_kc(
                pos_change + timedelta(days=PERIODIC_POSITION_CHANGE_DAYS_AFTER),
                field_name="termin_oceny_przy_zmianie_stanowiska_do",
                shifted_flags=shifted_flags,
                warnings=warnings,
                human_label="Ponowne ustalenie kryteriów po zmianie stanowiska (30 dni)",
            )
            warnings.append(
                "Zmiana stanowiska nastąpiła przed upływem 6 miesięcy – zgodnie z § 9 ust. 1 rozporządzenia z 2016 r. "
                "w terminie 30 dni należy ponownie ustalić kryteria oceny (termin samej oceny nie ulega zmianie)."
            )
        else:
            # Co najmniej 6 miesięcy (art. 81 ust. 6 ustawy o SC oraz § 9 ust. 2 rozp. z 2016 r.):
            # ocena nie wcześniej niż 7 dni przed zmianą i nie później niż 30 dni od zmiany
            zmiana_od = pos_change - timedelta(days=PERIODIC_POSITION_CHANGE_DAYS_BEFORE)
            zmiana_do = apply_art_115_kc(
                pos_change + timedelta(days=PERIODIC_POSITION_CHANGE_DAYS_AFTER),
                field_name="termin_oceny_przy_zmianie_stanowiska_do",
                shifted_flags=shifted_flags,
                warnings=warnings,
                human_label="Sporządzenie oceny w związku ze zmianą stanowiska (30 dni)",
            )

    # 5. Termin na wniesienie sprzeciwu do dyrektora generalnego urzędu: 7 dni (art. 83 ust. 1 ustawy o SC)
    termin_sprzeciwu: date | None = None
    if request.data_zapoznania_z_ocena is not None:
        termin_sprzeciwu = apply_art_115_kc(
            request.data_zapoznania_z_ocena + timedelta(days=APPEAL_DEADLINE_DAYS),
            field_name="termin_wniesienia_sprzeciwu_max",
            shifted_flags=shifted_flags,
            warnings=warnings,
            human_label="Wniesienie sprzeciwu od oceny okresowej (7 dni)",
        )

    return DeadlineResponse(
        evaluation_type=request.evaluation_type,
        termin_rozmowy_wstepnej_max=termin_rozmowy_wstepnej_max,
        termin_dokonania_oceny_min=zmiana_od,
        termin_dokonania_oceny_max=termin_dokonania_oceny_max,
        termin_oceny_przy_zmianie_stanowiska_od=zmiana_od,
        termin_oceny_przy_zmianie_stanowiska_do=zmiana_do,
        termin_wniesienia_sprzeciwu_max=termin_sprzeciwu,
        przesunieto_z_art_115_kc=shifted_flags,
        wydluzono_o_nieobecnosci_dni=qualifying_days,
        informacja_o_wydluzeniu=informacja_o_wydluzeniu,
        errors=errors,
        warnings=warnings,
    )


def calculate_deadlines(request: DeadlineRequest) -> DeadlineResponse:
    """Wyznacza wszystkie terminy ustawowe dla wybranej ścieżki oceny w służbie cywilnej."""
    if request.evaluation_type == EvaluationType.FIRST_EVALUATION:
        return _calculate_first_evaluation_deadlines(request)
    return _calculate_periodic_evaluation_deadlines(request)