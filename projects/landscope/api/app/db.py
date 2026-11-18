"""Database access. One short-lived connection per request (works well with Neon's pooled endpoint)."""
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from .config import settings


class DatabaseUnavailable(RuntimeError):
    pass


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    if not settings.database_url:
        raise DatabaseUnavailable("DATABASE_URL is not set")
    try:
        conn = psycopg.connect(settings.database_url, row_factory=dict_row, connect_timeout=10, autocommit=True)
    except psycopg.OperationalError as e:  # network / auth problems
        raise DatabaseUnavailable(str(e)) from e
    try:
        yield conn
    finally:
        conn.close()
