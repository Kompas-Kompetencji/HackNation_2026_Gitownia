from __future__ import annotations

import json
from typing import Any

from app.core.config import (
    MANDATORY_CRITERIA_FORM_B,
    MANDATORY_CRITERIA_FORM_C,
    MAX_ADDITIONAL_CRITERIA_PERIODIC,
    STATUTORY_CRITERIA_CATALOG,
    normalize_criterion_name,
    settings,
)
from app.core.deadline_calc import calculate_deadlines
from app.core.scoring_engine import evaluate
from app.schemas.ai_models import (
    AiChatRequest,
    AiChatResponse,
    AutoDraftRequest,
    AutoDraftResponse,
    ChatAssistantType,
    CriterionSuggestion,
    OspAnalysisAiResponse,
)
from app.schemas.models import (
    DeadlineResponse,
    EvaluationResponse,
    EvaluationType,
    FormType,
    OspParseResult,
)
from app.services.llm_client import generate_chat_completion
from scripts.parse_excel import build_output_document, build_seed_competencies

LEGAL_RULES_SYSTEM_BLOCK = """
BEZWZGLĘDNE REGUŁY PRAWNE SŁUŻBY CYWILNEJ:
1. PIERWSZA OCENA (Dz. U. 2015 poz. 1144):
   - Rozmowa wstępna: 21 dni od zatrudnienia. Sprawozdanie: min. 7 mies. pracy, składane po 8 mies. Ocena: 8–11 mies. (min. 1 mies. przed końcem umowy).
   - 5 elementów obowiązkowych (brak dodatkowych), skala wyłącznie {3, 5, 7}.
   - Ocena POZYTYWNA wymaga 4 warunków łącznie: egzamin (TAK lub NIE DOTYCZY), sprawozdanie w terminie, max jedna ocena 3 pkt, średnia >= 5,00 pkt.
   - Przy NEGATYWNEJ uzasadnienie obowiązkowe, a wniosków rozwojowych (Część VI) nie sporządza się. Brak sprzeciwu z art. 83.
2. OCENA OKRESOWA (Dz. U. 2016 poz. 470):
   - Arkusz B (kierujący pracownikami) lub Arkusz C (pozostałe stanowiska) + 0 do max 3 kryteriów dodatkowych z katalogu 14.
   - Skala wyłącznie {1, 3, 5, 7, 9} (5 pkt = standard na poziomie oczekiwań).
   - Ocena POZYTYWNA wyłącznie gdy średnia > 4,00 pkt ORAZ brak choćby jednej oceny 1 pkt! Jedna ocena 1 pkt wymusza NEGATYWNĄ.
   - Rozmowa z kryteriami: 30 dni (7 dni po negatywnej). Cykl: 24 mies. (6 mies. po negatywnej), wydłużany o ciągłe nieobecności > 30 dni. Sprzeciw: 7 dni.
   - Część III (stopień służbowy): tylko dla mianowanego URZĘDNIKA SC z oceną POZYTYWNĄ.
3. MODEL KOMPETENCJI: stosuj schemat Sytuacja – Działanie – Rezultat (SDR), powtarzalność zachowań i brak obniżania oceny przy braku okazji do obserwacji.
""".strip()

ASSISTANT_CONFIGS: dict[ChatAssistantType, dict[str, Any]] = {
    ChatAssistantType.OSP_ADVISOR: {
        "title": "Analiza opisu stanowiska pracy",
        "description": "Dobór Arkusza B/C, kryteriów dodatkowych (max 3) i wskaźników pod zadania z OSP.",
        "persona": "Jesteś Asystentem Analizy OSP w służbie cywilnej. Dobierasz Arkusz B/C, max 3 kryteria dodatkowe i wskaźniki behawioralne.",
        "quick_replies": [
            "Jakie 3 kryteria dodatkowe najlepiej pasują do tego stanowiska?",
            "Które wskaźniki behawioralne omówić z pracownikiem na start?",
            "Zaproponuj cele do osiągnięcia wynikające z zadań dominujących",
        ],
    },
    ChatAssistantType.START_EVALUATION: {
        "title": "Rozpocznij ocenę",
        "description": "Przygotowanie rozmowy wstępnej, omówienie kryteriów, standardu 5 pkt i terminów.",
        "persona": "Jesteś Asystentem Rozpoczęcia Oceny. Pomagasz przygotować rozmowę wstępną, omówić obowiązki z OSP, standard 5 pkt i terminy.",
        "quick_replies": [
            "Co muszę obowiązkowo omówić podczas rozmowy wstępnej?",
            "Jak wytłumaczyć pracownikowi, co oznacza poziom 5 pkt (standard)?",
            "Sprawdź terminy rozmowy wstępnej i oceny dla tego pracownika",
        ],
    },
    ChatAssistantType.FINISH_EVALUATION: {
        "title": "Zakończ ocenę (z modelem kompetencji)",
        "description": "Dobór punktacji na bazie zachowań (Sytuacja–Działanie–Rezultat) i pisanie uzasadnienia.",
        "persona": "Jesteś Asystentem Zakończenia Oceny wg Modelu Kompetencji SC. Mapujesz zachowania (SDR) na punkty skali i redagujesz uzasadnienie.",
        "quick_replies": [
            "Mam opis sytuacji z pracy – pomóż dobrać sprawiedliwą punktację",
            "Zredaguj projekt uzasadnienia oceny na podstawie przyznanych punktów",
            "Co zrobić, gdy nie miałem okazji zaobserwować jednego ze wskaźników?",
        ],
    },
    ChatAssistantType.FORMAL_ASSISTANT: {
        "title": "Asystent formalny oceny",
        "description": "Wsparcie w zakresie procedury, formularzy, terminów i poprawności formalnoprawnej.",
        "persona": "Jesteś Asystentem Formalnym Oceny w służbie cywilnej. Pilnujesz zgodności z rozporządzeniami i wynikami silnika M1.",
        "quick_replies": [
            "Sprawdź poprawność formalną mojego obecnego formularza",
            "Kiedy dołącza się Część III (wniosek o stopień służbowy)?",
            "Jak długie L4 przesuwa termin sporządzenia oceny?",
        ],
    },
    ChatAssistantType.CONVERSATION_COACHING: {
        "title": "Asystent rozmowy i rozwoju (mentoring / coaching)",
        "description": "Scenariusz rozmowy oceniającej, konstruktywny feedback (SDR) i plan rozwoju IPRZ.",
        "persona": "Jesteś Asystentem Rozmowy Oceniającej i Rozwoju Zawodowego (coaching/mentoring). Pomagasz przekazać feedback i ułożyć IPRZ.",
        "quick_replies": [
            "Przygotuj scenariusz rozmowy oceniającej krok po kroku",
            "Jak spokojnie przekazać pracownikowi ocenę 3 pkt z jednego kryterium?",
            "Zaproponuj plan rozwoju IPRZ (mentoring, szkolenia, zadania praktyczne)",
        ],
    },
}

_OSP_KEYWORDS_TO_CRITERIA: list[tuple[str, tuple[str, ...]]] = [
    ("Myślenie analityczne", ("analiz", "ocen", "opini", "orzecznictw", "interpretacj", "wykaz", "wniosk")),
    ("Radzenie sobie w sytuacjach kryzysowych", ("kryzys", "incydent", "zagrożen", "odpornoś", "alarmow", "csirt", "cyberbezpieczeństw")),
    ("Negocjowanie", ("negocj", "uzgadnian", "spor", "grup roboczych", "stanowisk", "interesów")),
    ("Wystąpienia publiczne", ("reprezentowan", "konferencj", "prezentacj", "kongres", "seminari", "forum")),
    ("Kreatywność", ("innowac", "nowych rozwiązań", "usprawnia", "projektowan", "koncepcj")),
    ("Orientacja na klienta/interesanta", ("obywatel", "interesant", "klient", "wnioskując", "zapytania publiczne")),
    ("Podejmowanie decyzji i odpowiedzialność", ("decyzj", "kontrol", "nadzor", "upoważnien", "odpowiedzialnoś")),
    ("Zarządzanie strategiczne", ("strateg", "polityk", "systemowych", "kierunków zmian", "wieloletni")),
]


def _load_catalog() -> dict[str, Any]:
    path = settings.COMPETENCY_MODEL_JSON_PATH
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return build_output_document(build_seed_competencies(), source_label="runtime_seed")


def get_assistants_catalog_for_frontend() -> list[dict[str, Any]]:
    return [
        {
            "assistant_type": key.value,
            "title": cfg["title"],
            "description": cfg["description"],
            "quick_replies": cfg["quick_replies"],
        }
        for key, cfg in ASSISTANT_CONFIGS.items()
    ]


def _extract_relevant_indicators_context(
    catalog: dict[str, Any],
    query_text: str,
    m1_eval: EvaluationResponse | None,
    osp: OspParseResult | None,
) -> str:
    low_q = query_text.casefold()
    matched_names: list[str] = [
        c["name"] for c in catalog.get("competencies", []) if c["name"].casefold() in low_q
    ]
    if m1_eval:
        for c_name in m1_eval.iprz_mandatory_criteria:
            if c_name not in matched_names:
                matched_names.append(c_name)
    if osp:
        for raw_skill in osp.kompetencje_miekkie_z_osp:
            norm = normalize_criterion_name(raw_skill)
            if norm not in matched_names:
                matched_names.append(norm)

    if not matched_names:
        lines = [f"- {c['name']} ({c['indicator_count']} wskaźników)" for c in catalog.get("competencies", [])]
        return "WYKAZ 14 KOMPETENCJI SŁUŻBY CYWILNEJ:\n" + "\n".join(lines)

    out: list[str] = []
    for comp in catalog.get("competencies", []):
        if comp["name"] in matched_names[:4]:
            inds = "\n".join(
                f"  * {i['indicator']}\n"
                f"    [1 pkt]: {i['levels']['1']}\n"
                f"    [3 pkt]: {i['levels']['3']}\n"
                f"    [5 pkt]: {i['levels']['5']}\n"
                f"    [7 pkt]: {i['levels']['7']}\n"
                f"    [9 pkt]: {i['levels']['9']}"
                for i in comp["indicators"]
            )
            out.append(f"KOMPETENCJA '{comp['name']}':\n{inds}")
    return "\n\n".join(out)


def _build_smart_local_reply(
    req: AiChatRequest,
    m1_eval: EvaluationResponse | None,
    m1_deadlines: DeadlineResponse | None,
) -> str:
    cfg = ASSISTANT_CONFIGS[req.assistant_type]
    sections: list[str] = [f"### {cfg['title']}"]

    if m1_eval is not None:
        sections.append(
            f"**Weryfikacja silnika prawnego M1:**\n"
            f"- Średnia: **{m1_eval.srednia_arytmetyczna:.2f} pkt** ({m1_eval.ogolny_poziom or 'Pierwsza ocena'})\n"
            f"- Werdykt: **{m1_eval.werdykt}**\n"
            f"- Uzasadnienie obowiązkowe: **{'TAK' if m1_eval.uzasadnienie_obowiazkowe else 'NIE'}**\n"
            f"- Część III (stopień służbowy): **{'TAK' if m1_eval.include_part_3 else 'NIE'}**"
        )
        if m1_eval.errors:
            sections.append("**Błędy formalne:**\n" + "\n".join(f"- {e}" for e in m1_eval.errors))
        if m1_eval.iprz_mandatory_criteria:
            sections.append("**Priorytet w IPRZ (1 lub 3 pkt):** " + ", ".join(m1_eval.iprz_mandatory_criteria))

    if m1_deadlines is not None:
        sections.append(
            f"**Terminy ustawowe M1:**\n"
            f"- Rozmowa wstępna do: **{m1_deadlines.termin_rozmowy_wstepnej_max or '-'}**\n"
            f"- Sporządzenie oceny do: **{m1_deadlines.termin_dokonania_oceny_max or '-'}**\n"
            f"- Sprzeciw (7 dni) do: **{m1_deadlines.termin_wniesienia_sprzeciwu_max or 'nie dotyczy'}**"
        )

    if req.evaluation_type == EvaluationType.FIRST_EVALUATION:
        sections.append(
            "**Wskazówka (Pierwsza Ocena – Dz. U. 2015 poz. 1144):** skala **3/5/7 pkt**, 5 stałych elementów. "
            "Ocena pozytywna wymaga zdanego egzaminu, sprawozdania w terminie, max jednej trójki i średniej **>= 5,00 pkt**."
        )
    else:
        sections.append(
            "**Wskazówka (Ocena Okresowa – Dz. U. 2016 poz. 470):** Arkusz B (kierujący) lub C (specjaliści), skala **1/3/5/7/9 pkt**. "
            "Ocena pozytywna wymaga średniej **> 4,00 pkt** i braku ocen **1 pkt**. Stosuj przykłady **Sytuacja – Działanie – Rezultat**."
        )
    return "\n\n".join(sections)


async def handle_ai_chat(req: AiChatRequest) -> AiChatResponse:
    m1_eval = evaluate(req.evaluation_context) if req.evaluation_context is not None else None
    m1_deadlines = calculate_deadlines(req.deadline_context) if req.deadline_context is not None else None

    catalog = _load_catalog()
    cfg = ASSISTANT_CONFIGS[req.assistant_type]
    comp_context = _extract_relevant_indicators_context(catalog, req.messages[-1].content, m1_eval, req.osp_context)

    prompt_parts: list[str] = [
        cfg["persona"],
        LEGAL_RULES_SYSTEM_BLOCK,
        f"ŚCIEŻKA OCENY: {req.evaluation_type.value}",
        comp_context,
    ]
    if req.osp_context is not None:
        prompt_parts.append("[OSP]:\n" + json.dumps(req.osp_context.model_dump(mode="json"), ensure_ascii=False))
    if m1_eval is not None:
        prompt_parts.append("[WYNIK M1 - PRAWDA ABSOLUTNA]:\n" + json.dumps(m1_eval.model_dump(mode="json"), ensure_ascii=False))
    if m1_deadlines is not None:
        prompt_parts.append("[TERMINY M1]:\n" + json.dumps(m1_deadlines.model_dump(mode="json"), ensure_ascii=False))

    reply_text, provider, model_name = await generate_chat_completion(
        system_prompt="\n\n".join(prompt_parts),
        messages=[{"role": m.role, "content": m.content} for m in req.messages[-12:]],
        fallback_reply=_build_smart_local_reply(req, m1_eval, m1_deadlines),
    )

    return AiChatResponse(
        assistant_type=req.assistant_type,
        reply=reply_text,
        provider=provider,
        model=model_name,
        quick_replies=cfg["quick_replies"],
        m1_evaluation_check=m1_eval,
        m1_deadline_check=m1_deadlines,
    )


async def analyze_osp_with_ai(osp: OspParseResult) -> OspAnalysisAiResponse:
    catalog = _load_catalog()
    mandatory = list(MANDATORY_CRITERIA_FORM_B) if osp.zalecany_arkusz == FormType.FORM_B else list(MANDATORY_CRITERIA_FORM_C)
    mandatory_set = set(mandatory)
    comp_map = {c["name"]: c for c in catalog.get("competencies", [])}

    picked: list[tuple[str, str]] = []
    for skill in osp.kompetencje_miekkie_z_osp:
        norm = normalize_criterion_name(skill)
        if norm in STATUTORY_CRITERIA_CATALOG and norm not in mandatory_set and all(norm != p[0] for p in picked):
            picked.append((norm, "Wskazana bezpośrednio w sekcji kompetencji miękkich Pkt 13 OSP."))

    tasks_blob = " ".join([osp.cel_stanowiska, *osp.zadania_dominujace, *osp.zadania_pozostale]).casefold()
    for crit_name, kw_tuple in _OSP_KEYWORDS_TO_CRITERIA:
        if crit_name not in mandatory_set and all(crit_name != p[0] for p in picked):
            if any(kw in tasks_blob for kw in kw_tuple):
                picked.append((crit_name, f"Wynika bezpośrednio z głównych zadań na stanowisku '{osp.stanowisko_pracy}'."))

    suggestions = [
        CriterionSuggestion(
            name=c_name,
            rationale=reason,
            behavioral_indicators=[i["indicator"] for i in comp_map.get(c_name, {}).get("indicators", [])[:3]],
        )
        for c_name, reason in picked[:MAX_ADDITIONAL_CRITERIA_PERIODIC]
    ]
    goals = [f"Terminowa i rzetelna realizacja: {t[:140]}" for t in osp.zadania_dominujace[:3]]
    fallback_comment = (
        f"Dla stanowiska '{osp.stanowisko_pracy}' ({osp.liczba_podleglych_tekst}) właściwy jest arkusz "
        f"{osp.zalecany_arkusz.value}. Zaproponowano {len(suggestions)} kryteria dodatkowe dopasowane do zadań z OSP."
    )

    comment, provider, _ = await generate_chat_completion(
        system_prompt=f"{ASSISTANT_CONFIGS[ChatAssistantType.OSP_ADVISOR]['persona']}\n{LEGAL_RULES_SYSTEM_BLOCK}",
        messages=[{"role": "user", "content": f"Podsumuj w 4 zdaniach dobór kryteriów dla OSP: {osp.stanowisko_pracy}"}],
        fallback_reply=fallback_comment,
    )

    return OspAnalysisAiResponse(
        zalecany_arkusz=osp.zalecany_arkusz,
        mandatory_criteria=mandatory,
        suggested_additional_criteria=suggestions,
        proposed_goals=goals,
        advisor_comment=comment,
        provider=provider,
    )


async def generate_auto_drafts(req: AutoDraftRequest) -> AutoDraftResponse:
    m1_res = evaluate(req.evaluation)
    strong = [c.name for c in req.evaluation.oceny_czastkowe if c.score >= 7]
    weak = m1_res.iprz_mandatory_criteria
    person = (f"{req.evaluation.oceniany.imie} {req.evaluation.oceniany.nazwisko}").strip() or "Oceniany(a)"

    fallback_just = (
        f"W ocenianym okresie {person} uzyskał(a) średnią ocen cząstkowych {m1_res.srednia_arytmetyczna:.2f} pkt, "
        f"co skutkuje przyznaniem oceny {m1_res.werdykt}. "
        + (f"Wyróżniające rezultaty osiągnięto w kryteriach: {', '.join(strong)}. " if strong else "")
        + (f"Obszary wymagające poprawy stwierdzono w zakresie: {', '.join(weak)}. " if weak else "")
        + (f"Obserwacje przełożonego: {req.supervisor_notes.strip()}" if req.supervisor_notes else "")
    ).strip()

    just_text, provider, _ = await generate_chat_completion(
        system_prompt=(
            "Zredaguj urzędowe, rzeczowe uzasadnienie oceny w służbie cywilnej (5-7 zdań po polsku, czysty tekst bez Markdown) "
            "zgodnie z wynikiem M1."
        ),
        messages=[
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "oceniany": person,
                        "werdykt_M1": m1_res.werdykt,
                        "srednia_M1": m1_res.srednia_arytmetyczna,
                        "oceny": [c.model_dump() for c in req.evaluation.oceny_czastkowe],
                        "notatki": req.supervisor_notes,
                    },
                    ensure_ascii=False,
                ),
            }
        ],
        fallback_reply=fallback_just,
    )

    dev_draft: str | None = None
    if m1_res.wnioski_rozwojowe_dozwolone:
        dev_draft = (
            f"Doskonalenie kompetencji w obszarach: {', '.join(weak)} – szkolenia dedykowane, mentoring w wydziale i bieżący feedback."
            if weak
            else "Pogłębianie wiedzy specjalistycznej, udział w szkoleniach kierunkowych oraz dzielenie się wiedzą w zespole."
        )

    rank_draft = (
        f"{person} uzyskał(a) pozytywną ocenę okresową ({m1_res.srednia_arytmetyczna:.2f} pkt), wykazując wysoką samodzielność "
        "i jakość pracy, co uzasadnia przyznanie kolejnego stopnia służbowego zgodnie z art. 89 ust. 1 ustawy o służbie cywilnej."
        if m1_res.include_part_3
        else None
    )

    return AutoDraftResponse(
        m1_validation=m1_res,
        uzasadnienie_draft=just_text,
        wnioski_rozwojowe_draft=dev_draft,
        umotywowanie_stopnia_draft=rank_draft,
        conversation_agenda=[
            "1. Powitanie i wysłuchanie samooceny pracownika za oceniany okres.",
            "2. Omówienie ocen cząstkowych na przykładach (Sytuacja – Działanie – Rezultat).",
            f"3. Przedstawienie wyniku końcowego ({m1_res.werdykt}, średnia {m1_res.srednia_arytmetyczna:.2f} pkt).",
            "4. Uzgodnienie planu rozwoju zawodowego (IPRZ / mentoring / szkolenia).",
            "5. Podsumowanie rozmowy i informacja o trybie podpisania arkusza.",
        ],
        provider=provider,
    )
