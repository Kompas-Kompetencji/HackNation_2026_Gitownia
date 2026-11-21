from __future__ import annotations

import json
import math
import re
from collections import Counter
from decimal import Decimal
from typing import Any

from app.core.config import (
    BASE_DIR,
    FIRST_EVAL_ALLOWED_SCORES,
    MANDATORY_CRITERIA_FIRST_EVAL,
    MANDATORY_CRITERIA_FORM_A,
    MANDATORY_CRITERIA_FORM_B,
    MANDATORY_CRITERIA_FORM_C,
    MAX_ADDITIONAL_CRITERIA_PERIODIC,
    PERIODIC_ALLOWED_SCORES,
    STATUTORY_CRITERIA_CATALOG,
    normalize_criterion_name,
)
from app.core.scoring_engine import determine_periodic_overall_level, round_half_up
from app.schemas.form_contract import (
    DeterministicEvalSummary,
    FormalChatRequest,
    FormalChatResponse,
    FormPatch,
    FormSchemaState,
    FormVariant,
    RagSourceCitation,
)
from app.services.pii_guard import call_structured_llm, sanitize_pii

CHROMA_DIR = BASE_DIR / "chroma_db"
CHUNKS_JSON_PATH = BASE_DIR / "data" / "processed" / "rag_chunks.json"
CHROMA_COLLECTION_NAME = "kompas_sluzba_cywilna_docs"
EMBEDDING_MODEL_NAME = "sdadas/mmlw-retrieval-roberta-base"

MAX_CHROMA_COSINE_DISTANCE = 0.36
MIN_COMBINED_RAG_SCORE = 0.26

# Polskie słowa funkcyjne i ogólne, które nie mogą samodzielnie uzasadniać trafienia w RAG
POLISH_STOPWORDS: frozenset[str] = frozenset(
    {
        "jaki", "jaka", "jakie", "jakim", "jest", "będzie", "bedzie", "może", "moze",
        "kiedy", "gdzie", "który", "ktory", "która", "ktora", "które", "ktore",
        "albo", "oraz", "przez", "przy", "przed", "tylko", "tego", "jako", "żeby",
        "zeby", "musi", "czy", "jak", "kto", "tym", "tej", "tych", "mieć", "miec",
        "być", "byc", "zostać", "zostac", "można", "mozna", "przepis", "przepisy",
        "przepisów", "zasady", "zasad", "sposób", "sposob", "trzeba", "należy", "nalezy",
        "zrobić", "zrobic", "wygląda", "wyglada", "oznacza", "dotyczy", "wynosi", "mają",
    }
)

# Rdzenie pojęć domenowych wymaganych w zapytaniu dotyczącym ocen w służbie cywilnej
DOMAIN_ANCHOR_STEMS: tuple[str, ...] = (
    "ocen", "służb", "sluzb", "cywil", "arkusz", "sprzec", "kryter", "wskaź", "wskaz",
    "kompet", "egzam", "przygo", "sprawo", "uzasad", "iprz", "rozwoj", "rozwój",
    "stopie", "stopni", "mianow", "przeło", "przelo", "urzęd", "urzed", "pracow",
    "dyrekt", "rozmow", "nieobe", "negaty", "pozyty", "punkt", "skal", "odwoła",
    "odwola", "rozpor", "stanow", "behawi", "kierow", "zastęp", "zastep", "termin",
    "kadr", "mento", "coach",
)

# Zbyt ogólne rdzenie urzędowe – jeśli pytanie ma dodatkowe konkretne rzeczowniki (np. "trzynastka"),
# to przynajmniej jeden z tych konkretnych rzeczowników musi wystąpić w źródle PDF!
GENERIC_DOMAIN_STEMS: frozenset[str] = frozenset(
    {"służb", "sluzb", "cywil", "urzęd", "urzed", "pracow", "ustaw", "rozpor"}
)

CURATED_LEGAL_CORPUS: list[dict[str, str]] = [
    {
        "dokument": "Rozporządzenie PRM z dnia 4 kwietnia 2016 r. w sprawie ocen okresowych w służbie cywilnej (Dz. U. poz. 470)",
        "paragraf_artykul": "§ 3 ust. 2–4 oraz § 4 ust. 1–3",
        "strona": "1–2",
        "text": "Arkusz A służy do sporządzenia oceny kierownika urzędu (6 kryteriów obowiązkowych, w tym zarządzanie strategiczne). Arkusz B służy do oceny zatrudnionego na stanowisku polegającym na bezpośrednim kierowaniu pracownikami (5 kryteriów: zarządzanie ludźmi, podejmowanie decyzji i odpowiedzialność, organizacja pracy i orientacja na osiąganie celów, współpraca, komunikacja). Arkusz C dotyczy pozostałych stanowisk (wykorzystywanie wiedzy i doskonalenie zawodowe, rzetelność, organizacja pracy i orientacja na osiąganie celów, współpraca, komunikacja).",
    },
    {
        "dokument": "Rozporządzenie PRM z dnia 4 kwietnia 2016 r. w sprawie ocen okresowych w służbie cywilnej (Dz. U. poz. 470)",
        "paragraf_artykul": "§ 5 ust. 1–2 oraz § 7 pkt 1–2",
        "strona": "2",
        "text": "Oceniający może wybrać z wykazu nie więcej niż 3 kryteria dodatkowe, najistotniejsze ze względu na charakter obowiązków wynikających z opisu stanowiska pracy. Rozmowę zapoznającą z kryteriami przeprowadza się w terminie 30 dni od sporządzenia poprzedniej oceny lub zatrudnienia na czas nieokreślony, albo w terminie 7 dni od sporządzenia negatywnej oceny.",
    },
    {
        "dokument": "Rozporządzenie PRM z dnia 4 kwietnia 2016 r. w sprawie ocen okresowych w służbie cywilnej (Dz. U. poz. 470)",
        "paragraf_artykul": "§ 11 ust. 1 pkt 1–4 oraz ust. 3–5",
        "strona": "3",
        "text": "Oceny cząstkowe w ocenie okresowej przyznaje się w skali: 1 pkt (znacznie poniżej oczekiwań), 3 pkt (poniżej oczekiwań), 5 pkt (na poziomie oczekiwań), 7 pkt (powyżej oczekiwań), 9 pkt (znacznie powyżej oczekiwań). Ocenę pozytywną przyznaje się przy średniej powyżej 4 punktów pod warunkiem nieuzyskania żadnej oceny cząstkowej na poziomie 1 pkt (znacznie poniżej oczekiwań). W przypadku oceny negatywnej sporządzenie uzasadnienia jest obligatoryjne i obowiązkowe. Przy ocenie pozytywnej urzędnika służby cywilnej oceniający może sporządzić umotywowany wniosek o kolejny stopień służbowy (Część III).",
    },
    {
        "dokument": "Poradnik KPRM: Oceny okresowe w służbie cywilnej (wrzesień 2016)",
        "paragraf_artykul": "Rozdział 4 i 5.1 (art. 81 ust. 4, 6, 7 i 9 ustawy o SC)",
        "strona": "8–14",
        "text": "Termin oceny okresowej: ocenę okresową sporządza się co 24 miesiące. W razie usprawiedliwionej nieobecności ocenianego trwającej dłużej niż miesiąc (nieobecność ciągła, np. zwolnienie lekarskie L4, urlop macierzyński), termin 24-miesięczny ulega przedłużeniu o czas tej nieobecności (art. 81 ust. 7 ustawy). W razie zmiany stanowiska wiążącej się z istotną zmianą obowiązków po upływie 6 miesięcy ocenę sporządza się nie wcześniej niż 7 dni przed zmianą i nie później niż 30 dni po zmianie. Po ocenie negatywnej ponowna ocena następuje po upływie 6 miesięcy od dnia zapoznania się z oceną (art. 81 ust. 9).",
    },
    {
        "dokument": "Poradnik KPRM: Oceny okresowe w służbie cywilnej (wrzesień 2016)",
        "paragraf_artykul": "Rozdział 7 i 8 (art. 83 ust. 1–4 oraz art. 71 ust. 1 pkt 1 ustawy o SC)",
        "strona": "32–34",
        "text": "Od oceny okresowej służy sprzeciw do dyrektora generalnego urzędu w terminie 7 dni od dnia zapoznania się z oceną. Sprzeciw rozpatruje dyrektor generalny w terminie 14 dni od dnia jego wniesienia; nie wolno w wyniku rozpatrywania sprzeciwu obniżyć oceny pracownika. W razie nieuwzględnienia lub nierozpatrzenia sprzeciwu w terminie 14 dni służy odwołanie do sądu pracy. Dwukrotna następująca po sobie negatywna ocena okresowa urzędnika służby cywilnej skutkuje rozwiązaniem stosunku pracy (art. 71 ust. 1 pkt 1 ustawy).",
    },
    {
        "dokument": "Poradnik KPRM: Oceny okresowe w służbie cywilnej (wrzesień 2016)",
        "paragraf_artykul": "Rozdział 6.2.6 i 9 (art. 89 ust. 1–2 ustawy o SC)",
        "strona": "29–30, 35",
        "text": "Kolejny stopień służbowy przysługuje wyłącznie mianowanemu urzędnikowi służby cywilnej po uzyskaniu pozytywnej oceny okresowej na podstawie umotywowanego wniosku przełożonego (Część III arkusza, art. 89 ust. 1) albo z mocy prawa w terminie 30 dni po dwóch kolejnych ocenach pozytywnych na jednym z dwóch najwyższych poziomów (art. 89 ust. 2). Dla pracownika służby cywilnej Części III nie drukuje się i nie dołącza.",
    },
    {
        "dokument": "Rozporządzenie PRM z dnia 23 lipca 2015 r. w sprawie pierwszej oceny w służbie cywilnej (Dz. U. poz. 1144)",
        "paragraf_artykul": "§ 2, § 3, § 4, § 6, § 9 i § 10",
        "strona": "1–3",
        "text": "Rozmowę wstępną w pierwszej ocenie przeprowadza się w terminie 21 dni od nawiązania stosunku pracy. Sprawozdanie pracownika obejmuje przepracowany okres nie krótszy niż 7 miesięcy, a termin jego złożenia przypada po upływie 8 miesięcy od zatrudnienia. Pierwszej oceny dokonuje bezpośredni przełożony w porozumieniu z kierującym komórką nie wcześniej niż po 8 miesiącach i nie później niż miesiąc przed końcem umowy (12 mies.). Skala obejmuje wyłącznie 3, 5 i 7 punktów dla 5 stałych elementów. Warunkiem oceny pozytywnej jest łącznie: zaliczenie egzaminu ze służby przygotowawczej, złożenie sprawozdania w terminie, nie więcej niż jedna ocena cząstkowa 3 pkt oraz średnia łączna co najmniej 5,00 pkt.",
    },
    {
        "dokument": "Poradnik KPRM: Pierwsza ocena w służbie cywilnej (wrzesień 2016)",
        "paragraf_artykul": "Rozdział 4.3, 5.3, 6.5.4 oraz 7 (art. 35 ust. 4, art. 36 ust. 7–8, art. 38 ust. 3 ustawy o SC)",
        "strona": "12, 16, 32–34",
        "text": "Zwolnienie nowego pracownika z obowiązku odbywania służby przygotowawczej przez dyrektora generalnego na podstawie art. 36 ust. 7 ustawy NIE oznacza zwolnienia z egzaminu kończącego służbę przygotowawczą (art. 36 ust. 8). W razie usprawiedliwionej nieobecności trwającej dłużej niż 3 miesiące dyrektor generalny może na wniosek pracownika przedłużyć czas trwania umowy o czas tej nieobecności (art. 35 ust. 4). Wnioski dotyczące rozwoju zawodowego (Część VI) wypełnia się wyłącznie przy pozytywnej pierwszej ocenie; przy negatywnej pierwszej ocenie uzasadnienie jest obowiązkowe.",
    },
    {
        "dokument": "Model kompetencji w służbie cywilnej (KPRM)",
        "paragraf_artykul": "Zasady stosowania wskaźników behawioralnych (14 kompetencji, 49 wskaźników)",
        "strona": "1–3",
        "text": "Dobierz wskaźniki do zadań i zakresu odpowiedzialności na stanowisku. Poziom 'na poziomie oczekiwań' (5 pkt) opisuje standard wykonania w tym zakresie. Oprzyj ocenę na konkretnych przykładach z ocenianego okresu: zapisz sytuację, działanie i jego rezultat (STAR). Uwzględnij powtarzalność zachowania, złożoność sytuacji i dostępne uprawnienia. Brak podstaw do oceny: jeśli brak było okazji do zaobserwowania zachowania, odnotuj brak podstaw do oceny danego wskaźnika (nie wchodzi on do średniej i nie obniża oceny).",
    },
]

_CHROMA_COLLECTION: Any = None
_EMBEDDER: Any = None
_CHROMA_CHECKED: bool = False


def get_mandatory_for_variant(variant: FormVariant) -> list[str]:
    if variant == "pierwsza_ocena":
        return list(MANDATORY_CRITERIA_FIRST_EVAL)
    if variant == "okresowa_A":
        return list(MANDATORY_CRITERIA_FORM_A)
    if variant == "okresowa_B":
        return list(MANDATORY_CRITERIA_FORM_B)
    return list(MANDATORY_CRITERIA_FORM_C)


def compute_deterministic_summary(state: FormSchemaState) -> DeterministicEvalSummary:
    mandatory = get_mandatory_for_variant(state.form_type)
    mandatory_set = set(mandatory)
    is_first = state.form_type == "pierwsza_ocena"

    allowed_scale = sorted(FIRST_EVAL_ALLOWED_SCORES if is_first else PERIODIC_ALLOWED_SCORES)
    allowed_additional_pool = (
        [] if is_first else [c for c in STATUTORY_CRITERIA_CATALOG if c not in mandatory_set]
    )

    validation_errors: list[str] = []
    normalized_additional: list[str] = []
    for raw_add in state.additional_criteria:
        if not raw_add or not raw_add.strip():
            continue
        norm = normalize_criterion_name(raw_add)
        if is_first:
            validation_errors.append("W pierwszej ocenie nie wybiera się kryteriów dodatkowych.")
        elif norm in mandatory_set:
            validation_errors.append(f"Kryterium dodatkowe '{norm}' powiela kryterium obowiązkowe dla {state.form_type}.")
        elif norm not in STATUTORY_CRITERIA_CATALOG:
            validation_errors.append(f"Kryterium '{raw_add}' nie pochodzi z ustawowego wykazu 14 kompetencji.")
        elif norm not in normalized_additional:
            normalized_additional.append(norm)

    if not is_first and len(normalized_additional) > MAX_ADDITIONAL_CRITERIA_PERIODIC:
        validation_errors.append(
            f"Wybrano {len(normalized_additional)} kryteria dodatkowe – limit wynosi maks. {MAX_ADDITIONAL_CRITERIA_PERIODIC}."
        )
        normalized_additional = normalized_additional[:MAX_ADDITIONAL_CRITERIA_PERIODIC]

    active_criteria = [*mandatory, *normalized_additional]
    normalized_scores: dict[str, int] = {}
    for k, v in state.scores.items():
        if v is None:
            continue
        norm_k = normalize_criterion_name(k)
        if v not in allowed_scale:
            validation_errors.append(f"Ocena {v} pkt dla '{norm_k}' jest spoza dozwolonej skali {allowed_scale}.")
        normalized_scores[norm_k] = v

    scored_values = [normalized_scores[c] for c in active_criteria if c in normalized_scores]
    missing_mandatory = [c for c in mandatory if c not in normalized_scores]
    low_scored = [c for c in active_criteria if normalized_scores.get(c, 5) <= 3]

    if not scored_values:
        return DeterministicEvalSummary(
            form_type=state.form_type,
            mandatory_criteria=mandatory,
            allowed_additional_pool=allowed_additional_pool,
            allowed_scale=allowed_scale,
            average=None,
            overall_level=None,
            verdict="NIEKOMPLETNA",
            verdict_reasons=["Brak wystawionych ocen cząstkowych."],
            low_scored_criteria=[],
            justification_mandatory=False,
            dev_plan_allowed=True,
            next_rank_eligible=False,
            validation_errors=validation_errors,
        )

    raw_avg = sum(Decimal(s) for s in scored_values) / Decimal(len(scored_values))
    avg_float = round_half_up(raw_avg, 2)
    reasons: list[str] = []

    if is_first:
        overall_level = None
        ones = [c for c in active_criteria if normalized_scores.get(c) == 1]
        threes = [c for c in active_criteria if normalized_scores.get(c) == 3]
        exam_ok = state.egzamin_sluzba_przygotowawcza in ("TAK", "NIE_DOTYCZY")
        report_ok = state.sprawozdanie_w_terminie is True
        avg_ok = raw_avg >= Decimal("5.0")
        threes_ok = len(threes) <= 1 and len(ones) == 0

        if missing_mandatory or state.egzamin_sluzba_przygotowawcza is None or state.sprawozdanie_w_terminie is None:
            if not exam_ok and state.egzamin_sluzba_przygotowawcza == "NIE":
                verdict = "NEGATYWNA"
                reasons.append("Niezaliczony egzamin ze służby przygotowawczej (§ 10 ust. 1 pkt 1).")
            elif state.sprawozdanie_w_terminie is False:
                verdict = "NEGATYWNA"
                reasons.append("Sprawozdanie nie zostało złożone w wyznaczonym terminie (§ 10 ust. 1 pkt 2).")
            elif not threes_ok:
                verdict = "NEGATYWNA"
                reasons.append(f"Uzyskano więcej niż jedną ocenę 3 pkt ({', '.join(threes)}).")
            else:
                verdict = "NIEKOMPLETNA"
                reasons.append("Uzupełnij wszystkie 5 elementów, status egzaminu oraz terminowość sprawozdania.")
        elif exam_ok and report_ok and threes_ok and avg_ok:
            verdict = "POZYTYWNA"
            reasons.append(
                f"Spełniono 4 warunki ustawowe: średnia {avg_float:.2f} >= 5,00, maks. jedna ocena 3 pkt, egzamin i sprawozdanie zaliczone."
            )
        else:
            verdict = "NEGATYWNA"
            if not exam_ok:
                reasons.append("Niezaliczony egzamin ze służby przygotowawczej (§ 10 ust. 1 pkt 1).")
            if not report_ok:
                reasons.append("Niezłożenie sprawozdania w wyznaczonym terminie (§ 10 ust. 1 pkt 2).")
            if not threes_ok:
                reasons.append(f"Więcej niż jedna ocena cząstkowa 3 pkt: {', '.join(threes)} (§ 10 ust. 1 pkt 3).")
            if not avg_ok:
                reasons.append(f"Średnia łączna {avg_float:.2f} pkt poniżej wymaganego progu 5,00 pkt (§ 10 ust. 1 pkt 4).")

        just_mandatory = verdict == "NEGATYWNA"
        dev_allowed = verdict != "NEGATYWNA"
        next_rank = False
    else:
        overall_level = determine_periodic_overall_level(raw_avg) or determine_periodic_overall_level(
            Decimal(f"{avg_float:.2f}")
        )
        ones = [c for c in active_criteria if normalized_scores.get(c) == 1]
        if ones or raw_avg <= Decimal("4.0"):
            verdict = "NEGATYWNA"
            if ones:
                reasons.append(
                    f"Wystąpiła ocena cząstkowa 1 pkt ('znacznie poniżej oczekiwań') w: {', '.join(ones)} (§ 11 ust. 1 pkt 4)."
                )
            if raw_avg <= Decimal("4.0"):
                reasons.append(f"Średnia arytmetyczna {avg_float:.2f} pkt nie przekracza progu 4,00 pkt (poziom: {overall_level}).")
        elif missing_mandatory:
            verdict = "NIEKOMPLETNA"
            reasons.append(f"Brak ocen dla kryteriów obowiązkowych: {', '.join(missing_mandatory)}.")
        else:
            verdict = "POZYTYWNA"
            reasons.append(f"Średnia {avg_float:.2f} pkt (> 4,00 pkt, poziom '{overall_level}') oraz brak ocen cząstkowych 1 pkt.")

        just_mandatory = verdict == "NEGATYWNA"
        dev_allowed = True
        next_rank = verdict == "POZYTYWNA" and state.employee_context.status_sluzby == "URZEDNIK_SC"

    return DeterministicEvalSummary(
        form_type=state.form_type,
        mandatory_criteria=mandatory,
        allowed_additional_pool=allowed_additional_pool,
        allowed_scale=allowed_scale,
        average=avg_float,
        overall_level=overall_level,
        verdict=verdict,
        verdict_reasons=reasons,
        low_scored_criteria=low_scored,
        justification_mandatory=just_mandatory,
        dev_plan_allowed=dev_allowed,
        next_rank_eligible=next_rank,
        validation_errors=validation_errors,
    )


def _extract_meaningful_tokens(text: str) -> list[str]:
    words = re.findall(r"[a-ząćęłńóśźż0-9]{4,}", text.casefold())
    return [w for w in words if w not in POLISH_STOPWORDS]


def _char_ngrams(tokens: list[str], n: int = 4) -> Counter[str]:
    joined = " ".join(tokens)
    if len(joined) < n:
        return Counter([joined]) if joined else Counter()
    return Counter(joined[i : i + n] for i in range(len(joined) - n + 1))


def _cosine_counter(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    common = set(a.keys()) & set(b.keys())
    dot = sum(a[k] * b[k] for k in common)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def _try_get_chroma() -> tuple[Any, Any]:
    global _CHROMA_COLLECTION, _EMBEDDER, _CHROMA_CHECKED
    if _CHROMA_CHECKED:
        return _CHROMA_COLLECTION, _EMBEDDER
    _CHROMA_CHECKED = True
    if not CHROMA_DIR.is_dir():
        return None, None
    try:
        import chromadb
        from sentence_transformers import SentenceTransformer

        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        col = client.get_collection(CHROMA_COLLECTION_NAME)
        if col.count() > 0:
            _CHROMA_COLLECTION = col
            _EMBEDDER = SentenceTransformer(EMBEDDING_MODEL_NAME)
    except Exception:
        _CHROMA_COLLECTION, _EMBEDDER = None, None
    return _CHROMA_COLLECTION, _EMBEDDER


def retrieve_legal_sources(query: str, top_k: int = 3) -> list[RagSourceCitation]:
    """
    Rygorystyczne wyszukiwanie RAG bez halucynacji:
    1) Odrzuca zapytania pozbawione pojęć z obszaru oceniania / służby cywilnej (np. 'przepis na sernik'),
    2) Wymaga pokrycia konkretnych pojęć z zapytania w treści dokumentu źródłowego.
    """
    q_tokens = _extract_meaningful_tokens(query)
    if not q_tokens:
        return []

    # Warunek 1: Zapytanie musi dotyczyć domeny ocen pracowniczych / służby cywilnej
    has_domain_anchor = any(
        tok.startswith(anchor) for tok in q_tokens for anchor in DOMAIN_ANCHOR_STEMS
    )
    if not has_domain_anchor:
        return []

    q_stems = {t[:5] for t in q_tokens}
    specific_q_stems = {s for s in q_stems if s not in GENERIC_DOMAIN_STEMS} or q_stems

    # Ścieżka A: ChromaDB + sdadas/mmlw-retrieval-roberta-base (jeśli zaindeksowano)
    col, embedder = _try_get_chroma()
    if col is not None and embedder is not None:
        q_vec = embedder.encode([f"query: {query}"], normalize_embeddings=True).tolist()
        res = col.query(query_embeddings=q_vec, n_results=top_k, include=["documents", "metadatas", "distances"])
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        citations: list[RagSourceCitation] = []
        for doc_txt, meta, dist in zip(docs, metas, dists):
            doc_stems = {w[:5] for w in _extract_meaningful_tokens(str(doc_txt))}
            if dist <= MAX_CHROMA_COSINE_DISTANCE and (specific_q_stems & doc_stems):
                citations.append(
                    RagSourceCitation(
                        dokument=str(meta.get("dokument", "Akt prawny SC")),
                        paragraf_artykul=str(meta.get("paragraf_artykul", "Przepisy ogólne")),
                        strona=str(meta.get("strona", "1")),
                        excerpt=str(doc_txt)[:280].strip(),
                    )
                )
        if citations:
            return citations

    # Ścieżka B: Indeks kosinusowy + pokrycie rdzeni pojęciowych na korpusie KPRM i Dziennika Ustaw
    corpus = list(CURATED_LEGAL_CORPUS)
    if CHUNKS_JSON_PATH.is_file():
        try:
            loaded = json.loads(CHUNKS_JSON_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, list):
                corpus.extend(loaded[:250])
        except Exception:
            pass

    q_ngrams = _char_ngrams(q_tokens, 4)
    scored: list[tuple[float, dict[str, Any]]] = []

    for item in corpus:
        doc_tokens = _extract_meaningful_tokens(f"{item.get('paragraf_artykul', '')} {item.get('text', '')}")
        doc_stems = {w[:5] for w in doc_tokens}

        # Warunek 2: Konkretne pojęcia z pytania muszą faktycznie występować w danym fragmencie PDF!
        matched_specific = specific_q_stems & doc_stems
        if not matched_specific:
            continue

        specific_coverage = len(matched_specific) / max(len(specific_q_stems), 1)
        if len(specific_q_stems) >= 2 and specific_coverage < 0.34:
            continue

        ngram_sim = _cosine_counter(q_ngrams, _char_ngrams(doc_tokens, 4))
        combined = 0.40 * ngram_sim + 0.60 * specific_coverage
        if combined >= MIN_COMBINED_RAG_SCORE:
            scored.append((combined, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    results: list[RagSourceCitation] = []
    seen_excerpts: set[str] = set()
    for _sc, item in scored:
        ex = str(item["text"])[:270].strip()
        if ex in seen_excerpts:
            continue
        seen_excerpts.add(ex)
        results.append(
            RagSourceCitation(
                dokument=str(item["dokument"]),
                paragraf_artykul=str(item["paragraf_artykul"]),
                strona=str(item["strona"]),
                excerpt=ex,
            )
        )
        if len(results) >= top_k:
            break

    return results


_AUTOFILL_VERBS_RE = re.compile(
    r"\b(?:wpisz|uzupełnij|ustaw|zaproponuj\s+kryteri|wypełnij|zmień\s+ocen|dodaj\s+notatk|zapisz\s+w\s+formularz|dobierz\s+kryteri)\b",
    flags=re.IGNORECASE,
)


def _detect_autofill_intent(message: str, form_state: FormSchemaState | None) -> bool:
    if form_state is None or not form_state.fields:
        return False
    return bool(_AUTOFILL_VERBS_RE.search(message))


def _build_deterministic_patches(
    message: str, form_state: FormSchemaState, summary: DeterministicEvalSummary
) -> list[FormPatch]:
    patches: list[FormPatch] = []
    msg_low = message.casefold()
    fields_by_id = {f.field_id: f for f in form_state.fields}

    for f in form_state.fields:
        if f.field_type == "score":
            label_low = f.label.casefold()
            if any(tok in msg_low for tok in label_low.split()[:2] if len(tok) >= 4):
                m_score = re.search(r"\b([13579])\b", message)
                if m_score:
                    val = int(m_score.group(1))
                    if val in summary.allowed_scale:
                        patches.append(
                            FormPatch(
                                field_id=f.field_id,
                                suggested_value=val,
                                rationale=f"Propozycja oceny {val} pkt w skali {summary.allowed_scale} na podstawie polecenia przełożonego.",
                                requires_approval=True,
                            )
                        )

    if ("kryteri" in msg_low or "opis" in msg_low or "osp" in msg_low) and summary.allowed_additional_pool:
        combined_text = f"{message} {form_state.employee_context.opis_zadan_osp}".casefold()
        kw_map = [
            ("Myślenie analityczne", ("analiz", "opini", "praw", "orzecznictw", "ocen")),
            ("Radzenie sobie w sytuacjach kryzysowych", ("kryzys", "incydent", "cyber", "zagrożen", "awari")),
            ("Negocjowanie", ("negocj", "uzgodnien", "grup roboczych", "kompromis")),
            ("Wystąpienia publiczne", ("prezentacj", "konferencj", "reprezentowan", "spotkani")),
            ("Orientacja na klienta/interesanta", ("interesant", "obywatel", "skarg", "klient")),
            ("Kreatywność", ("innowac", "nowych rozwiązań", "usprawnien")),
        ]
        chosen: list[str] = []
        for cname, kws in kw_map:
            if cname in summary.allowed_additional_pool and any(k in combined_text for k in kws):
                chosen.append(cname)
        for fallback_c in summary.allowed_additional_pool:
            if len(chosen) >= 3:
                break
            if fallback_c not in chosen:
                chosen.append(fallback_c)

        if "additional_criteria" in fields_by_id:
            patches.append(
                FormPatch(
                    field_id="additional_criteria",
                    suggested_value=chosen[:3],
                    rationale=f"Dobrano maks. 3 kryteria dodatkowe spoza kryteriów obowiązkowych arkusza ({form_state.form_type}).",
                    requires_approval=True,
                )
            )

    if any(w in msg_low for w in ("notatk", "projekt", "opóźnien", "sytuacj", "termin", "skarg")):
        clean_note, _ = sanitize_pii(message)
        for target_id in ("star_observation", "uzasadnienie", "notatki_star"):
            if target_id in fields_by_id:
                existing = str(fields_by_id[target_id].current_value or "").strip()
                formatted_star = (
                    f"Sytuacja/Działanie/Rezultat: {clean_note}"
                    if not existing
                    else f"{existing}\n• {clean_note}"
                )
                patches.append(
                    FormPatch(
                        field_id=target_id,
                        suggested_value=formatted_star,
                        rationale="Ustrukturyzowano obserwację przełożonego do pola notatek behawioralnych STAR.",
                        requires_approval=True,
                    )
                )
                break

    return patches


async def process_formal_chat(req: FormalChatRequest) -> FormalChatResponse:
    clean_msg, pii_msg = sanitize_pii(req.message)
    det_summary = compute_deterministic_summary(req.form_state) if req.form_state else None

    if req.form_state and _detect_autofill_intent(clean_msg, req.form_state):
        det_patches = _build_deterministic_patches(clean_msg, req.form_state, det_summary)  # type: ignore[arg-type]
        compact_fields = [
            {"field_id": f.field_id, "label": f.label, "type": f.field_type, "options": f.options}
            for f in req.form_state.fields
        ]
        schema = {
            "type": "OBJECT",
            "properties": {
                "answer": {"type": "STRING"},
                "patches": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "field_id": {"type": "STRING"},
                            "suggested_value_str": {"type": "STRING"},
                            "rationale": {"type": "STRING"},
                        },
                        "required": ["field_id", "suggested_value_str", "rationale"],
                    },
                },
            },
            "required": ["answer", "patches"],
        }
        sys_prompt = (
            "Jesteś Asystentem Formalnym Służby Cywilnej w trybie wypełniania formularza. "
            f"Aktywny arkusz: {req.form_state.form_type}. Dozwolona skala ocen: {det_summary.allowed_scale if det_summary else []}. "
            f"Dozwolona pula kryteriów dodatkowych (maks. 3, bez obowiązkowych): {det_summary.allowed_additional_pool if det_summary else []}. "
            "Zmapuj polecenie użytkownika wyłącznie na podane `field_id`."
        )
        llm_input = json.dumps({"polecenie": clean_msg, "pola_formularza": compact_fields}, ensure_ascii=False)
        parsed, provider = await call_structured_llm(sys_prompt, llm_input, schema, temperature=0.1)

        final_patches = list(det_patches)
        valid_ids = {f.field_id: f for f in req.form_state.fields}
        if parsed and parsed.get("patches"):
            llm_patches: list[FormPatch] = []
            for p in parsed["patches"]:
                fid = p.get("field_id", "")
                if fid not in valid_ids:
                    continue
                f_spec = valid_ids[fid]
                raw_val: Any = p.get("suggested_value_str", "")
                if f_spec.field_type == "score":
                    try:
                        iv = int(str(raw_val).strip())
                        if det_summary and iv not in det_summary.allowed_scale:
                            continue
                        raw_val = iv
                    except ValueError:
                        continue
                elif f_spec.field_type == "multiselect":
                    items = [normalize_criterion_name(x) for x in str(raw_val).split(",") if x.strip()]
                    if det_summary:
                        items = [x for x in items if x in det_summary.allowed_additional_pool][:3]
                    raw_val = items
                llm_patches.append(
                    FormPatch(
                        field_id=fid,
                        suggested_value=raw_val,
                        rationale=p.get("rationale", "Propozycja AI na podstawie polecenia."),
                        requires_approval=True,
                    )
                )
            if llm_patches:
                final_patches = llm_patches

        answer_txt = (
            parsed["answer"]
            if parsed and parsed.get("answer")
            else f"Przygotowałem {len(final_patches)} propozycję(e) zmian pól formularza do akceptacji przełożonego."
        )
        return FormalChatResponse(
            intent="FORM_AUTOFILL",
            answer=answer_txt,
            refused=False,
            sources=[],
            form_patches=final_patches,
            deterministic_summary=det_summary,
            pii_redacted=pii_msg,
            provider=provider,
        )

    sources = retrieve_legal_sources(clean_msg, top_k=3)
    if not sources:
        return FormalChatResponse(
            intent="QA",
            answer=(
                "Odmawiam udzielenia odpowiedzi: w zaindeksowanych aktach prawnych i poradnikach KPRM "
                "(ustawa o służbie cywilnej, rozporządzenia z 2015 r. i 2016 r., Model kompetencji) "
                "brak podstawy źródłowej dotyczącej zadanego pytania."
            ),
            refused=True,
            sources=[],
            form_patches=[],
            deterministic_summary=det_summary,
            pii_redacted=pii_msg,
            provider="rag_guardrail",
        )

    qa_schema = {
        "type": "OBJECT",
        "properties": {
            "refused": {"type": "BOOLEAN"},
            "answer": {"type": "STRING"},
        },
        "required": ["refused", "answer"],
    }
    sources_block = "\n".join(
        f"[{i+1}] {s.dokument} | {s.paragraf_artykul} | str. {s.strona}: {s.excerpt}"
        for i, s in enumerate(sources)
    )
    history_tail = [{"role": t.role, "content": sanitize_pii(t.content)[0]} for t in req.history[-6:]]
    sys_qa = (
        "Jesteś Asystentem Formalnym Służby Cywilnej. Odpowiadaj WYŁĄCZNIE na podstawie podanych niżej źródeł [1..3]. "
        "Cytuj w treści nazwę aktu/poradnika, paragraf/artykuł oraz stronę. Jeśli źródła nie odpowiadają wprost na pytanie, "
        "ustaw refused=true i odmów odpowiedzi bez zgadywania."
    )
    user_qa = json.dumps(
        {"historia": history_tail, "pytanie": clean_msg, "zrodla_rag": sources_block},
        ensure_ascii=False,
    )
    parsed_qa, provider = await call_structured_llm(sys_qa, user_qa, qa_schema, temperature=0.1)

    if parsed_qa and parsed_qa.get("refused") is True:
        return FormalChatResponse(
            intent="QA",
            answer="W dostępnych dokumentach źródłowych służby cywilnej brak jednoznacznej podstawy do odpowiedzi na to pytanie.",
            refused=True,
            sources=[],
            form_patches=[],
            deterministic_summary=det_summary,
            pii_redacted=pii_msg,
            provider=provider,
        )

    fallback_answer = (
        f"{sources[0].excerpt} "
        f"(Podstawa: {sources[0].dokument}, {sources[0].paragraf_artykul}, str. {sources[0].strona})."
    )
    return FormalChatResponse(
        intent="QA",
        answer=parsed_qa["answer"] if parsed_qa and parsed.get("answer") else fallback_answer,
        refused=False,
        sources=sources,
        form_patches=[],
        deterministic_summary=det_summary,
        pii_redacted=pii_msg,
        provider=provider,
    )
