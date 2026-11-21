from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EvaluationType(StrEnum):
    """Ścieżka oceny w służbie cywilnej."""

    FIRST_EVALUATION = "FIRST_EVALUATION"
    PERIODIC_EVALUATION = "PERIODIC_EVALUATION"


class FormType(StrEnum):
    """Typ formularza urzędowego (Załącznik nr 3 / nr 4 z 2016 r. lub Załącznik nr 2 z 2015 r.)."""

    FORM_B = "FORM_B"
    FORM_C = "FORM_C"
    FIRST_EVAL_FORM = "FIRST_EVAL_FORM"


class CivilServiceStatus(StrEnum):
    """Status prawny ocenianego członka korpusu służby cywilnej."""

    PRACOWNIK_SC = "PRACOWNIK_SC"
    URZEDNIK_SC = "URZEDNIK_SC"


class TriStateOption(StrEnum):
    """Trójwartościowe pole wyboru stosowane w arkuszach urzędowych (np. egzamin, wniosek o stopień)."""

    TAK = "TAK"
    NIE = "NIE"
    NIE_DOTYCZY = "NIE_DOTYCZY"


# ============================================================================
# 1. PARSER OPISU STANOWISKA PRACY (OSP)
# ============================================================================


class OspParseResult(BaseModel):
    """Ustrukturyzowany wynik parsowania dokumentu Opisu Stanowiska Pracy (.docx / .pdf)."""

    model_config = ConfigDict(extra="forbid")

    nazwa_urzedu: str = Field(default="", description="Pkt 1.1 OSP - Nazwa urzędu")
    komorka_organizacyjna: str = Field(
        default="", description="Pkt 1.2 OSP - Nazwa komórki organizacyjnej urzędu (departament / wydział)"
    )
    stanowisko_pracy: str = Field(
        default="", description="Pkt 1.3 (oraz opcjonalnie 1.4) OSP - Pełna nazwa stanowiska pracy"
    )
    symbol_stanowiska: str = Field(default="", description="Pkt 1.5 OSP - Symbol stanowiska pracy")
    cel_stanowiska: str = Field(default="", description="Pkt 4 OSP - Cel istnienia stanowiska pracy")
    kieruje_pracownikami: bool = Field(
        default=False,
        description="Czy na stanowisku praca polega na bezpośrednim kierowaniu pracownikami (Pkt 5 OSP)",
    )
    liczba_podleglych_tekst: str = Field(
        default="brak podległych pracowników",
        description="Zaznaczona opcja tekstowa w Pkt 5 OSP (Liczba podległych pracowników)",
    )
    zalecany_arkusz: FormType = Field(
        ...,
        description="Rekomendowany formularz oceny okresowej (FORM_B dla kierujących, FORM_C dla pozostałych)",
    )
    zadania_dominujace: list[str] = Field(
        default_factory=list, description="Pkt 6 OSP - Zadania dominujące (najczęściej wykonywane)"
    )
    zadania_pozostale: list[str] = Field(
        default_factory=list, description="Pkt 6 OSP - Pozostałe zadania realizowane na stanowisku"
    )
    kompetencje_miekkie_z_osp: list[str] = Field(
        default_factory=list,
        description="Pkt 13 OSP - Wymagane kompetencje miękkie zmapowane do katalogu ustawowego",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Ostrzeżenia parsera (np. brak zaznaczonego checkboxa, nieznana nazwa kompetencji)",
    )


# ============================================================================
# 2. KALKULATOR TERMINÓW USTAWOWYCH (Z UWZGLĘDNIENIEM ART. 115 KC I NIEOBECNOŚCI)
# ============================================================================


class AbsencePeriod(BaseModel):
    """Okres usprawiedliwionej nieobecności w pracy lub wykonywania obowiązków poza miejscem pracy."""

    model_config = ConfigDict(extra="forbid")

    od: date = Field(..., description="Data początkowa okresu nieobecności (włącznie)")
    do: date = Field(..., description="Data końcowa okresu nieobecności (włącznie)")
    powod: str | None = Field(
        default=None,
        description="Opcjonalny opis powodu (np. urlop macierzyński, choroba, oddelegowanie)",
    )

    @model_validator(mode="after")
    def validate_date_order(self) -> AbsencePeriod:
        if self.do < self.od:
            raise ValueError(f"Data końcowa nieobecności ({self.do}) nie może być wcześniejsza niż początkowa ({self.od}).")
        return self


class DeadlineRequest(BaseModel):
    """Żądanie wyliczenia terminów granicznych dla pierwszej oceny lub oceny okresowej."""

    model_config = ConfigDict(extra="forbid")

    evaluation_type: EvaluationType = Field(..., description="Ścieżka oceny: FIRST_EVALUATION lub PERIODIC_EVALUATION")

    # Pola dla Pierwszej Oceny (Dz. U. 2015 poz. 1144)
    data_nawiazania_stosunku_pracy: date | None = Field(
        default=None,
        description="Data nawiązania stosunku pracy (lub ustalenia podlegania pierwszej ocenie przy zastępstwie)",
    )
    data_zakonczenia_umowy: date | None = Field(
        default=None,
        description="Data zakończenia umowy na czas określony (domyślnie +12 m-cy od nawiązania stosunku pracy)",
    )

    # Pola dla Oceny Okresowej (Dz. U. 2016 poz. 470)
    data_poprzedniej_oceny_lub_zatrudnienia: date | None = Field(
        default=None,
        description="Data sporządzenia poprzedniej oceny na piśmie lub zatrudnienia na czas nieokreślony (§ 7)",
    )
    poprzednia_ocena_negatywna: bool = Field(
        default=False,
        description="Czy poprzednia ocena okresowa była negatywna (skraca termin rozmowy do 7 dni i okres oceny do 6 m-cy)",
    )
    data_ustalenia_kryteriów: date | None = Field(
        default=None,
        description="Data zapoznania ocenianego z kryteriami oceny (Część I arkusza)",
    )
    data_zmiany_stanowiska: date | None = Field(
        default=None,
        description="Data zmiany stanowiska pracy wiążącej się z istotną zmianą zakresu obowiązków (§ 9)",
    )

    # Pola wspólne
    data_zapoznania_z_ocena: date | None = Field(
        default=None,
        description="Data zapoznania ocenianego z oceną na piśmie (do wyliczenia 7-dniowego terminu na sprzeciw)",
    )
    nieobecnosci: list[AbsencePeriod] = Field(
        default_factory=list,
        description="Lista okresów usprawiedliwionej nieobecności lub wykonywania obowiązków poza urzędem",
    )


class DeadlineResponse(BaseModel):
    """Wyliczone daty graniczne, przesunięcia z art. 115 Kodeksu cywilnego oraz diagnostyka."""

    model_config = ConfigDict(extra="forbid")

    evaluation_type: EvaluationType

    # Wyliczone daty dla Pierwszej Oceny
    termin_rozmowy_wstepnej_max: date | None = Field(
        default=None,
        description="Ostateczny termin przeprowadzenia rozmowy wstępnej (21 dni wg § 3 rozp. z 2015 r. lub 30/7 dni wg § 7 rozp. z 2016 r.)",
    )
    minimalny_okres_sprawozdania_koniec: date | None = Field(
        default=None,
        description="Data upływu minimalnego 7-miesięcznego okresu przepracowanego (§ 6 ust. 1 rozp. z 2015 r.)",
    )
    termin_zlozenia_sprawozdania_min: date | None = Field(
        default=None,
        description="Najwcześniejsza data wyznaczenia terminu złożenia sprawozdania - po upływie 8 m-cy (§ 4 ust. 1 rozp. z 2015 r.)",
    )
    termin_dokonania_oceny_min: date | None = Field(
        default=None,
        description="Najwcześniejsza dopuszczalna data dokonania oceny",
    )
    termin_dokonania_oceny_max: date | None = Field(
        default=None,
        description="Ostateczny termin sporządzenia oceny (np. 1 m-c przed końcem umowy lub 24/6 m-cy w ocenie okresowej)",
    )

    # Dodatkowe daty dla Oceny Okresowej (zmiana stanowiska, sprzeciw)
    termin_oceny_przy_zmianie_stanowiska_od: date | None = Field(
        default=None,
        description="Najwcześniejsza data sporządzenia oceny przy zmianie stanowiska (-7 dni wg § 9 ust. 2)",
    )
    termin_oceny_przy_zmianie_stanowiska_do: date | None = Field(
        default=None,
        description="Ostateczna data sporządzenia oceny / ponownego ustalenia kryteriów przy zmianie stanowiska (+30 dni wg § 9)",
    )
    termin_wniesienia_sprzeciwu_max: date | None = Field(
        default=None,
        description="Ostateczny termin wniesienia sprzeciwu od oceny okresowej (7 dni wg art. 83 ust. 1 ustawy o SC)",
    )

    # Flagi informacyjne
    przesunieto_z_art_115_kc: dict[str, bool] = Field(
        default_factory=dict,
        description="Mapa nazw terminów, które wypadły w sobotę lub dzień ustawowo wolny od pracy i zostały przesunięte z art. 115 KC",
    )
    wydluzono_o_nieobecnosci_dni: int = Field(
        default=0,
        description="Łączna liczba zsumowanych (zmergowanych) dni kalendarzowych nieobecności wydłużających termin",
    )
    informacja_o_wydluzeniu: str | None = Field(
        default=None,
        description="Czytelny komunikat opisujący wpływ nieobecności na harmonogram oceny",
    )
    errors: list[str] = Field(default_factory=list, description="Błędy uniemożliwiające poprawne wyliczenie terminów")
    warnings: list[str] = Field(default_factory=list, description="Ostrzeżenia formalnoprawne (np. kolizja z końcem umowy)")


# ============================================================================
# 3. WALIDATOR I KALKULATOR OCENY (PIERWSZEJ ORAZ OKRESOWEJ) + GENERATOR PDF
# ============================================================================


class CriterionScore(BaseModel):
    """Pojedyncza ocena cząstkowa przyznana za kryterium obowiązkowe lub dodatkowe."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, description="Nazwa kryterium/elementu oceny ze słownika ustawowego")
    score: int = Field(..., description="Przyznana punktacja (1, 3, 5, 7, 9 w okresowej lub 3, 5, 7 w pierwszej ocenie)")
    is_mandatory: bool = Field(..., description="Czy kryterium jest obowiązkowe dla wybranego arkusza")


class EvaluatedPersonData(BaseModel):
    """Dane ocenianego urzędnika lub pracownika służby cywilnej."""

    model_config = ConfigDict(extra="forbid")

    imie: str = Field(default="", description="Imię ocenianego")
    nazwisko: str = Field(default="", description="Nazwisko ocenianego")
    komorka_organizacyjna: str = Field(default="", description="Komórka organizacyjna")
    stanowisko_pracy: str = Field(
        default="", description="Pełna nazwa stanowiska pracy (wraz z rozszerzeniem 'do spraw', jeśli dotyczy)"
    )
    status: CivilServiceStatus = Field(
        default=CivilServiceStatus.PRACOWNIK_SC,
        description="Status w korpusie służby cywilnej: PRACOWNIK_SC lub URZEDNIK_SC",
    )
    data_nawiazania_stosunku_pracy: date | None = Field(
        default=None,
        description="Data nawiązania stosunku pracy (wymagana w Arkuszu Pierwszej Oceny)",
    )


class EvaluatorPersonData(BaseModel):
    """Dane bezpośredniego przełożonego / oceniającego (lub kierującego komórką organizacyjną)."""

    model_config = ConfigDict(extra="forbid")

    imie: str = Field(default="", description="Imię")
    nazwisko: str = Field(default="", description="Nazwisko")
    komorka_organizacyjna: str = Field(default="", description="Komórka organizacyjna")
    stanowisko_pracy: str = Field(default="", description="Stanowisko pracy")


class PreviousEvaluationData(BaseModel):
    """Dane dotyczące poprzedniej oceny okresowej urzędnika służby cywilnej (Część II Arkusza B/C)."""

    model_config = ConfigDict(extra="forbid")

    ocena: Literal["pozytywna", "negatywna"] | None = Field(
        default=None, description="Poprzednia ocena ('pozytywna' lub 'negatywna')"
    )
    poziom: str | None = Field(
        default=None, description="Poziom poprzedniej oceny (np. 'na poziomie oczekiwań', 'powyżej oczekiwań')"
    )
    data_sporzadzenia: date | None = Field(default=None, description="Data sporządzenia poprzedniej oceny okresowej")


class NextRankRequestData(BaseModel):
    """Sekcja wniosku o przyznanie kolejnego stopnia służbowego (Część II i Część III Arkusza B/C)."""

    model_config = ConfigDict(extra="forbid")

    czy_dolaczono_wniosek: TriStateOption = Field(
        default=TriStateOption.NIE_DOTYCZY,
        description="Pole wyboru z Części II: TAK / NIE / NIE_DOTYCZY (oceniany jest pracownikiem SC)",
    )
    rok_mianowania: int | None = Field(
        default=None, ge=1996, le=2100, description="Rok mianowania urzędnika służby cywilnej (rrrr)"
    )
    posiadany_stopien_sluzbowy: str | None = Field(
        default=None, description="Aktualnie posiadany stopień służbowy (np. 'II stopień służbowy')"
    )
    data_przyznania_stopnia: date | None = Field(
        default=None, description="Data przyznania posiadanego stopnia służbowego"
    )
    wnioskowany_stopien_sluzbowy: str | None = Field(
        default=None, description="Wnioskowany kolejny stopień służbowy (np. 'III')"
    )
    umotywowanie_wniosku: str | None = Field(
        default=None, description="Treść umotywowania wniosku w Części III arkusza"
    )


class EvaluationRequest(BaseModel):
    """
    Kompletny kontrakt stanu formularza dla obu ścieżek oceny (Pierwszej Oceny oraz Oceny Okresowej B/C).
    Używany zarówno do walidacji reguł prawnych M1, jak i generowania gotowego dokumentu PDF.
    """

    model_config = ConfigDict(extra="forbid")

    evaluation_type: EvaluationType = Field(..., description="Ścieżka oceny")
    form_type: FormType = Field(..., description="Wybrany wzór arkusza: FORM_B, FORM_C lub FIRST_EVAL_FORM")

    # Metryczka urzędu i osób
    nazwa_urzedu: str = Field(default="", description="Nazwa urzędu (np. Ministerstwo Cyfryzacji)")
    miejscowosc: str = Field(default="Warszawa", description="Miejscowość składania podpisów na arkuszu")

    oceniany: EvaluatedPersonData = Field(default_factory=EvaluatedPersonData)
    oceniajacy: EvaluatorPersonData = Field(
        default_factory=EvaluatorPersonData,
        description="Dane oceniającego (w Pierwszej Ocenie: dane bezpośredniego przełożonego)",
    )
    kierujacy_komorka: EvaluatorPersonData | None = Field(
        default=None,
        description="Dane kierującego komórką organizacyjną (wymagane w Arkuszu Pierwszej Oceny)",
    )

    # Daty wspólne i specyficzne dla ścieżek
    data_rozmowy_wstepnej: date | None = Field(
        default=None,
        description="Data rozmowy wstępnej (Pierwsza Ocena Cz. II / Ocena Okresowa Cz. I)",
    )
    termin_sporzadzenia_oceny: date | None = Field(
        default=None, description="Planowany termin sporządzenia oceny okresowej z Części I Arkusza B/C"
    )
    termin_zlozenia_sprawozdania_od: date | None = Field(
        default=None, description="Początek terminu na złożenie sprawozdania (Pierwsza Ocena Cz. II)"
    )
    termin_zlozenia_sprawozdania_do: date | None = Field(
        default=None, description="Koniec terminu na złożenie sprawozdania (Pierwsza Ocena Cz. II)"
    )
    okres_oceny_od: date | None = Field(
        default=None,
        description="Początek okresu podlegającego ocenie (lub okresu, w którym powinna zostać dokonana pierwsza ocena)",
    )
    okres_oceny_do: date | None = Field(
        default=None,
        description="Koniec okresu podlegającego ocenie (lub okresu, w którym powinna zostać dokonana pierwsza ocena)",
    )
    data_rozmowy_oceniajacej: date | None = Field(
        default=None, description="Data przeprowadzenia rozmowy oceniającej"
    )
    data_sporzadzenia_oceny: date | None = Field(
        default=None, description="Data podpisania oceny przez oceniającego / bezpośredniego przełożonego"
    )

    # Oceny cząstkowe za kryteria / elementy
    oceny_czastkowe: list[CriterionScore] = Field(
        default_factory=list, description="Lista ocen cząstkowych przyznanych ocenianemu"
    )

    # Pola specyficzne dla Pierwszej Oceny w Służbie Cywilnej (Załącznik nr 2 do rozp. z 2015 r.)
    egzamin_sluzba_przygotowawcza: TriStateOption | None = Field(
        default=None,
        description="Czy oceniany zaliczył egzamin ze służby przygotowawczej: TAK / NIE / NIE_DOTYCZY",
    )
    sprawozdanie_zlozone_w_terminie: bool | None = Field(
        default=None,
        description="Czy sprawozdanie zostało złożone w wyznaczonym terminie (TAK = True, NIE = False)",
    )
    wnioski_rozwojowe_pierwsza_ocena: str | None = Field(
        default=None,
        description="Sekcja VI Arkusza Pierwszej Oceny: Wnioski dotyczące rozwoju zawodowego ocenianego (tylko przy ocenie pozytywnej)",
    )

    # Pola wspólne / specyficzne dla Oceny Okresowej (Załącznik nr 3 i 4 do rozp. z 2016 r.)
    uzasadnienie: str | None = Field(
        default=None,
        description="Uzasadnienie przyznanej oceny (obligatoryjne w przypadku oceny negatywnej, fakultatywne przy pozytywnej)",
    )
    wnioski_iprz: str | None = Field(
        default=None,
        description="Wnioski dotyczące indywidualnego programu rozwoju zawodowego - IPRZ (obligatoryjne w ocenie okresowej)",
    )
    poprzednia_ocena: PreviousEvaluationData | None = Field(
        default=None, description="Dane poprzedniej oceny okresowej (dotyczy urzędników służby cywilnej)"
    )
    wniosek_kolejny_stopien: NextRankRequestData | None = Field(
        default=None, description="Dane wniosku o przyznanie kolejnego stopnia służbowego (Część II i III)"
    )


class EvaluationResponse(BaseModel):
    """Wynik działania deterministycznego silnika reguł prawnych M1 dla formularza oceny."""

    model_config = ConfigDict(extra="forbid")

    srednia_arytmetyczna: float = Field(
        ..., description="Średnia arytmetyczna ze wszystkich ocen cząstkowych (zaokrąglona do 2 miejsc po przecinku)"
    )
    ogolny_poziom: str | None = Field(
        default=None,
        description="Ogólny poziom spełnienia kryteriów oceny (dla oceny okresowej wg § 11 ust. 1 pkt 2; dla pierwszej oceny None)",
    )
    werdykt: Literal["POZYTYWNA", "NEGATYWNA"] = Field(
        ..., description="Wyliczona wiążąca ocena końcowa w służbie cywilnej"
    )
    powody_werdyktu: list[str] = Field(
        default_factory=list,
        description="Szczegółowe podstawy prawne i faktyczne wyliczonego werdyktu",
    )
    iprz_mandatory_criteria: list[str] = Field(
        default_factory=list,
        description="Lista kryteriów ocenionych poniżej oczekiwań (<= 3 pkt), wymagających priorytetowego ujęcia we wnioskach IPRZ",
    )
    uzasadnienie_obowiazkowe: bool = Field(
        ..., description="Czy w danym stanie prawnym sporządzenie pisemnego uzasadnienia jest obligatoryjne"
    )
    wnioski_rozwojowe_dozwolone: bool = Field(
        ...,
        description="Czy przepisy pozwalają na wpisanie wniosków rozwojowych (w Pierwszej Ocenie tylko przy ocenie POZYTYWNEJ; w Okresowej zawsze)",
    )
    include_part_3: bool = Field(
        ...,
        description="Czy Część III arkusza (wniosek o stopień służbowy) podlega wydrukowaniu i dołączeniu zgodnie z przypisem 18",
    )
    errors: list[str] = Field(
        default_factory=list,
        description="Twarde błędy formalnoprawne blokujące zatwierdzenie/eksport arkusza (np. brak uzasadnienia przy ocenie negatywnej)",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Miękkie ostrzeżenia i rekomendacje formalne dla oceniającego",
    )