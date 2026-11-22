"""Zależność „wymagany zalogowany użytkownik” dla tras spoza routera danych (asystent AI, PDF, OSP)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header

from app.data.factory import get_data_service
from app.data.schemas import User
from app.data.service import DataService


def require_user(
    service: Annotated[DataService, Depends(get_data_service)],
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> User:
    from app.routers.data_router import current_user

    return current_user(service, authorization, x_user_id)
