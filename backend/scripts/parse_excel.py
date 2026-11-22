#!/usr/bin/env python3
"""
Skrypt CLI konwertujący Model_kompetencji.xlsx do ustrukturyzowanego pliku JSON:
backend/data/processed/competency_model.json.

Obsługuje dwa tryby pracy:
1) Parsowanie pliku Excel (`openpyxl`):
   python backend/scripts/parse_excel.py
2) Niezawodny fallback z pełnej specyfikacji prawnej (14 kompetencji, 49 wskaźników, 5 poziomów):
   python backend/scripts/parse_excel.py --seed-from-spec
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl.worksheet.worksheet import Worksheet

# Zapewnienie poprawnego importu pakietu `app` niezależnie od katalogu wywołania
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import (  # noqa: E402
    CRITERION_KOMUNIKACJA,
    CRITERION_KREATYWNOSC,
    CRITERION_MYSLENIE_ANALITYCZNE,
    CRITERION_NEGOCJOWANIE,
    CRITERION_ORGANIZACJA_PRACY,
    CRITERION_ORIENTACJA_NA_KLIENTA,
    CRITERION_PODEJMOWANIE_DECYZJI,
    CRITERION_RZETELNOSC,
    CRITERION_SYTUACJE_KRYZYSOWE,
    CRITERION_WSPOLPRACA,
    CRITERION_WYKORZYSTYWANIE_WIEDZY,
    CRITERION_WYSTAPIENIA_PUBLICZNE,
    CRITERION_ZARZADZANIE_LUDZMI,
    CRITERION_ZARZADZANIE_STRATEGICZNE,
    EXPECTED_INDICATOR_COUNTS,
    EXPECTED_TOTAL_COMPETENCIES,
    EXPECTED_TOTAL_INDICATORS,
    MANDATORY_CRITERIA_FIRST_EVAL,
    MANDATORY_CRITERIA_FORM_B,
    MANDATORY_CRITERIA_FORM_C,
    PERIODIC_SCORE_LABELS,
    STATUTORY_CRITERIA_CATALOG,
    normalize_criterion_name,
    settings,
)


LEVEL_METADATA: list[dict[str, Any]] = [
    {"score": 1, "key": "1", "label": PERIODIC_SCORE_LABELS[1]},
    {"score": 3, "key": "3", "label": PERIODIC_SCORE_LABELS[3]},
    {"score": 5, "key": "5", "label": PERIODIC_SCORE_LABELS[5]},
    {"score": 7, "key": "7", "label": PERIODIC_SCORE_LABELS[7]},
    {"score": 9, "key": "9", "label": PERIODIC_SCORE_LABELS[9]},
]


def _make_indicator(
    code: str,
    title: str,
    lvl_1: str,
    lvl_3: str,
    lvl_5: str,
    lvl_7: str,
    lvl_9: str,
) -> dict[str, Any]:
    return {
        "id": code,
        "indicator": title,
        "levels": {
            "1": lvl_1,
            "3": lvl_3,
            "5": lvl_5,
            "7": lvl_7,
            "9": lvl_9,
        },
    }


def build_seed_competencies() -> list[dict[str, Any]]:
    """
    Buduje pełny zestaw 14 kompetencji i 49 wskaźników behawioralnych na 5 poziomach (1, 3, 5, 7, 9)
    zgodnie z tabelą w `Model_kompetencji.pdf` (Lp. 1-14, liczba wskaźników: 2,4,3,5,2,6,3,3,4,2,3,3,6,3 = 49)
    oraz opisami z Załącznika nr 1 do rozporządzenia PRM z dnia 4 kwietnia 2016 r. (Dz. U. poz. 470).
    """
    raw_spec: list[tuple[int, str, list[dict[str, Any]]]] = [
        # 1. RZETELNOŚĆ (2 wskaźniki)
        (
            1,
            CRITERION_RZETELNOSC,
            [
                _make_indicator(
                    "C01_I01",
                    "Wykonywanie zadań zgodnie z obowiązującymi standardami (przepisami, zasadami, procedurami) oraz dbałość o jakość rezultatów.",
                    "Nagminnie narusza obowiązujące przepisy, zasady lub procedury wewnętrzne; oddaje opracowania z rażącymi błędami wymagającymi wykonania pracy od nowa.",
                    "Pomija istotne wymogi proceduralne lub prawne; przygotowywane materiały zawierają powtarzające się usterki wymagające korekty przełożonego.",
                    "Wykonuje powierzone zadania zgodnie z przepisami prawa, zasadami i procedurami urzędu; dostarcza rzetelne i kompletne rezultaty.",
                    "Wyróżnia się wysoką skrupulatnością w zadaniach wielowątkowych; samodzielnie wychwytuje nieścisłości formalnoprawne i zapewnia ponadstandardową jakość.",
                    "Stanowi wzór jakości i zgodności z prawem w urzędzie; tworzy standardy weryfikacji zapobiegające błędom w całym zespole.",
                ),
                _make_indicator(
                    "C01_I02",
                    "Dotrzymywanie zobowiązań (realizacja zadań) w wyznaczonym czasie.",
                    "Systematycznie przekracza ustalone terminy realizacji zadań i nie informuje o opóźnieniach, dezorganizując pracę komórki.",
                    "Ma trudności z dotrzymywaniem terminów przy standardowym obciążeniu; wymaga przypomnień lub zgłasza opóźnienie po terminie.",
                    "Realizuje powierzone zadania i przyjęte zobowiązania w wyznaczonych terminach, a o obiektywnych przeszkodach informuje z wyprzedzeniem.",
                    "Realizuje zadania z bezpiecznym buforem czasowym, skutecznie dotrzymując zobowiązań również przy spiętrzeniu pilnych spraw.",
                    "Bezbłędnie zarządza terminowością zadań o najwyższym stopniu pilności, proaktywnie zabezpieczając terminy ustawowe w skali wydziału.",
                ),
            ],
        ),
        # 2. KOMUNIKACJA (4 wskaźniki)
        (
            2,
            CRITERION_KOMUNIKACJA,
            [
                _make_indicator(
                    "C02_I01",
                    "Koncentrowanie się na wypowiedzi rozmówcy i dbanie o wzajemne zrozumienie.",
                    "Przerywa rozmówcom, ignoruje przekazywane informacje i nie weryfikuje ustaleń, co prowadzi do poważnych nieporozumień.",
                    "Słucha pobieżnie, pomija istotne szczegóły wypowiedzi i rzadko upewnia się, czy intencje stron zostały właściwie zrozumiane.",
                    "Uważnie słucha rozmówcy, zadaje pytania doprecyzowujące i podsumowuje ustalenia, dbając o wzajemne zrozumienie.",
                    "Aktywnie wychwytuje niejasności w wypowiedziach i parafrazuje złożone wątki, eliminując ryzyko rozbieżności interpretacyjnych.",
                    "Modelowo moderuje wielostronne i trudne rozmowy, zapewniając pełną spójność ustaleń pomiędzy wszystkimi interesariuszami.",
                ),
                _make_indicator(
                    "C02_I02",
                    "Wypowiadanie się w sposób jasny i precyzyjny, dostosowany do sytuacji i rozmówcy (dobieranie stylu, języka i treści).",
                    "Wypowiada się chaotycznie, niezrozumiale lub w sposób nieadekwatny do sytuacji, utrudniając porozumienie.",
                    "Formułuje wypowiedzi ustne w sposób rozwlekły lub nieprecyzyjny; ma trudność z doborem stylu i słownictwa do odbiorcy.",
                    "Wypowiada się jasno, zwięźle i rzeczowo, dobierając styl, język oraz szczegółowość informacji odpowiednio do sytuacji i rozmówcy.",
                    "Klarownie tłumaczy zawiłe zagadnienia prawne, techniczne lub organizacyjne zróżnicowanym odbiorcom, zachowując wysoką precyzję języka.",
                    "Po mistrzowsku wypowiada się na gremiach kierowniczych i międzynarodowych, syntetycznie przekazując sedno najbardziej złożonych spraw.",
                ),
                _make_indicator(
                    "C02_I03",
                    "Formułowanie jasnych i precyzyjnych wypowiedzi pisemnych dostosowanych do sytuacji i odbiorcy (dobieranie stylu, języka i treści).",
                    "Tworzy pisma niespójne logicznie, nieczytelne i z błędami językowymi, wymagające napisania od podstaw.",
                    "Redaguje teksty nadmiernie zawiłe lub niepełne, które wymagają istotnego przeredagowania przed akceptacją przełożonego.",
                    "Formułuje przejrzyste, poprawne językowo i uporządkowane pisma oraz notatki, dostosowane stylem i treścią do odbiorcy.",
                    "Przygotowuje wzorcowe redakcyjnie projekty stanowisk, opinii i odpowiedzi w sprawach złożonych, gotowe do podpisu bez poprawek.",
                    "Tworzy najwyższej próby dokumenty strategiczne, legislacyjne lub dyplomatyczne, stanowiące w urzędzie wzorzec komunikacji pisemnej.",
                ),
                _make_indicator(
                    "C02_I04",
                    "Przedstawianie przekonujących argumentów odpowiednio do sytuacji.",
                    "Nie potrafi uzasadnić stanowiska; posługuje się ogólnikami lub emocjami zamiast rzeczowych argumentów.",
                    "Przedstawia niepełną argumentację i traci spójność w obliczu podstawowych pytań oraz wątpliwości rozmówcy.",
                    "Przedstawia rzeczowe, logiczne oraz oparte na faktach i przepisach argumenty adekwatne do sytuacji.",
                    "Dobiera wielowymiarową argumentację uwzględniającą obiekcje odbiorców, skutecznie przekonując ich do rekomendowanego rozwiązania.",
                    "Buduje strategiczną argumentację w sprawach spornych i precedensowych, zjednując poparcie kluczowych interesariuszy i kierownictwa.",
                ),
            ],
        ),
        # 3. WYKORZYSTYWANIE WIEDZY I DOSKONALENIE ZAWODOWE (3 wskaźniki)
        (
            3,
            CRITERION_WYKORZYSTYWANIE_WIEDZY,
            [
                _make_indicator(
                    "C03_I01",
                    "Wykorzystywanie wiedzy przy realizacji zadań na zajmowanym stanowisku pracy.",
                    "Wykazuje rażące braki w podstawowej wiedzy merytorycznej i prawnej, przez co błędnie realizuje obowiązki.",
                    "Ma trudności z praktycznym zastosowaniem posiadanej wiedzy w mniej typowych sprawach; często oczekuje gotowych rozwiązań.",
                    "Prawidłowo i samodzielnie wykorzystuje wymaganą wiedzę specjalistyczną oraz przepisy prawa podczas realizacji zadań na stanowisku.",
                    "Biegle łączy wiedzę ekspercką ze swojej dziedziny z obszarami pokrewnymi, rozstrzygając złożone zagadnienia merytoryczne.",
                    "Pełni rolę autorytetu merytorycznego w urzędzie, twórczo wykorzystując wiedzę ekspercką w sprawach bezprecedensowych.",
                ),
                _make_indicator(
                    "C03_I02",
                    "Doskonalenie wiedzy i umiejętności niezbędnych do wykonywania zadań na zajmowanym stanowisku pracy, w szczególności wyszukiwanie i pozyskiwanie wiedzy, korzystanie z dobrych praktyk i doświadczeń innych.",
                    "Nie aktualizuje wiedzy mimo zmian przepisów i ignoruje informacje zwrotne oraz dobre praktyki wypracowane w urzędzie.",
                    "Uzupełnia wiedzę wyłącznie na polecenie przełożonego; rzadko śledzi zmiany regulacyjne i niechętnie korzysta z doświadczeń innych.",
                    "Systematycznie aktualizuje wiedzę o zmianach w przepisach, samodzielnie wyszukuje informacje i stosuje dobre praktyki w pracy.",
                    "Proaktywnie rozwija kompetencje, analizuje orzecznictwo oraz praktyki krajowe i międzynarodowe, przenosząc je na grunt wydziału.",
                    "Wyznacza kierunki rozwoju wiedzy w organizacji, identyfikując nadchodzące zmiany regulacyjne i adaptując najlepsze światowe praktyki.",
                ),
                _make_indicator(
                    "C03_I03",
                    "Korzystanie z dostępnych źródeł informacji, rozwiązań i technologii.",
                    "Nie radzi sobie z obsługą podstawowych systemów teleinformatycznych urzędu lub korzysta z nieaktualnych źródeł prawa.",
                    "W ograniczonym stopniu wykorzystuje dostępne narzędzia cyfrowe i bazy wiedzy, wybierając nieefektywne sposoby pracy.",
                    "Sprawnie korzysta z systemów informatycznych urzędu, baz aktów prawnych oraz wiarygodnych źródeł informacji przy realizacji zadań.",
                    "Zaawansowanie wykorzystuje dostępne technologie, bazy danych i narzędzia analityczne, wyraźnie usprawniając realizację obowiązków.",
                    "Inicjuje wdrażanie nowych narzędzi cyfrowych i metod pracy z informacją, podnosząc efektywność technologiczną całej komórki.",
                ),
            ],
        ),
        # 4. ORGANIZACJA PRACY I ORIENTACJA NA OSIĄGANIE CELÓW (5 wskaźników)
        (
            4,
            CRITERION_ORGANIZACJA_PRACY,
            [
                _make_indicator(
                    "C04_I01",
                    "Określanie sposobu realizacji zadań/celów.",
                    "Przystępuje do pracy chaotycznie, bez planu działania, co prowadzi do zbędnych czynności i nieosiągania celu.",
                    "Planuje działania pobieżnie, pomijając istotne etapy proceduralne lub zależności czasowe.",
                    "Trafnie określa kolejne etapy oraz harmonogram realizacji powierzonych zadań i celów, dobierając właściwe metody działania.",
                    "Tworzy wielowariantowe plany realizacji złożonych przedsięwzięć, z wyprzedzeniem uwzględniając punkty kontrolne i ryzyka.",
                    "Projektuje wzorcowe metodyki i procesy realizacji złożonych celów międzywydziałowych, optymalizując ścieżkę dojścia do rezultatu.",
                ),
                _make_indicator(
                    "C04_I02",
                    "Realizowanie zadań/celów w kolejności uwzględniającej ich wagę i pilność (ustalanie priorytetów działania).",
                    "Zajmuje się sprawami drugorzędnymi kosztem zadań pilnych i kluczowych; nie odróżnia spraw krytycznych od rutynowych.",
                    "Ma trudności z samodzielnym szeregowaniem zadań równoległych; oczekuje od przełożonego ustalania kolejności działań.",
                    "Prawidłowo ustala priorytety działania, realizując zadania w kolejności wynikającej z ich wagi merytorycznej i pilności.",
                    "Sprawnie zarządza dynamicznie zmieniającymi się priorytetami przy dużym natężeniu prac, zachowując ciągłość realizacji celów.",
                    "Mistrzowsko koordynuje priorytety pod presją czasu, pomagając zespołowi skupić wysiłek na zadaniach o najwyższej wadze państwowej.",
                ),
                _make_indicator(
                    "C04_I03",
                    "Dobieranie niezbędnych zasobów umożliwiających realizację zadań/celów.",
                    "Nie identyfikuje potrzebnych danych i narzędzi przed rozpoczęciem pracy lub marnotrawi powierzone zasoby i czas.",
                    "Z opóźnieniem dostrzega brak kluczowych informacji lub zasobów niezbędnych do wykonania zadania, powodując przestoje.",
                    "Trafnie identyfikuje i z wyprzedzeniem gromadzi informacje, dokumenty oraz narzędzia niezbędne do sprawnej realizacji zadań.",
                    "Optymalizuje wykorzystanie zasobów czasowych, organizacyjnych i informacyjnych, osiągając pełne rezultaty przy racjonalnym nakładzie.",
                    "Twórczo integruje rozproszone zasoby wewnętrzne i zewnętrzne, umożliwiając realizację ambitnych przedsięwzięć.",
                ),
                _make_indicator(
                    "C04_I04",
                    "Dostosowywanie się do zmieniających się okoliczności.",
                    "Reaguje oporem lub bezradnością na zmianę przepisów czy priorytetów; kurczowo trzyma się nieaktualnych schematów.",
                    "Potrzebuje dużo czasu i wsparcia, aby dostosować sposób działania do nowych wytycznych lub nieprzewidzianych okoliczności.",
                    "Elastycznie dostosowuje plan i sposób wykonywania zadań do zmieniających się uwarunkowań prawnych oraz organizacyjnych.",
                    "Szybko i konstruktywnie przeorganizowuje pracę w obliczu nagłych zmian, utrzymując wysoką skuteczność operacyjną.",
                    "Wyprzedza zmiany otoczenia, przygotowując warianty awaryjne i wspierając zespół w płynnej adaptacji do nowych regulacji.",
                ),
                _make_indicator(
                    "C04_I05",
                    "Wytrwałość i zaangażowanie w realizację zadań/celów.",
                    "Łatwo zniechęca się przy pierwszych trudnościach, porzuca niedokończone wątki i wykazuje bierność wobec celów.",
                    "Wykazuje nierówne zaangażowanie; w razie napotkania barier biernie czeka na rozwiązanie problemu przez przełożonego.",
                    "Konsekwentnie i z zaangażowaniem dąży do zrealizowania powierzonych zadań, pokonując typowe trudności realizacyjne.",
                    "Wykazuje ponadprzeciętną determinację i inicjatywę w doprowadzaniu do końca spraw trudnych oraz wielowątkowych.",
                    "Swoją niesłabnącą determinacją inspiruje otoczenie do osiągania najtrudniejszych celów publicznych mimo złożonych barier.",
                ),
            ],
        ),
        # 5. KREATYWNOŚĆ (2 wskaźniki)
        (
            5,
            CRITERION_KREATYWNOSC,
            [
                _make_indicator(
                    "C05_I01",
                    "Proponowanie lub tworzenie nowych rozwiązań.",
                    "Nie zgłasza żadnych usprawnień oraz bezpodstawnie neguje propozycje zmian zgłaszane przez innych.",
                    "Rzadko wychodzi z inicjatywą usprawnień, powielając dotychczasowe schematy nawet wtedy, gdy są nieefektywne.",
                    "Zgłasza przemyślane, realistyczne propozycje nowych rozwiązań lub usprawnień adekwatne do ram prawnych urzędu.",
                    "Samodzielnie projektuje i wdraża innowacyjne rozwiązania organizacyjne lub prawne, wymiernie podnosząc sprawność wydziału.",
                    "Tworzy przełomowe koncepcje i rozwiązania systemowe wyznaczające nowe standardy funkcjonowania administracji publicznej.",
                ),
                _make_indicator(
                    "C05_I02",
                    "Nieschematyczne podejście do zadań.",
                    "W sytuacjach nietypowych jest bezradny, ponieważ potrafi działać wyłącznie według szczegółowej instrukcji krokowej.",
                    "Ma trudność z wyjściem poza utarty schemat w sprawach precedensowych, mechanicznie stosując nieadekwatne wzorce.",
                    "W sytuacjach nietypowych patrzy na problem z szerszej perspektywy i dobiera nieszablonowy, zgodny z prawem sposób działania.",
                    "Łączy perspektywę prawną, technologiczną i operacyjną, skutecznie rozwiązując problemy bezprecedensowe.",
                    "Modelowo przekształca złożone bariery regulacyjne lub organizacyjne w nowatorskie, w pełni legalne mechanizmy działania.",
                ),
            ],
        ),
        # 6. WSPÓŁPRACA (6 wskaźników)
        (
            6,
            CRITERION_WSPOLPRACA,
            [
                _make_indicator(
                    "C06_I01",
                    "Włączanie się w działania realizowane razem z innymi osobami, jeśli istnieje taka możliwość.",
                    "Unika udziału we wspólnych zadaniach i przerzuca ciężar obowiązków zespołowych na współpracowników.",
                    "Angażuje się w prace zespołowe wyłącznie na polecenie przełożonego, ograniczając swój udział do niezbędnego minimum.",
                    "Chętnie i aktywnie włącza się w zadania zespołowe oraz międzywydziałowe, rzetelnie realizując swoją część pracy.",
                    "Proaktywnie oferuje pomoc współpracownikom przy spiętrzeniu prac i podejmuje się trudnych odcinków zadań wspólnych.",
                    "Inicjuje i integruje współpracę międzykomórkową, mobilizując interdyscyplinarne zespoły wokół wspólnych celów urzędu.",
                ),
                _make_indicator(
                    "C06_I02",
                    "Dbanie o przepływ informacji.",
                    "Zataja lub przetrzymuje kluczowe informacje potrzebne innym do pracy, powodując błędy i opóźnienia.",
                    "Przekazuje informacje wybiórczo lub ze znacznym opóźnieniem, pomijając część zainteresowanych osób.",
                    "Na bieżąco, kompletnie i we właściwym czasie przekazuje współpracownikom oraz przełożonym informacje istotne dla zadań.",
                    "Dba o wzorcową transparentność informacyjną w projektach wielopodmiotowych, wyprzedzająco sygnalizując zależności.",
                    "Buduje niezawodne mechanizmy wymiany informacji pomiędzy departamentami i instytucjami zewnętrznymi, eliminując silosy.",
                ),
                _make_indicator(
                    "C06_I03",
                    "Dbanie o dobrą atmosferę i otwartość we współpracy.",
                    "Wywołuje napięcia, zachowuje się niekoleżeńsko i psuje relacje w zespole.",
                    "Bywa zdystansowany w kontaktach roboczych; pod wpływem stresu reaguje zniecierpliwieniem utrudniającym współpracę.",
                    "Odnosi się do współpracowników z życzliwością i szacunkiem, zachowuje otwartość i współtworzy dobrą atmosferę pracy.",
                    "Łagodzi napięcia wynikające z presji czasu, budując klimat wzajemnego zaufania i partnerskiego wsparcia.",
                    "Jest filarem kultury współpracy w urzędzie; buduje konstruktywny klimat współdziałania nawet między grupami o sprzecznych interesach.",
                ),
                _make_indicator(
                    "C06_I04",
                    "Dostrzeganie wkładu pracy innych osób.",
                    "Przypisuje sobie cudze osiągnięcia lub deprecjonuje pracę pozostałych członków zespołu.",
                    "Koncentruje się wyłącznie na własnym udziale w zadaniu, pomijając milczeniem wsparcie współpracowników.",
                    "Uczciwie wskazuje i docenia wkład pracy innych osób zaangażowanych w realizację wspólnego zadania.",
                    "Podkreśla zasługi współpracowników i partnerów z innych komórek, wzmacniając ich motywację do współdziałania.",
                    "Buduje kulturę wzajemnego uznania w organizacji, dbając o sprawiedliwą ekspozycję dorobku wszystkich uczestników projektu.",
                ),
                _make_indicator(
                    "C06_I05",
                    "Branie pod uwagę zdania innych osób.",
                    "Z góry odrzuca opinie innych osób, forsując wyłącznie własne zdanie bez merytorycznej dyskusji.",
                    "Niechętnie przyjmuje uwagi współpracowników, traktując odmienne propozycje jako krytykę personalną.",
                    "Uważnie analizuje opinie i sugestie innych osób, uwzględniając zasadne argumenty w wypracowywanych rozwiązaniach.",
                    "Aktywnie zabiega o zróżnicowane opinie ekspertów z innych dziedzin, podnosząc jakość końcowych rozstrzygnięć.",
                    "Syntetyzuje odmienne perspektywy eksperckie i instytucjonalne, przekuwając różnicę zdań w lepsze rozwiązania systemowe.",
                ),
                _make_indicator(
                    "C06_I06",
                    "Dzielenie się wiedzą i doświadczeniem.",
                    "Odmawia udzielenia wskazówek mniej doświadczonym pracownikom i blokuje transfer wiedzy w zespole.",
                    "Dzieli się wiedzą niechętnie lub zdawkowo, wyłącznie na wyraźne polecenie przełożonego.",
                    "Chętnie dzieli się posiadaną wiedzą merytoryczną, praktycznymi wskazówkami oraz doświadczeniem ze współpracownikami.",
                    "Aktywnie wspiera wdrożenie nowych pracowników, opracowuje wzory dokumentów i prowadzi wewnętrzne konsultacje.",
                    "Pełni rolę mentora w urzędzie, systematycznie podnosząc kompetencje kadr poprzez szkolenia wewnętrzne i bazy wiedzy.",
                ),
            ],
        ),
        # 7. MYŚLENIE ANALITYCZNE (3 wskaźniki)
        (
            7,
            CRITERION_MYSLENIE_ANALITYCZNE,
            [
                _make_indicator(
                    "C07_I01",
                    "Rozróżnianie informacji istotnych i nieistotnych.",
                    "Gubi się w natłoku danych; opiera analizy na informacjach przypadkowych lub pobocznych, pomijając fakty kluczowe.",
                    "Ma trudność z selekcją materiału źródłowego, tworząc przeładowane zestawienia bez wyodrębnienia sedna sprawy.",
                    "Trafnie oddziela informacje kluczowe od drugorzędnych oraz weryfikuje wiarygodność analizowanych danych.",
                    "Sprawnie filtruje obszerne i wielojęzyczne akty prawne oraz raporty, błyskawicznie identyfikując elementy krytyczne.",
                    "W warunkach szumu informacyjnego i niepełnych danych bezbłędnie wyławia sygnały o strategicznym znaczeniu dla resortu.",
                ),
                _make_indicator(
                    "C07_I02",
                    "Dostrzeganie zależności między informacjami.",
                    "Analizuje fakty w izolacji; nie dostrzega oczywistych związków przyczynowo-skutkowych ani sprzeczności w dokumentach.",
                    "Dostrzega wyłącznie proste zależności bezpośrednie, pomijając skutki uboczne lub powiązania z przepisami pokrewnymi.",
                    "Prawidłowo identyfikuje związki przyczynowo-skutkowe, zależności logiczne oraz rozbieżności między informacjami i przepisami.",
                    "Wychwytuje złożone współzależności prawne, finansowe i organizacyjne oraz trafnie prognozuje długofalowe skutki regulacji.",
                    "Przeprowadza głębokie analizy międzysektorowe, identyfikując ukryte ryzyka i synergie w skali państwa lub prawa UE.",
                ),
                _make_indicator(
                    "C07_I03",
                    "Formułowanie wniosków.",
                    "Formułuje wnioski błędne, sprzeczne z materiałem źródłowym albo nie formułuje żadnych konkluzji.",
                    "Wyciąga wnioski powierzchowne lub ogólnikowe, które nie dają przełożonemu podstawy do podjęcia decyzji.",
                    "Na podstawie analizy formułuje logiczne, jednoznaczne i uargumentowane wnioski oraz praktyczne rekomendacje.",
                    "Formułuje trafne, wariantowe konkluzje wraz z oceną korzyści i ryzyka każdej opcji, ułatwiając decyzje kierownicze.",
                    "Przekuwa najbardziej zawiłe analizy prawno-techniczne w przejrzyste rekomendacje strategiczne dla kierownictwa urzędu.",
                ),
            ],
        ),
        # 8. NEGOCJOWANIE (3 wskaźniki)
        (
            8,
            CRITERION_NEGOCJOWANIE,
            [
                _make_indicator(
                    "C08_I01",
                    "Przygotowywanie się do negocjacji, w szczególności opracowanie projektu stanowiska, zakresu możliwych ustępstw i argumentacji.",
                    "Przystępuje do uzgodnień bez przygotowania, znajomości stanowiska ani granic ustępstw, narażając interes urzędu.",
                    "Przygotowuje się do negocjacji powierzchownie, bez analizy racji drugiej strony i bez wariantów rezerwowych.",
                    "Rzetelnie przygotowuje się do negocjacji: opracowuje projekt stanowiska, argumentację, granice ustępstw i analizuje interesy stron.",
                    "Opracowuje pogłębione scenariusze negocjacyjne przewidujące ruchy partnerów, kontrargumenty i warianty kompromisowe.",
                    "Tworzy kompleksowe strategie i instrukcje negocjacyjne na forum krajowym lub międzynarodowym, mapując układ sił i koalicji.",
                ),
                _make_indicator(
                    "C08_I02",
                    "Stosowanie technik i strategii negocjacyjnych.",
                    "Ulega presji rozmówców przy pierwszej rozbieżności albo prowadzi rozmowy konfrontacyjnie, zrywając uzgodnienia.",
                    "Stosuje ubogi repertuar zachowań negocjacyjnych; łatwo traci inicjatywę lub przedwcześnie ujawnia granice ustępstw.",
                    "Świadomie i kulturalnie stosuje adekwatne techniki negocjacyjne, oddziela ludzi od problemu i broni interesów urzędu.",
                    "Elastycznie dostosowuje taktykę w trudnych rokowaniach wielostronnych, przełamuje impasy i buduje porozumienia wygrana-wygrana.",
                    "Po mistrzowsku prowadzi złożone negocjacje na forum UE/NATO lub międzyresortowym, zachowując pełną kontrolę nad procesem.",
                ),
                _make_indicator(
                    "C08_I03",
                    "Osiągnięcie efektu negocjacji akceptowanego przez przełożonych.",
                    "Kończy uzgodnienia wynikiem sprzecznym z instrukcją lub niekorzystnym dla urzędu.",
                    "Osiąga jedynie częściowe ustalenia kosztem nadmiernych ustępstw lub pozostawia kluczowe kwestie nierozstrzygnięte.",
                    "Wypracowuje porozumienie mieszczące się w mandacie negocjacyjnym i w pełni akceptowane przez przełożonych.",
                    "Uzyskuje rezultaty zabezpieczające interes urzędu powyżej założeń minimalnych, utrzymując dobre relacje z partnerami.",
                    "W sytuacjach skrajnie rozbieżnych interesów doprowadza do trwałych, strategicznie korzystnych porozumień.",
                ),
            ],
        ),
        # 9. WYSTĄPIENIA PUBLICZNE (4 wskaźniki)
        (
            9,
            CRITERION_WYSTAPIENIA_PUBLICZNE,
            [
                _make_indicator(
                    "C09_I01",
                    "Wykorzystywanie różnych środków przekazu (np. narzędzi multimedialnych) i dbałość o sposób prezentacji (w tym autoprezentacji).",
                    "Prezentuje materiały nieczytelne i z błędami, a jego sposób prezentacji podważa profesjonalny wizerunek urzędu.",
                    "Nieumiejętnie korzysta z narzędzi prezentacyjnych (np. mechanicznie odczytuje przeładowane slajdy), osłabiając odbiór przekazu.",
                    "Dba o profesjonalną autoprezentację oraz przygotowuje przejrzyste materiały wspierające główny przekaz wystąpienia.",
                    "Umiejętnie łączy słowo mówione z wizualizacją danych, prowadząc dynamiczne i angażujące prezentacje.",
                    "Reprezentuje urząd na najwyższym poziomie podczas konferencji krajowych i międzynarodowych, stanowiąc wizytówkę służby cywilnej.",
                ),
                _make_indicator(
                    "C09_I02",
                    "Nawiązywanie i utrzymywanie kontaktu z audytorium.",
                    "Unika kontaktu z odbiorcami i mówi monotonnie bez uwzględnienia reakcji sali, całkowicie tracąc uwagę słuchaczy.",
                    "Ma trudność z nawiązaniem kontaktu z salą i rzadko reaguje na sygnały niezrozumienia ze strony uczestników.",
                    "Nawiązuje i utrzymuje dobry kontakt z audytorium, dostosowując tempo i sposób mówienia do odbiorców.",
                    "Swobodnie angażuje zróżnicowane audytorium, umiejętnie moderuje sesje pytań i buduje życzliwą relację ze słuchaczami.",
                    "Charyzmatycznie skupia uwagę licznych gremiów eksperckich, utrzymując pełne zaangażowanie sali przez całe wystąpienie.",
                ),
                _make_indicator(
                    "C09_I03",
                    "Zarządzanie czasem wystąpienia, w szczególności przestrzeganie ram czasowych, elastyczne reagowanie na potrzeby audytorium.",
                    "Rażąco przekracza wyznaczony czas wystąpienia lub kończy je bez omówienia kluczowych tez.",
                    "Niewłaściwie rozkłada akcenty w czasie, omawiając wątki poboczne kosztem najważniejszych konkluzji.",
                    "Przestrzega ram czasowych wystąpienia, logicznie rozkłada proporcje treści i elastycznie reaguje na potrzeby audytorium.",
                    "Płynnie modyfikuje strukturę wystąpienia w czasie rzeczywistym przy zmianach agendy, zachowując wszystkie kluczowe wnioski.",
                    "Z najwyższą precyzją zarządza czasem wystąpień własnych i całych paneli dyskusyjnych, idealnie balansując prezentację i dyskusję.",
                ),
                _make_indicator(
                    "C09_I04",
                    "Radzenie sobie ze stresem i emocjami, w szczególności wywołanymi krytyką i trudnymi pytaniami.",
                    "Pod wpływem stresu lub trudnych pytań traci panowanie nad sobą, reaguje emocjonalnie albo przerywa wypowiedź.",
                    "Wyraźnie traci pewność siebie w obliczu krytyki lub trudnych pytań, udzielając wymijających odpowiedzi.",
                    "Zachowuje spokój i kulturę osobistą podczas wystąpień, rzeczowo odpowiadając na trudne pytania oraz uwagi krytyczne.",
                    "W obliczu ostrej polemiki odpowiada z pełnym opanowaniem i klasą, przekuwając trudne pytania we wzmocnienie przekazu urzędu.",
                    "Imponuje niezachwianym opanowaniem w najbardziej wymagających wystąpieniach parlamentarnych, medialnych lub międzynarodowych.",
                ),
            ],
        ),
        # 10. ORIENTACJA NA KLIENTA/INTERESANTA (2 wskaźniki)
        (
            10,
            CRITERION_ORIENTACJA_NA_KLIENTA,
            [
                _make_indicator(
                    "C10_I01",
                    "Taktowne zachowanie, wyrażające szacunek i zrozumienie dla drugiej osoby.",
                    "Traktuje klientów/interesantów lekceważąco lub nieuprzejmie, naruszając standardy etyki służby cywilnej.",
                    "Zachowuje się oschle lub zniecierpliwienie wobec mniej zorientowanych interesantów.",
                    "Odnosi się do każdego klienta/interesanta z taktem, kulturą osobistą i szacunkiem, wykazując zrozumienie dla jego sytuacji.",
                    "Zachowuje wysoką empatię, cierpliwość i profesjonalizm również w kontaktach z rozmówcami wzburzonymi lub w trudnej sytuacji.",
                    "Stanowi wzór postawy proobywatelskiej; swoją kulturą i spokojem rozładowuje najbardziej napięte sytuacje w relacjach zewnętrznych.",
                ),
                _make_indicator(
                    "C10_I02",
                    "Reagowanie na potrzeby klienta/interesanta, w szczególności rozpoznawanie jego potrzeb i proponowanie rozwiązań.",
                    "Ignoruje zapytania interesantów, odsyła ich bez sprawdzenia właściwości lub udziela błędnych informacji.",
                    "Ogranicza się do formalistycznego minimum, nie starając się rozpoznać rzeczywistej potrzeby interesanta.",
                    "Uważnie rozpoznaje potrzebę klienta/interesanta, udziela pełnej informacji i proponuje zgodne z prawem rozwiązania.",
                    "Proaktywnie pomaga interesantowi przejść przez wymogi administracyjne, wskazując najsprawniejszą ścieżkę załatwienia sprawy.",
                    "Inicjuje systemowe uproszczenia procedur i komunikatów zewnętrznych na podstawie zidentyfikowanych potrzeb obywateli.",
                ),
            ],
        ),
        # 11. RADZENIE SOBIE W SYTUACJACH KRYZYSOWYCH (3 wskaźniki)
        (
            11,
            CRITERION_SYTUACJE_KRYZYSOWE,
            [
                _make_indicator(
                    "C11_I01",
                    "Rozpoznawanie sytuacji kryzysowych i informowanie o nich zainteresowanych.",
                    "Bagatelizuje lub ukrywa symptomy incydentu czy kryzysu, nie informując przełożonych ani właściwych służb.",
                    "Z opóźnieniem rozpoznaje eskalację zagrożenia lub przekazuje niepełne informacje utrudniające ocenę sytuacji.",
                    "W porę rozpoznaje symptomy sytuacji kryzysowej i niezwłocznie, precyzyjnie informuje przełożonych oraz właściwe podmioty.",
                    "Wychwytuje wczesne sygnały ostrzegawcze przed eskalacją kryzysu, przekazując ustrukturyzowany obraz sytuacji.",
                    "Projektuje i doskonali mechanizmy wczesnego ostrzegania, zapewniając natychmiastową świadomość sytuacyjną kierownictwa.",
                ),
                _make_indicator(
                    "C11_I02",
                    "Podejmowanie działań mających na celu rozwiązanie kryzysu.",
                    "W sytuacji kryzysowej ulega panice, pozostaje bierny lub podejmuje chaotyczne działania pogłębiające kryzys.",
                    "Działa niepewnie pod presją zagrożenia; wymaga ciągłego instruowania przy uruchamianiu procedur awaryjnych.",
                    "Zachowuje opanowanie i sprawnie podejmuje adekwatne działania zaradcze zmierzające do rozwiązania sytuacji kryzysowej.",
                    "Skutecznie koordynuje działania pod silną presją czasu, trafnie adaptując procedury reagowania do przebiegu incydentu.",
                    "Przejmuje wiodącą rolę operacyjną w najpoważniejszych kryzysach, integrując działania wielu instytucji i minimalizując straty.",
                ),
                _make_indicator(
                    "C11_I03",
                    "Wyciąganie wniosków z sytuacji kryzysowych.",
                    "Po zakończeniu kryzysu nie analizuje jego przyczyn i powtarza te same błędy w kolejnych zdarzeniach.",
                    "Ogranicza się do doraźnego zamknięcia incydentu bez sformułowania wniosków zapobiegawczych na przyszłość.",
                    "Analizuje przebieg i przyczyny sytuacji kryzysowej, formułując rzeczowe wnioski zapobiegające podobnym zdarzeniom.",
                    "Opracowuje po incydencie lub ćwiczeniach konkretne aktualizacje planów reagowania oraz procedur i wdraża je w praktyce.",
                    "Przekuwa doświadczenia z incydentów krajowych i międzynarodowych w systemowe wzmocnienie odporności państwa i urzędu.",
                ),
            ],
        ),
        # 12. ZARZĄDZANIE STRATEGICZNE (3 wskaźniki)
        (
            12,
            CRITERION_ZARZADZANIE_STRATEGICZNE,
            [
                _make_indicator(
                    "C12_I01",
                    "Tworzenie wizji oraz wyznaczanie celów strategicznych w oparciu o całościowe i perspektywiczne widzenie organizacji, otoczenia oraz strategie rozwoju.",
                    "Działa wyłącznie doraźnie; wyznacza cele sprzeczne ze strategią urzędu lub oderwane od realiów otoczenia.",
                    "Formułuje kierunki działania w wąskiej perspektywie własnej komórki, bez uwzględnienia długofalowych polityk publicznych.",
                    "Tworzy spójną wizję rozwoju obszaru i wyznacza długofalowe cele strategiczne zgodne z misją urzędu oraz strategiami rządowymi.",
                    "Trafnie antycypuje trendy technologiczne, społeczne i regulacyjne, wyznaczając dalekowzroczne kierunki strategiczne.",
                    "Kształtuje przełomowe strategie i polityki publiczne o znaczeniu ogólnopaństwowym lub unijnym.",
                ),
                _make_indicator(
                    "C12_I02",
                    "Formułowanie celów operacyjnych na podstawie celów strategicznych.",
                    "Nie potrafi przełożyć kierunków strategicznych na konkretne zadania, pozostawiając strategię martwą deklaracją.",
                    "Formułuje cele operacyjne nieprecyzyjnie lub niemierzalnie, utrudniając przypisanie odpowiedzialności i rozliczenie efektów.",
                    "Skutecznie przekłada cele strategiczne na mierzalne, realistyczne i określone w czasie cele operacyjne.",
                    "Zapewnia pełną spójność pomiędzy strategią, planami rocznymi, budżetem zadaniowym i bieżącymi priorytetami.",
                    "Projektuje wzorcowe systemy zarządzania przez cele pozwalające dynamicznie sterować realizacją programów wieloletnich.",
                ),
                _make_indicator(
                    "C12_I03",
                    "Analiza ryzyka planowanych działań o charakterze strategicznym.",
                    "Podejmuje działania strategiczne bez jakiejkolwiek oceny ryzyka prawnego, finansowego lub organizacyjnego.",
                    "Przeprowadza analizę ryzyka powierzchownie i czysto formalnie, pomijając realne zagrożenia wdrożeniowe.",
                    "Systematycznie identyfikuje i ocenia kluczowe ryzyka planowanych działań strategicznych oraz określa mechanizmy zaradcze.",
                    "Prowadzi wielowymiarową ocenę ryzyk systemowych i przygotowuje skuteczne scenariusze awaryjne.",
                    "Integruje zarządzanie ryzykiem strategicznym z procesem decyzyjnym całej organizacji przy złożonych reformach.",
                ),
            ],
        ),
        # 13. ZARZĄDZANIE LUDŹMI (6 wskaźników)
        (
            13,
            CRITERION_ZARZADZANIE_LUDZMI,
            [
                _make_indicator(
                    "C13_I01",
                    "Przydzielanie zakresu odpowiedzialności, zadań i uprawnień pracownikom (delegowanie zadań).",
                    "Przydziela zadania chaotycznie bez określenia oczekiwań, skrajnie nierówno obciąża zespół lub blokuje pracę brakiem delegowania.",
                    "Deleguje zadania bez doprecyzowania rezultatu i terminu albo nadmiernie ingeruje w drobne szczegóły wykonania.",
                    "Jasno i równomiernie przydziela pracownikom zadania, zakres odpowiedzialności oraz uprawnienia adekwatnie do ich kompetencji.",
                    "Deleguje zadania rozwojowo, optymalnie wykorzystując mocne strony ekspertów i budując samodzielność zespołu.",
                    "Mistrzowsko kształtuje podział odpowiedzialności w zespole, zapewniając bezbłędną realizację złożonych portfeli zadań.",
                ),
                _make_indicator(
                    "C13_I02",
                    "Monitorowanie realizacji zadań oraz w razie potrzeby podejmowanie działań korygujących lub zapobiegawczych.",
                    "Traci kontrolę nad stanem prac w zespole, dowiadując się o niewykonaniu zadań dopiero po upływie terminów.",
                    "Monitoruje postępy niesystematycznie, reagując dopiero wtedy, gdy problemy znacząco opóźniły realizację celu.",
                    "Systematycznie monitoruje postępy i jakość realizacji zadań oraz w porę podejmuje działania korygujące lub zapobiegawcze.",
                    "Stosuje przejrzyste punkty kontrolne bez mikrozarządzania, wcześnie wychwytując wąskie gardła i realokując wsparcie.",
                    "Buduje samoregulujący się system nadzoru operacyjnego gwarantujący najwyższą jakość i terminowość pracy zespołu.",
                ),
                _make_indicator(
                    "C13_I03",
                    "Motywowanie pracowników.",
                    "Demotywuje pracowników niesprawiedliwym traktowaniem, brakiem szacunku lub stosowaniem wyłącznie presji.",
                    "Rzadko docenia zaangażowanie pracowników i nie reaguje na spadek motywacji w zespole.",
                    "Dba o zaangażowanie zespołu poprzez sprawiedliwe traktowanie, docenianie wyników oraz wyjaśnianie sensu zadań.",
                    "Indywidualizuje podejście motywacyjne do potrzeb członków zespołu, utrzymując wysokie morale przy dużym obciążeniu.",
                    "Tworzy inspirujące środowisko pracy przyciągające i zatrzymujące najlepszych ekspertów służby cywilnej.",
                ),
                _make_indicator(
                    "C13_I04",
                    "Udzielanie pracownikom informacji zwrotnej opartej na ocenie ich zaangażowania i sposobu realizacji zadań.",
                    "Nie udziela merytorycznej informacji zwrotnej albo formułuje oceny krzywdzące i niepoparte faktami.",
                    "Udziela informacji zwrotnej sporadycznie i ogólnikowo, skupiając się wyłącznie na wytykaniu błędów.",
                    "Regularnie udziela pracownikom konstruktywnej informacji zwrotnej opartej na faktach, doceniając osiągnięcia i wskazując obszary poprawy.",
                    "Prowadzi bieżący, partnerski dialog rozwojowy z pracownikami, wspierając systematyczne podnoszenie jakości ich pracy.",
                    "Kształtuje kulturę otwartego, dwustronnego feedbacku behawioralnego, stanowiąc wzór wspierającego przełożonego.",
                ),
                _make_indicator(
                    "C13_I05",
                    "Rozwiązywanie konfliktów.",
                    "Ignoruje narastające konflikty w zespole, faworyzuje jedną ze stron lub sam eskaluje spory.",
                    "Reaguje na konflikty z opóźnieniem lub powierzchownie wycisza spór bez usunięcia jego przyczyn.",
                    "W porę reaguje na nieporozumienia i konflikty, bezstronnie wysłuchuje stron i doprowadza do konstruktywnego rozwiązania.",
                    "Diagnozuje źródła napięć na styku ról zanim przerodzą się w konflikt, skutecznie chroniąc współpracę w zespole.",
                    "Z powodzeniem rozwiązuje głębokie konflikty wewnątrz- i międzyzespołowe, trwale odbudowując zaufanie i efektywność.",
                ),
                _make_indicator(
                    "C13_I06",
                    "Wspieranie pracowników w rozwoju zawodowym, w szczególności identyfikowanie potrzeb rozwojowych, proponowanie działań rozwojowych oraz monitorowanie ich realizacji.",
                    "Blokuje udział pracowników w szkoleniach i traktuje IPRZ wyłącznie jako zbędną formalność.",
                    "Określa potrzeby szkoleniowe schematycznie, bez powiązania z zadaniami stanowiska i nie monitoruje ich efektów.",
                    "Trafnie identyfikuje potrzeby rozwojowe pracowników, uzgadnia adekwatne działania w IPRZ oraz monitoruje ich realizację.",
                    "Łączy szkolenia z mentoringiem i zadaniami rozwojowymi, świadomie budując wszechstronność oraz zastępowalność w zespole.",
                    "Strategicznie rozwija talenty i sukcesję ekspercką, przygotowując pracowników do ról eksperckich i kierowniczych.",
                ),
            ],
        ),
        # 14. PODEJMOWANIE DECYZJI I ODPOWIEDZIALNOŚĆ (3 wskaźniki)
        (
            14,
            CRITERION_PODEJMOWANIE_DECYZJI,
            [
                _make_indicator(
                    "C14_I01",
                    "Wypracowywanie alternatywnych rozwiązań na podstawie analizy informacji, w szczególności potencjalnego ryzyka.",
                    "Podejmuje pochopne rozstrzygnięcia bez analizy faktów, przepisów i ryzyka albo nie rozważa żadnej alternatywy.",
                    "Rozważa wyłącznie jeden oczywisty wariant i pobieżnie ocenia ryzyko, przez co decyzje wymagają częstych korekt.",
                    "Przed podjęciem decyzji analizuje dostępne informacje oraz potencjalne ryzyka, wypracowując racjonalne warianty działania.",
                    "Systematycznie zestawia wielowymiarowe warianty decyzyjne wraz z precyzyjnym bilansem korzyści, kosztów i ryzyk.",
                    "W sprawach precedensowych projektuje optymalne scenariusze decyzyjne zabezpieczające interes publiczny długofalowo.",
                ),
                _make_indicator(
                    "C14_I02",
                    "Podejmowanie decyzji (decyzyjność).",
                    "Unika podejmowania decyzji leżących w jego kompetencjach, przerzucając rozstrzygnięcia na przełożonych lub odwlekając sprawy.",
                    "Zwleka z podjęciem decyzji w sytuacjach niejednoznacznych, powodując przestoje w pracy zespołu.",
                    "W ramach posiadanych uprawnień podejmuje jednoznaczne, wyważone decyzje we właściwym czasie.",
                    "Zachowuje wysoką decyzyjność pod presją czasu i przy niepełnej informacji, nadając zespołowi jasny kierunek działania.",
                    "Odważnie i trafnie rozstrzyga najtrudniejsze dylematy zarządcze oraz kryzysowe w granicach prawa.",
                ),
                _make_indicator(
                    "C14_I03",
                    "Przyjmowanie odpowiedzialności za efekty podjętych decyzji.",
                    "W razie niepowodzenia wypiera się własnych decyzji i przerzuca winę na podwładnych lub współpracowników.",
                    "Niechętnie przyznaje się do nietrafnych rozstrzygnięć, skupiając się na usprawiedliwieniach zamiast naprawie skutków.",
                    "Bierze pełną odpowiedzialność za skutki podjętych decyzji, a w razie błędu niezwłocznie podejmuje działania naprawcze.",
                    "Odważnie firmuje trudne decyzje na zewnątrz i chroni zespół w sytuacjach uzasadnionego ryzyka operacyjnego.",
                    "Prezentuje najwyższy etos służby publicznej, łącząc pełną rozliczalność za rezultaty z budowaniem kultury odpowiedzialności.",
                ),
            ],
        ),
    ]

    mandatory_b_set = set(MANDATORY_CRITERIA_FORM_B)
    mandatory_c_set = set(MANDATORY_CRITERIA_FORM_C)
    mandatory_first_set = set(MANDATORY_CRITERIA_FIRST_EVAL)

    competencies: list[dict[str, Any]] = []
    for lp, canonical_name, indicators in raw_spec:
        competencies.append(
            {
                "id": lp,
                "name": canonical_name,
                "upper_name": canonical_name.upper(),
                "indicator_count": len(indicators),
                "mandatory_for_B": canonical_name in mandatory_b_set,
                "mandatory_for_C": canonical_name in mandatory_c_set,
                "mandatory_for_first_eval": canonical_name in mandatory_first_set,
                "indicators": indicators,
            }
        )
    return competencies


def _cell_str(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def _detect_level_columns(header_row: list[str]) -> dict[str, int]:
    """Wykrywa indeksy kolumn odpowiadające 5 poziomom oceny (1, 3, 5, 7, 9) w arkuszu Excel."""
    mapping: dict[str, int] = {}
    for idx, text in enumerate(header_row):
        low = text.casefold()
        if not low:
            continue
        if "znacznie poniżej" in low or re.search(r"\b1\s*pkt|\bpoziom\s*1\b|^1$", low):
            mapping.setdefault("1", idx)
        elif "poniżej oczekiwań" in low or re.search(r"\b3\s*pkt|\bpoziom\s*3\b|^3$", low):
            mapping.setdefault("3", idx)
        elif "na poziomie oczekiwań" in low or re.search(r"\b5\s*pkt|\bpoziom\s*5\b|^5$", low):
            mapping.setdefault("5", idx)
        elif "znacznie powyżej" in low or re.search(r"\b9\s*pkt|\bpoziom\s*9\b|^9$", low):
            mapping.setdefault("9", idx)
        elif "powyżej oczekiwań" in low or re.search(r"\b7\s*pkt|\bpoziom\s*7\b|^7$", low):
            mapping.setdefault("7", idx)
    return mapping


def _match_competency_in_text(text: str) -> str | None:
    if not text:
        return None
    normalized = normalize_criterion_name(text)
    if normalized in STATUTORY_CRITERIA_CATALOG:
        return normalized
    low = text.casefold()
    for canonical in sorted(STATUTORY_CRITERIA_CATALOG, key=len, reverse=True):
        if canonical.casefold() in low:
            return canonical
    return None


def _parse_single_sheet_indicators(
    ws: Worksheet,
    forced_competency: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """
    Wyciąga wskaźniki behawioralne oraz 5 poziomów opisowych z pojedynczego arkusza Excela.
    Obsługuje zarówno jeden zbiorczy arkusz matrycowy, jak i osobne arkusze dla każdej z 14 kompetencji.
    """
    rows: list[list[str]] = [
        [_cell_str(cell) for cell in row]
        for row in ws.iter_rows(values_only=True)
    ]

    extracted: dict[str, list[dict[str, Any]]] = {}
    current_comp: str | None = forced_competency
    level_cols: dict[str, int] = {}
    indicator_col: int | None = None
    comp_col: int | None = None

    for row in rows:
        if not any(row):
            continue

        detected_levels = _detect_level_columns(row)
        if len(detected_levels) >= 4:
            level_cols = detected_levels
            first_lvl_col = min(level_cols.values())
            for col_idx in range(first_lvl_col):
                col_head = row[col_idx].casefold()
                if "kompetencj" in col_head or "kryterium" in col_head:
                    comp_col = col_idx
                elif "wskaźnik" in col_head or "zachowani" in col_head or "opis" in col_head:
                    indicator_col = col_idx
            if indicator_col is None and first_lvl_col > 0:
                indicator_col = first_lvl_col - 1
            continue

        if not forced_competency:
            if comp_col is not None and comp_col < len(row) and row[comp_col]:
                matched = _match_competency_in_text(row[comp_col])
                if matched:
                    current_comp = matched
            else:
                non_empty = [c for c in row if c]
                if len(non_empty) <= 2:
                    matched = _match_competency_in_text(" ".join(non_empty))
                    if matched:
                        current_comp = matched
                        continue

        if current_comp and len(level_cols) == 5 and indicator_col is not None and indicator_col < len(row):
            ind_title = row[indicator_col]
            levels_data: dict[str, str] = {
                lvl_key: (row[col_i] if col_i < len(row) else "")
                for lvl_key, col_i in level_cols.items()
            }
            if ind_title and all(levels_data.values()):
                if ind_title.casefold() in {"wskaźnik", "wskaźniki behawioralne", "wskaźnik behawioralny"}:
                    continue
                extracted.setdefault(current_comp, []).append(
                    {
                        "indicator": ind_title,
                        "levels": levels_data,
                    }
                )

    return extracted


def parse_excel_workbook(excel_path: Path) -> list[dict[str, Any]]:
    """
    Parsuje plik `Model_kompetencji.xlsx` przy użyciu `openpyxl` i mapuje wszystkie 14 kompetencji,
    49 wskaźników behawioralnych oraz 5 poziomów oceny.
    """
    if not excel_path.exists():
        raise FileNotFoundError(
            f"Nie znaleziono pliku Excel: {excel_path}. "
            f"Umieść plik w tej lokalizacji lub uruchom skrypt z flagą --seed-from-spec."
        )

    wb = openpyxl.load_workbook(excel_path, data_only=True)
    collected_by_comp: dict[str, list[dict[str, Any]]] = {}

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        forced_comp = _match_competency_in_text(sheet_name)
        if forced_comp is None:
            top_text = " ".join(
                _cell_str(cell)
                for r in ws.iter_rows(min_row=1, max_row=5, values_only=True)
                for cell in r
                if cell is not None
            )
            matched_top = _match_competency_in_text(top_text)
            if matched_top and "liczba wskaźników" not in top_text.casefold():
                forced_comp = matched_top

        sheet_data = _parse_single_sheet_indicators(ws, forced_competency=forced_comp)
        for comp_name, inds in sheet_data.items():
            if inds:
                collected_by_comp.setdefault(comp_name, []).extend(inds)

    if not collected_by_comp:
        raise ValueError(
            f"Skoroszyt {excel_path.name} nie zawiera szczegółowych tabel z 5 poziomami wskaźników "
            f"(znaleziono arkusze: {wb.sheetnames}). Użyj przełącznika --seed-from-spec."
        )

    mandatory_b_set = set(MANDATORY_CRITERIA_FORM_B)
    mandatory_c_set = set(MANDATORY_CRITERIA_FORM_C)
    mandatory_first_set = set(MANDATORY_CRITERIA_FIRST_EVAL)

    competencies: list[dict[str, Any]] = []
    for lp, canonical_name in enumerate(STATUTORY_CRITERIA_CATALOG, start=1):
        raw_inds = collected_by_comp.get(canonical_name, [])
        formatted_inds: list[dict[str, Any]] = []
        for idx, item in enumerate(raw_inds, start=1):
            levels_dict = item["levels"]
            formatted_inds.append(
                {
                    "id": f"C{lp:02d}_I{idx:02d}",
                    "indicator": item["indicator"],
                    "levels": {
                        "1": levels_dict["1"],
                        "3": levels_dict["3"],
                        "5": levels_dict["5"],
                        "7": levels_dict["7"],
                        "9": levels_dict["9"],
                    },
                }
            )
        competencies.append(
            {
                "id": lp,
                "name": canonical_name,
                "upper_name": canonical_name.upper(),
                "indicator_count": len(formatted_inds),
                "mandatory_for_B": canonical_name in mandatory_b_set,
                "mandatory_for_C": canonical_name in mandatory_c_set,
                "mandatory_for_first_eval": canonical_name in mandatory_first_set,
                "indicators": formatted_inds,
            }
        )

    return competencies


def validate_competency_payload(competencies: list[dict[str, Any]]) -> None:
    """Rygorystyczna weryfikacja spójności wygenerowanego modelu z Model_kompetencji.pdf."""
    if len(competencies) != EXPECTED_TOTAL_COMPETENCIES:
        raise ValueError(
            f"Oczekiwano {EXPECTED_TOTAL_COMPETENCIES} kompetencji, otrzymano {len(competencies)}."
        )

    total_indicators = 0
    expected_keys = {"1", "3", "5", "7", "9"}

    for comp in competencies:
        name = comp["name"]
        expected_count = EXPECTED_INDICATOR_COUNTS.get(name)
        actual_count = len(comp["indicators"])
        if expected_count is not None and actual_count != expected_count:
            raise ValueError(
                f"Kompetencja '{name}': oczekiwano {expected_count} wskaźników wg Model_kompetencji.pdf, "
                f"otrzymano {actual_count}."
            )

        for ind in comp["indicators"]:
            if not ind.get("indicator"):
                raise ValueError(f"Pusty tytuł wskaźnika w kompetencji '{name}'.")
            levels = ind.get("levels", {})
            if set(levels.keys()) != expected_keys:
                raise ValueError(
                    f"Wskaźnik '{ind.get('id')}' w '{name}' nie posiada dokładnie 5 poziomów {expected_keys}."
                )
            for lvl_key, desc in levels.items():
                if not str(desc).strip():
                    raise ValueError(
                        f"Pusty opis poziomu '{lvl_key}' we wskaźniku '{ind.get('id')}' ('{name}')."
                    )
        total_indicators += actual_count

    if total_indicators != EXPECTED_TOTAL_INDICATORS:
        raise ValueError(
            f"Oczekiwano łącznie {EXPECTED_TOTAL_INDICATORS} wskaźników behawioralnych, "
            f"otrzymano {total_indicators}."
        )


def build_output_document(competencies: list[dict[str, Any]], source_label: str) -> dict[str, Any]:
    """Opakowuje zweryfikowaną listę kompetencji w kompletny dokument JSON."""
    return {
        "title": "MODEL KOMPETENCJI | SŁUŻBA CYWILNA",
        "version": "1.0.0",
        "source": source_label,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "competencies_count": len(competencies),
            "behavioral_indicators_count": sum(len(c["indicators"]) for c in competencies),
            "rating_levels_count": len(LEVEL_METADATA),
        },
        "rating_scale": LEVEL_METADATA,
        "competencies": competencies,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Konwerter Model_kompetencji.xlsx -> competency_model.json dla modułu M1."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=settings.COMPETENCY_MODEL_EXCEL_PATH,
        help=f"Ścieżka do pliku wejściowego Excel (domyślnie: {settings.COMPETENCY_MODEL_EXCEL_PATH})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=settings.COMPETENCY_MODEL_JSON_PATH,
        help=f"Ścieżka do wyjściowego pliku JSON (domyślnie: {settings.COMPETENCY_MODEL_JSON_PATH})",
    )
    parser.add_argument(
        "--seed-from-spec",
        action="store_true",
        help="Generuje pełny model (14 kompetencji, 49 wskaźników, 5 poziomów) bezpośrednio ze specyfikacji prawnej.",
    )

    args = parser.parse_args(argv)

    if args.seed_from_spec:
        competencies = build_seed_competencies()
        source_label = "spec_seed_dz_u_2016_poz_470_and_model_kompetencji_pdf"
    else:
        competencies = parse_excel_workbook(args.input)
        source_label = str(args.input.name)

    validate_competency_payload(competencies)
    payload = build_output_document(competencies, source_label=source_label)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        f"[OK] Wygenerowano {args.output} "
        f"(źródło: {source_label}, kompetencje: {payload['summary']['competencies_count']}, "
        f"wskaźniki: {payload['summary']['behavioral_indicators_count']}, "
        f"poziomy oceny: {payload['summary']['rating_levels_count']})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())