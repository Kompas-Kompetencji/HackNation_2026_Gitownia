"""Wybór dostawcy LLM z LLM_API_KEY / LLM_MODEL_NAME i parsowanie odpowiedzi (atrapa HTTP, bez sieci)."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services import llm_client  # noqa: E402
from app.services.rag_service import process_formal_chat  # noqa: E402
from app.schemas.form_contract import FormalChatRequest  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_llm_settings(monkeypatch):
    for name in ("LLM_API_KEY", "LLM_MODEL_NAME", "LLM_MODEL", "LLM_BASE_URL", "LLM_PROVIDER",
                 "GEMINI_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY"):
        monkeypatch.setattr(settings, name, None)


def _patch_http(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(llm_client.httpx, "AsyncClient", factory)


def test_no_key_means_deterministic_mode():
    assert llm_client.get_active_llm_provider() is None
    assert llm_client.llm_status()["configured"] is False
    parsed, provider = asyncio.run(llm_client.call_structured_llm("s", "u", {"type": "OBJECT"}))
    assert parsed is None and provider == "deterministic_local"


def test_provider_detected_from_key_prefix(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "AIzaFAKE")
    monkeypatch.setattr(settings, "LLM_MODEL_NAME", "gemini-test")
    cfg = llm_client.get_active_llm_provider()
    assert cfg is not None and cfg.provider == "gemini" and cfg.model == "gemini-test"
    monkeypatch.setattr(settings, "LLM_API_KEY", "gsk_FAKE")
    assert llm_client.get_active_llm_provider().provider == "groq"
    monkeypatch.setattr(settings, "LLM_API_KEY", "sk-FAKE")
    assert llm_client.get_active_llm_provider().provider == "openai"
    assert "FAKE" not in json.dumps(llm_client.llm_status())


def test_gemini_structured_call(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "AIzaFAKE")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "AIzaFAKE"
        assert "generateContent" in request.url.path
        body = {"candidates": [{"content": {"parts": [{"text": '{"refused": false, "answer": "Maks. 3 kryteria."}'}]}}]}
        return httpx.Response(200, json=body)

    _patch_http(monkeypatch, handler)
    parsed, provider = asyncio.run(llm_client.call_structured_llm("s", "u", {"type": "OBJECT"}))
    assert parsed == {"refused": False, "answer": "Maks. 3 kryteria."}
    assert provider.startswith("gemini:")


def test_openai_compatible_call_and_rag_answer(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "sk-FAKE")

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["response_format"] == {"type": "json_object"}
        content = '```json\n{"refused": false, "answer": "Nie więcej niż 3 kryteria dodatkowe (§ 5 rozporządzenia)."}\n```'
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    _patch_http(monkeypatch, handler)
    res = asyncio.run(process_formal_chat(FormalChatRequest(message="Ile kryteriów dodatkowych można wybrać w ocenie okresowej?")))
    assert res.refused is False
    assert res.answer.startswith("Nie więcej niż 3")
    assert res.sources, "odpowiedź musi wskazywać źródła RAG"


def test_llm_error_falls_back_to_sources(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "sk-FAKE")
    _patch_http(monkeypatch, lambda request: httpx.Response(429, json={"error": "rate limit"}))
    res = asyncio.run(process_formal_chat(FormalChatRequest(message="Ile kryteriów dodatkowych można wybrać w ocenie okresowej?")))
    assert res.refused is False and res.sources
    assert res.provider == "deterministic_local"


def test_off_topic_question_is_refused_without_calling_llm(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "sk-FAKE")

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - nie powinno być wywołane
        raise AssertionError("LLM nie powinien być wywołany bez źródeł")

    _patch_http(monkeypatch, handler)
    res = asyncio.run(process_formal_chat(FormalChatRequest(message="Jaki jest przepis na sernik?")))
    assert res.refused is True and not res.sources


def test_new_google_key_format_and_fallback_chain(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "AQ.FAKE")
    monkeypatch.setattr(settings, "LLM_MODEL_NAME", "gemini-slow")
    llm_client._COOLDOWN.clear()
    cfg = llm_client.get_active_llm_provider()
    assert cfg.provider == "gemini" and cfg.fallbacks and "gemini-slow" not in cfg.fallbacks
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        model = request.url.path.split("/models/")[1].split(":")[0]
        calls.append(model)
        if model == "gemini-slow":
            return httpx.Response(503, json={"error": {"message": "high demand"}})
        body = {"candidates": [{"content": {"parts": [{"text": '{"refused": false, "answer": "ok"}'}]}}]}
        return httpx.Response(200, json=body)

    _patch_http(monkeypatch, handler)
    parsed, provider = asyncio.run(llm_client.call_structured_llm("s", "u", {"type": "OBJECT"}))
    assert parsed == {"refused": False, "answer": "ok"}
    assert calls[0] == "gemini-slow" and provider == f"gemini:{calls[1]}"
    # przeciążony model jest chwilowo pomijany – kolejne pytanie idzie od razu do zapasowego
    calls.clear()
    asyncio.run(llm_client.call_structured_llm("s", "u", {"type": "OBJECT"}))
    assert calls and calls[0] != "gemini-slow"
    llm_client._COOLDOWN.clear()


def test_placeholder_values_mean_no_llm(monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "placeholder")
    monkeypatch.setattr(settings, "LLM_MODEL_NAME", "placeholder")
    assert llm_client.get_active_llm_provider() is None


def test_hedged_request_returns_faster_fallback(monkeypatch):
    """Wolny model główny: po LLM_HEDGE_SECONDS startuje zapasowy i jego odpowiedź wygrywa."""
    import asyncio
    import time

    monkeypatch.setattr(settings, "LLM_API_KEY", "AIzaFAKE")
    monkeypatch.setattr(settings, "LLM_MODEL_NAME", "wolny-model")
    monkeypatch.setattr(settings, "LLM_FALLBACK_MODELS", "szybki-model")
    monkeypatch.setattr(settings, "LLM_HEDGE_SECONDS", 0.2)
    llm_client._COOLDOWN.clear()

    async def fake_call(client, cfg, model, *args):
        await asyncio.sleep(5 if model == "wolny-model" else 0.05)
        return '{"odp": "%s"}' % model

    monkeypatch.setattr(llm_client, "_call_once", fake_call)
    start = time.monotonic()
    parsed, label = asyncio.run(llm_client.call_structured_llm("s", "u", {"type": "OBJECT"}))
    assert parsed == {"odp": "szybki-model"} and label.endswith("szybki-model")
    assert time.monotonic() - start < 2
    assert "wolny-model" not in llm_client._COOLDOWN  # wolny, ale nie zepsuty – bez kary
