"""Creates the schema and loads the OpenStreetMap GeoJSON into PostGIS.

    python -m app.seed            # create tables (if needed) and upsert all data
Data © OpenStreetMap contributors (ODbL).
"""
import json
import logging
import os
from pathlib import Path

import psycopg

from .db import connect

log = logging.getLogger(__name__)
API_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("GEOMIND_DATA_DIR", API_DIR.parent / "src" / "data"))
SCHEMA = API_DIR / "sql" / "schema.sql"


def create_schema(conn: psycopg.Connection) -> None:
    conn.execute(SCHEMA.read_text(encoding="utf-8"))


def load(conn: psycopg.Connection) -> dict[str, int]:
    facilities = json.loads((DATA_DIR / "facilities.json").read_text(encoding="utf-8"))["features"]
    rivers = json.loads((DATA_DIR / "rivers.json").read_text(encoding="utf-8"))["features"]
    with conn.transaction():
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO facilities (id, kind, name, geom)
                   VALUES (%s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                   ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, geom = EXCLUDED.geom""",
                [(f["properties"]["id"], f["properties"]["kind"], f["properties"]["name"], json.dumps(f["geometry"])) for f in facilities],
            )
            cur.executemany(
                """INSERT INTO rivers (id, name, geom)
                   VALUES (%s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
                   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom""",
                [(f["properties"]["id"], f["properties"]["name"], json.dumps(f["geometry"])) for f in rivers],
            )
    return {"facilities": len(facilities), "rivers": len(rivers)}


def seed_if_empty() -> None:
    with connect() as conn:
        create_schema(conn)
        if conn.execute("SELECT count(*) AS n FROM facilities").fetchone()["n"] == 0:
            log.info("Seeded %s", load(conn))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with connect() as c:
        create_schema(c)
        print("loaded", load(c))
