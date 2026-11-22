"""
Repozytorium na bazie Postgres (Supabase) przez bezpośrednie połączenie `DATABASE_URL`.

Hosting (Azure Container Apps) dostarcza tylko `DATABASE_URL`, bez klucza REST Supabase, dlatego
ta klasa dziedziczy całe mapowanie wierszy z `SupabaseRepository` (te same tabele i kolumny
co w eksporcie bazy: users, employees, evaluations, evaluation_criteria + tabele z
`migrations/001_schema_additions.sql`) i podmienia jedynie warstwę transportu: zamiast PostgREST
wykonuje równoważne zapytania SQL przez psycopg 3.

Obsługiwany podzbiór filtrów PostgREST (dokładnie ten, którego używa SupabaseRepository):
`eq.X`, `in.(a,b)`, `not.in.(a,b)`, `order=kolumna.asc|desc`, `limit=N`, `on_conflict=a,b`.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from app.data.supabase_repo import SupabaseError, SupabaseRepository

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_IDENT_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
_TABLES = frozenset(
    {
        "users",
        "employees",
        "evaluations",
        "evaluation_criteria",
        "evaluation_indicator_answers",
        "employee_notes",
        "job_descriptions",
    }
)


def _ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise SupabaseError(f"Niedozwolona nazwa kolumny/tabeli: {name!r}")
    return f'"{name}"'


def _scalar(raw: str) -> Any:
    raw = raw.strip()
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    return raw


def _list(raw: str) -> list[Any]:
    inner = raw.strip()
    if inner.startswith("(") and inner.endswith(")"):
        inner = inner[1:-1]
    return [_scalar(x) for x in inner.split(",") if x.strip()]


def normalize_dsn(url: str) -> str:
    """Akceptuje także zapis SQLAlchemy (postgresql+psycopg://, postgres://)."""
    url = url.strip().strip("'\"")
    url = re.sub(r"^postgres(ql)?\+[a-z0-9]+://", "postgresql://", url)
    return re.sub(r"^postgres://", "postgresql://", url)


class PostgresRepository(SupabaseRepository):
    def __init__(self, dsn: str, auto_migrate: bool = True, timeout: float = 15.0) -> None:  # noqa: D107
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        self._pool = ConnectionPool(
            normalize_dsn(dsn),
            min_size=1,
            max_size=10,
            timeout=timeout,
            # Pooler Supabase zamyka bezczynne połączenia: wymieniamy je, zanim zrobi to serwer.
            max_idle=60,
            max_lifetime=900,
            reconnect_timeout=60,
            open=True,
            kwargs={
                "row_factory": dict_row,
                # prepare_threshold=None: zgodność z pulą Supabase (Supavisor/pgbouncer, tryb transakcyjny)
                "prepare_threshold": None,
                # autocommit: pojedyncze zapytanie = 1 podróż do bazy (bez osobnego COMMIT)
                "autocommit": True,
                "connect_timeout": int(timeout),
                "application_name": "kompas-kompetencji",
                # utrzymanie połączenia TCP przez NAT/Load Balancer (Azure ↔ Supabase)
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 3,
            },
        )
        if auto_migrate:
            self.migrate()

    # --- migracje (tylko dodające, idempotentne) ------------------------------------------

    def migrate(self) -> None:
        for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            sql = sql_file.read_text(encoding="utf-8")
            try:
                with self._pool.connection() as conn, conn.transaction():
                    conn.execute(sql)  # type: ignore[arg-type]
            except Exception as exc:
                raise SupabaseError(f"Postgres (migracja {sql_file.name}): {exc}") from exc
            logger.info("Migracja %s zastosowana (idempotentna).", sql_file.name)

    def ping(self) -> bool:
        with self._pool.connection() as conn:
            conn.execute("select 1")
        return True

    # --- tłumaczenie PostgREST → SQL --------------------------------------------------------

    @staticmethod
    def _where(params: dict[str, str]) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        values: list[Any] = []
        for col, expr in params.items():
            if col in {"select", "order", "limit", "on_conflict"}:
                continue
            column = _ident(col)
            if expr.startswith("eq."):
                clauses.append(f"{column} = %s")
                values.append(_scalar(expr[3:]))
            elif expr.startswith("in."):
                clauses.append(f"{column} = any(%s)")
                values.append(_list(expr[3:]))
            elif expr.startswith("not.in."):
                clauses.append(f"not ({column} = any(%s))")
                values.append(_list(expr[7:]))
            else:
                raise SupabaseError(f"Nieobsługiwany filtr {col}={expr}")
        return (" where " + " and ".join(clauses)) if clauses else "", values

    @staticmethod
    def _adapt(value: Any) -> Any:
        from psycopg.types.json import Jsonb

        return Jsonb(value) if isinstance(value, (dict, list)) else value

    def _request(  # type: ignore[override]
        self,
        method: str,
        table: str,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> list[dict[str, Any]]:
        if table not in _TABLES:
            raise SupabaseError(f"Nieznana tabela: {table}")
        params = dict(params or {})
        tbl = f"public.{_ident(table)}"
        returning = " returning *" if prefer is None or "return=representation" in prefer else ""

        if method == "GET":
            where, values = self._where(params)
            sql = f"select * from {tbl}{where}"
            if "order" in params:
                col, _, direction = params["order"].partition(".")
                sql += f" order by {_ident(col)} {'desc' if direction == 'desc' else 'asc'}"
            if "limit" in params:
                sql += " limit %s"
                values.append(int(params["limit"]))
            return self._fetch(sql, values)

        if method == "POST":
            rows = json if isinstance(json, list) else [json]
            if not rows:
                return []
            cols = list(rows[0].keys())
            sql = (
                f"insert into {tbl} ({', '.join(_ident(c) for c in cols)}) "
                f"values ({', '.join(['%s'] * len(cols))})"
            )
            if "on_conflict" in params:
                keys = [k.strip() for k in params["on_conflict"].split(",")]
                updates = [c for c in cols if c not in keys]
                sql += f" on conflict ({', '.join(_ident(k) for k in keys)}) "
                sql += (
                    "do update set " + ", ".join(f"{_ident(c)} = excluded.{_ident(c)}" for c in updates)
                    if updates
                    else "do nothing"
                )
            values = [[self._adapt(row.get(c)) for c in cols] for row in rows]
            if len(values) == 1:
                return self._fetch(sql + returning, values[0], expect_rows=bool(returning))
            return self._fetch_many(sql + returning, values, expect_rows=bool(returning))

        if method == "PATCH":
            row = dict(json or {})
            if not row:
                return self._request("GET", table, params=params)
            where, values = self._where(params)
            sets = ", ".join(f"{_ident(c)} = %s" for c in row)
            sql = f"update {tbl} set {sets}{where}{returning}"
            return self._fetch(sql, [self._adapt(v) for v in row.values()] + values, expect_rows=bool(returning))

        if method == "DELETE":
            where, values = self._where(params)
            if not where:
                raise SupabaseError("DELETE bez filtra jest zablokowany.")
            self._fetch(f"delete from {tbl}{where}", values, expect_rows=False)
            return []

        raise SupabaseError(f"Nieobsługiwana metoda {method}")

    def _fetch(self, sql: str, values: list[Any], expect_rows: bool = True) -> list[dict[str, Any]]:
        import psycopg

        is_read = sql.lstrip().lower().startswith("select")
        for attempt in (1, 2):
            try:
                with self._pool.connection() as conn:
                    cur = conn.execute(sql, values)  # type: ignore[arg-type]
                    return list(cur.fetchall()) if expect_rows and cur.description else []
            except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
                # połączenie zerwane przez pooler/sieć: odczyt można bezpiecznie powtórzyć na nowym połączeniu
                if attempt == 1:
                    # usuń z puli wszystkie martwe połączenia (pooler zwykle zamyka kilka naraz)
                    try:
                        self._pool.check()
                    except Exception:  # noqa: BLE001
                        pass
                    if is_read:
                        logger.warning("Postgres: zerwane połączenie (%s) – ponawiam odczyt.", exc)
                        continue
                raise SupabaseError(f"Postgres: {exc}") from exc
            except Exception as exc:  # błędy SQL i puli (PoolTimeout)
                raise SupabaseError(f"Postgres: {exc}") from exc
        raise SupabaseError("Postgres: nie udało się wykonać zapytania")

    def _fetch_many(self, sql: str, rows: list[list[Any]], expect_rows: bool) -> list[dict[str, Any]]:
        """Wiele wierszy w jednej transakcji (pipeline psycopg) zamiast osobnych podróży do bazy."""
        try:
            with self._pool.connection() as conn, conn.transaction():
                with conn.cursor() as cur:
                    cur.executemany(sql, rows, returning=expect_rows)  # type: ignore[arg-type]
                    out: list[dict[str, Any]] = []
                    if expect_rows:
                        while True:
                            if cur.description:
                                out.extend(cur.fetchall())
                            if not cur.nextset():
                                break
                    return out
        except Exception as exc:
            raise SupabaseError(f"Postgres: {exc}") from exc
