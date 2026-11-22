from __future__ import annotations

import json
from typing import Any

from app.core.config import normalize_criterion_name, settings
from app.schemas.form_contract import (
    CoachingAssistantRequest,
    CoachingAssistantResponse,
    FormPatch,
)
from app.services.pii_guard import call_structured_llm, sanitize_dict_values, sanitize_pii
from app.services.rag_service import compute_deterministic_summary, retrieve_legal_sources
from scripts.parse_excel import build_output_document, build_seed_competencies


def _load_active_competency_definitions(active_names: list[str]) -> list[dict[str, Any]]:
    """
    Optymalizacja tokenów: pobiera definicje wskaźników WYŁĄCZNIE dla kompetencji
    biorących udział w danej ocenie (zamiast wysyłania pełnego katalogu 14 kompetencji).
    """
    path = settings.COMPETENCY_MODEL_JSON_PATH
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = build_output_document(build_seed_competencies(), source_label="seed")

    active_set = {normalize_criterion_name(n) for n in active_names}
    compressed: list[dict[str, Any]] = []
    for comp in data.get("competencies", []):
        if comp["name"] in active_set:
            compressed.append(
                {
                    "kompetencja": comp["name"],
                    "wskazniki_standard_5pkt": [
                        f"{ind['indicator']} -> standard (5 pkt): {ind['levels']['5']}"
                        for ind in comp.get("indicators", [])[:3]
                    ],
                }
            )
    return compressed


async def run_coaching_assistant(req: CoachingAssistantRequest) -> CoachingAssistantResponse:
    """
    Stale aktywny Asystent Rozmowy:
    - Wylicza wynik w Pythonie (`compute_deterministic_summary`),
    - Wysyła do LLM wyłącznie skompresowaną deltę (wypełnione pola + aktywne kryteria + maks. 6 tur historii),
    - Usuwa dane osobowe (RODO),
    - Adaptuje strategię rozmowy, szkic uzasadnienia STAR i IPRZ do wyniku POZYTYWNA vs NEGATYWNA.
    """
    state = req.form_state
    summary = compute_deterministic_summary(state)

    if summary.verdict == "POZYTYWNA":
        mode_tone = "POSITIVE_DEVELOPMENTAL"
    elif summary.verdict == "NEGATYWNA":
        mode_tone = "NEGATIVE_CORRECTIVE"
    else:
        mode_tone = "INCOMPLETE_PREPARATION"

    # Kompresja kontekstu (tylko wypełnione oceny, zanonimizowane notatki STAR i aktywne kompetencje)
    active_criteria = [*summary.mandatory_criteria, *state.additional_criteria[:3]]
    filled_scores = {k: v for k, v in state.scores.items() if v is not None}
    clean_star, pii_1 = sanitize_dict_values(state.star_notes)
    clean_emp, pii_2 = sanitize_dict_values(state.employee_context.model_dump())
    clean_q, pii_3 = sanitize_pii(req.question or "")
    history_tail = [{"role": t.role, "content": sanitize_pii(t.content)[0]} for t in req.history[-6:]]
    pii_redacted = pii_1 or pii_2 or pii_3

    high_scored = [k for k, v in filled_scores.items() if v >= 7]
    std_scored = [k for k, v in filled_scores.items() if v == 5]
    low_scored = summary.low_scored_criteria

    # Deterministyczny pakiet bazowy (wysoka jakość merytoryczna zgodna z poradnikami KPRM)
    if mode_tone == "POSITIVE_DEVELOPMENTAL":
        base_reply = (
            f"Wynik oceny jest **POZYTYWNY** (średnia **{summary.average:.2f} pkt**"
            + (f", poziom: *{summary.overall_level}*" if summary.overall_level else "")
            + "). Skoncentruj rozmowę na docenieniu konkretnych rezultatów STAR, wysłuchaniu perspektywy pracownika "
            "oraz wyznaczeniu ambitnych celów rozwojowych na kolejny okres."
        )
        base_questions = [
            "Z których zrealizowanych zadań w ocenianym okresie czujesz największą satysfakcję i co zadecydowało o tym efekcie?",
            "W jakich obszarach merytorycznych chciał(a)byś pogłębić samodzielność lub przejąć bardziej złożone projekty?",
            "Jakiego wsparcia szkoleniowego lub mentoringowego potrzebujesz, aby utrzymać i rozwijać obecny poziom wyników?",
        ]
        base_just = (
            f"Na stanowisku {clean_emp.get('stanowisko', 'służbowym')} osoba oceniana uzyskała średnią ocen cząstkowych "
            f"{summary.average:.2f} pkt (ocena POZYTYWNA). "
            + (f"Zachowania przekraczające standard (7–9 pkt) zaobserwowano w obszarach: {', '.join(high_scored)}. " if high_scored else "")
            + (f"Pełny standard oczekiwań (5 pkt) utrzymano w kryteriach: {', '.join(std_scored)}. " if std_scored else "")
            + (
                "Udokumentowane przykłady zachowań (STAR): " + "; ".join(f"{k}: {v}" for k, v in clean_star.items() if v)
                if any(clean_star.values())
                else "Zadania realizowano terminowo, samodzielnie i zgodnie z obowiązującymi procedurami urzędu."
            )
        )
        base_iprz = [
            f"Rozwój ekspercki i dzielenie się dobrymi praktykami w obszarze: {', '.join(high_scored[:2]) if high_scored else summary.mandatory_criteria[0]} (mentoring wewnętrzny, projekty międzywydziałowe).",
            "Szkolenie kierunkowe podnoszące kwalifikacje specjalistyczne zgodnie z zakresem właściwości komórki organizacyjnej.",
            *(
                [f"Wyrównanie pojedynczego obszaru poniżej standardu ({low_scored[0]}) poprzez bieżący feedback przełożonego."]
                if low_scored
                else []
            ),
        ]
    elif mode_tone == "NEGATIVE_CORRECTIVE":
        base_reply = (
            f"Wynik oceny jest **NEGATYWNY** ({'; '.join(summary.verdict_reasons)}). "
            "Zgodnie z wytycznymi KPRM prowadź rozmowę w oparciu wyłącznie o **obserwowalne fakty i zachowania STAR** "
            "(unikaj oceniania cech osobowości). Pamiętaj, że pisemne uzasadnienie oceny jest **obowiązkowe**."
        )
        base_questions = [
            "Jak z Twojej perspektywy wyglądała realizacja zadań w obszarach, w których wystąpiły opóźnienia lub trudności?",
            "Jakie konkretne bariery organizacyjne, informacyjne lub kompetencyjne utrudniły osiągnięcie oczekiwanego standardu (5 pkt)?",
            "Co możemy wspólnie wdrożyć od jutra w sposobie planowania i weryfikacji pracy, aby wyeliminować powtarzające się błędy?",
        ]
        base_just = (
            f"W ocenianym okresie na stanowisku {clean_emp.get('stanowisko', 'służbowym')} osoba oceniana uzyskała średnią "
            f"{summary.average:.2f} pkt, co skutkuje przyznaniem oceny NEGATYWNEJ ({'; '.join(summary.verdict_reasons)}). "
            f"Poziom poniżej oczekiwań odnotowano w kryteriach: {', '.join(low_scored) or 'wymaganych na stanowisku'}. "
            + (
                "Zaobserwowane fakty i ich skutki (STAR): " + "; ".join(f"{k}: {v}" for k, v in clean_star.items() if v)
                if any(clean_star.values())
                else "Stwierdzono powtarzające się odstępstwa od standardów terminowości i jakości wymagające stałej korekty przełożonego."
            )
        )
        base_iprz = (
            [
                f"Plan naprawczy dla kryterium '{crit}': doprecyzowanie standardu wykonania, cotygodniowy przegląd postępów z przełożonym oraz szkolenie warsztatowe."
                for crit in low_scored
            ]
            if summary.dev_plan_allowed
            else []
        )
    else:
        base_reply = (
            "Formularz jest jeszcze **niekompletny** – uzupełnij oceny cząstkowe (oraz status egzaminu/sprawozdania w I ocenie), "
            "aby Asystent rozmowy wygenerował pełną strategię spotkania i wiążący szkic uzasadnienia."
        )
        base_questions = [
            "Jakie najważniejsze zadania i cele udało się zrealizować w ocenianym okresie?",
            "Które sytuacje zawodowe były największym wyzwaniem i jak sobie z nimi poradziłeś(-aś)?",
        ]
        base_just = ""
        base_iprz = []

    star_args = [
        f"{k}: {v}" for k, v in clean_star.items() if str(v).strip()
    ] or [
        "Wskazówka KPRM: zapisz min. 1 konkretny przykład Sytuacja – Działanie – Rezultat dla kryteriów skrajnych (1, 3, 7, 9 pkt)."
    ]

    rank_hint: str | None = None
    if summary.next_rank_eligible:
        rank_hint = (
            "Oceniany ma status mianowanego URZĘDNIKA SŁUŻBY CYWILNEJ i uzyskał ocenę POZYTYWNĄ – "
            "możesz złożyć umotywowany wniosek o przyznanie kolejnego stopnia służbowego (Część III arkusza, art. 89 ust. 1 ustawy o SC)."
        )

    # Wywołanie LLM (Gemini Free Tier / On-Prem) ze skompresowanym kontekstem delta
    response_schema = {
        "type": "OBJECT",
        "properties": {
            "coach_reply": {"type": "STRING"},
            "conversation_questions": {"type": "ARRAY", "items": {"type": "STRING"}},
            "star_arguments": {"type": "ARRAY", "items": {"type": "STRING"}},
            "justification_draft": {"type": "STRING"},
            "iprz_recommendations": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": [
            "coach_reply",
            "conversation_questions",
            "star_arguments",
            "justification_draft",
            "iprz_recommendations",
        ],
    }

    # RAG: fragmenty poradników KPRM / przepisów dla pytania przełożonego (podstawa wskazówek)
    rag_query = clean_q or "rozmowa oceniająca przełożonego z ocenianym pracownikiem"
    # Źródła z właściwego procesu: przy otwartym arkuszu dokładamy jego rodzaj do zapytania.
    has_scores = any(v is not None for v in state.scores.values())
    process = ""
    if has_scores:
        process = "pierwsza ocena służba przygotowawcza" if state.form_type == "pierwsza_ocena" else "ocena okresowa arkusz"
    rag_sources = retrieve_legal_sources(f"{rag_query} rozmowa ocena {process}".strip(), top_k=6)
    if has_scores:
        want_first = state.form_type == "pierwsza_ocena"
        matching = [s for s in rag_sources if ("pierwsz" in s.dokument.lower()) == want_first]
        rag_sources = (matching or rag_sources)[:3]
    else:
        rag_sources = rag_sources[:3]
    if mode_tone == "INCOMPLETE_PREPARATION" and clean_q:
        base_reply = (
            "Wskazówki do przygotowania rozmowy (na podstawie poradników KPRM):\n"
            "• Zbierz z całego okresu konkretne przykłady zachowań w układzie Sytuacja – Działanie – Rezultat "
            "dla każdego kryterium; nie opieraj się na ogólnym wrażeniu ani na ostatnich tygodniach.\n"
            "• Zacznij od perspektywy pracownika (pytania otwarte), potem omów fakty i ich wpływ na wyniki pracy.\n"
            "• Oddziel ocenę zachowań od oceny osoby; przy ocenie negatywnej uzasadnienie jest obowiązkowe.\n"
            "• Zakończ uzgodnieniem oczekiwań i działań rozwojowych na kolejny okres oraz terminem ich przeglądu.\n"
            "Ostateczna ocena i jej poziom należą wyłącznie do przełożonego."
        )
        if rag_sources:
            base_reply += f"\n\nZ materiałów źródłowych ({rag_sources[0].dokument}, {rag_sources[0].paragraf_artykul}): {rag_sources[0].excerpt}"

    delta_payload = {
        "zrodla_rag": [
            f"[{i + 1}] {s.dokument} | {s.paragraf_artykul} | str. {s.strona}: {s.full_text or s.excerpt}"
            for i, s in enumerate(rag_sources)
        ],
        "arkusz": state.form_type,
        "werdykt_deterministyczny": summary.verdict,
        "srednia": summary.average,
        "powody_werdyktu": summary.verdict_reasons,
        "kryteria_niskie_1_lub_3": low_scored,
        "wypelnione_oceny": filled_scores,
        "notatki_star": {k: v for k, v in clean_star.items() if v},
        "kontekst_stanowiska": {k: v for k, v in clean_emp.items() if v},
        "definicje_aktywnych_kompetencji": _load_active_competency_definitions(active_criteria),
        "historia_6_tur": history_tail,
        "pytanie_przelozonego": clean_q or "Przygotuj briefing do rozmowy oceniającej na podstawie bieżącego stanu formularza.",
    }

    if not filled_scores:
        # Pytanie ogólne (panel asystenta bez otwartego formularza): bez werdyktu i statusu formularza.
        for key in ("arkusz", "werdykt_deterministyczny", "srednia", "powody_werdyktu", "kryteria_niskie_1_lub_3", "wypelnione_oceny"):
            delta_payload.pop(key, None)
        delta_payload["tryb"] = "pytanie_ogolne_bez_formularza"

    sys_coach = (
        "Jesteś Asystentem Rozmowy Oceniającej KPRM w służbie cywilnej (Human-in-the-loop). "
        "Nigdy nie podważaj pola `werdykt_deterministyczny` ani `srednia`; nie ustalaj za przełożonego poziomu oceny – "
        "decyzja należy wyłącznie do niego. Opieraj wskazówki na `zrodla_rag` (poradniki KPRM, przepisy) i powołuj się na nie. "
        "Odpowiadaj po polsku, konkretnie, na `pytanie_przelozonego`. Przy `tryb` = pytanie_ogolne_bez_formularza "
        "odpowiedz ogólnie na pytanie, nie wspominaj o stanie formularza ani o werdykcie. "
        "Poziomy kryteriów bierz wyłącznie z `wypelnione_oceny` – nie zawyżaj ani nie zaniżaj ich w tekście, "
        "a kryteria na poziomie 5 opisuj jako spełniające oczekiwania (nie jako wyróżniające). "
        "`notatki_star` zawierają zachowania wybrane przez przełożonego przy wskaźnikach (poziom i opis z modelu kompetencji) "
        "oraz przykłady STAR – opieraj argumenty wyłącznie na nich, niczego nie dopisuj. Gdy przełożony pyta o kwestie do omówienia, "
        "wskaż konkretnie: kryteria z poziomem 1–3, kryteria bez przykładów lub z „brak podstaw do oceny”, rozbieżności między "
        "decyzją a wybranymi zachowaniami oraz obszary rozwojowe. Nie używaj Markdown (bez gwiazdek i nagłówków). "
        "Przy ocenie NEGATYWNEJ stosuj wyłącznie fakty i zachowania STAR (zero ocen osoby), podaj otwarte pytania "
        "diagnozujące oraz formalnie bezpieczny szkic obowiązkowego uzasadnienia. "
        + ("UWAGA: dla negatywnej pierwszej oceny pole iprz_recommendations MUSI pozostać pustą tablicą []." if not summary.dev_plan_allowed else "")
    )

    parsed, provider = await call_structured_llm(
        system_instruction=sys_coach,
        user_payload=json.dumps(delta_payload, ensure_ascii=False),
        json_schema=response_schema,
        temperature=0.25,
    )

    just_final = parsed["justification_draft"] if parsed and parsed.get("justification_draft") else base_just
    iprz_final = (
        []
        if not summary.dev_plan_allowed
        else (parsed["iprz_recommendations"] if parsed and parsed.get("iprz_recommendations") else base_iprz)
    )

    # Przygotowanie gotowych patchy 1-kliknięcia dla pól uzasadnienia i IPRZ w aktywnym formularzu
    suggested_patches: list[FormPatch] = []
    field_ids = {f.field_id for f in state.fields}
    if just_final and "uzasadnienie" in field_ids:
        suggested_patches.append(
            FormPatch(
                field_id="uzasadnienie",
                suggested_value=just_final,
                rationale=f"Szkic uzasadnienia dopasowany do werdyktu {summary.verdict} (do akceptacji przełożonego).",
                requires_approval=True,
            )
        )
    if iprz_final and "wnioski_iprz" in field_ids and summary.dev_plan_allowed:
        suggested_patches.append(
            FormPatch(
                field_id="wnioski_iprz",
                suggested_value="\n".join(f"• {item}" for item in iprz_final),
                rationale="Propozycja działań rozwojowych IPRZ na podstawie ocen cząstkowych.",
                requires_approval=True,
            )
        )

    return CoachingAssistantResponse(
        deterministic_summary=summary,
        mode_tone=mode_tone,
        coach_reply=parsed["coach_reply"] if parsed and parsed.get("coach_reply") else base_reply,
        conversation_questions=(
            parsed["conversation_questions"] if parsed and parsed.get("conversation_questions") else base_questions
        ),
        star_arguments=parsed["star_arguments"] if parsed and parsed.get("star_arguments") else star_args,
        justification_draft=just_final,
        iprz_recommendations=iprz_final,
        rank_promotion_hint=rank_hint,
        suggested_patches=suggested_patches,
        sources=rag_sources,
        pii_redacted=pii_redacted,
        provider=provider,
    )