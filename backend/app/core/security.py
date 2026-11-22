"""
Tokeny dostępu (JWT, HS256) podpisywane sekretem `JWT_SECRET`.

Prototyp loguje kontem demonstracyjnym (wybór konta bez hasła), ale każde zapytanie do danych
wymaga podpisanego, wygasającego tokenu – tak samo jak po wpięciu docelowego dostawcy tożsamości
(np. Azure AD / Entra ID, SSO urzędu). Wymiana logowania demonstracyjnego na SSO nie zmienia
reszty API: zmienia się tylko miejsce wydania tokenu.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger("kompas.security")

_ALG = "HS256"
_EPHEMERAL_SECRET = secrets.token_urlsafe(48)
_warned = False


def _secret() -> bytes:
    global _warned
    value = (settings.JWT_SECRET or "").strip()
    if len(value) >= 16:
        return value.encode()
    if not _warned:
        logger.warning("JWT_SECRET nie ustawiony (lub krótszy niż 16 znaków) – używam losowego sekretu procesu.")
        _warned = True
    return _EPHEMERAL_SECRET.encode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class TokenError(ValueError):
    pass


def create_access_token(user_id: str, role: str, ttl_minutes: int | None = None) -> tuple[str, int]:
    ttl = int((ttl_minutes or settings.AUTH_TOKEN_TTL_MINUTES) * 60)
    now = int(time.time())
    header = {"alg": _ALG, "typ": "JWT"}
    payload: dict[str, Any] = {"sub": str(user_id), "role": role, "iat": now, "exp": now + ttl, "iss": "kompas-kompetencji"}
    signing_input = f"{_b64(json.dumps(header, separators=(',', ':')).encode())}.{_b64(json.dumps(payload, separators=(',', ':')).encode())}"
    signature = hmac.new(_secret(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64(signature)}", ttl


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        header = json.loads(_unb64(header_b64))
        payload = json.loads(_unb64(payload_b64))
        signature = _unb64(signature_b64)
    except Exception as exc:  # zły format
        raise TokenError("Nieprawidłowy token.") from exc
    if header.get("alg") != _ALG:
        raise TokenError("Nieobsługiwany algorytm tokenu.")
    expected = hmac.new(_secret(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, signature):
        raise TokenError("Nieprawidłowy podpis tokenu.")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise TokenError("Sesja wygasła – zaloguj się ponownie.")
    if not payload.get("sub"):
        raise TokenError("Token bez użytkownika.")
    return payload
