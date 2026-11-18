"""Creates the schema, loads the OpenStreetMap GeoJSON and measures every site in PostGIS.

    python -m app.seed
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
DATA_DIR = Path(os.getenv("LANDSCOPE_DATA_DIR", API_DIR.parent / "src" / "data"))


def create_schema(conn: psycopg.Connection) -> None:
    conn.execute((API_DIR / "sql" / "schema.sql").read_text(encoding="utf-8"))


def refresh_metrics(conn: psycopg.Connection) -> None:
    conn.execute((API_DIR / "sql" / "metrics.sql").read_text(encoding="utf-8"))


def _features(name: str) -> list[dict]:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))["features"]


def load(conn: psycopg.Connection) -> dict[str, int]:
    sites, roads, services = _features("sites.json"), _features("roads.json"), _features("services.json")
    geo = "ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)"
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            f"""INSERT INTO ls_sites (id, landuse, name, geom) VALUES (%s, %s, %s, {geo})
                ON CONFLICT (id) DO UPDATE SET landuse = EXCLUDED.landuse, name = EXCLUDED.name, geom = EXCLUDED.geom""",
            [(f["properties"]["id"], f["properties"]["landuse"], f["properties"]["name"], json.dumps(f["geometry"])) for f in sites],
        )
        cur.executemany(
            f"""INSERT INTO ls_roads (id, highway, ref, name, geom) VALUES (%s, %s, %s, %s, {geo})
                ON CONFLICT (id) DO UPDATE SET highway = EXCLUDED.highway, ref = EXCLUDED.ref, name = EXCLUDED.name, geom = EXCLUDED.geom""",
            [(f["properties"]["id"], f["properties"]["highway"], f["properties"]["ref"], f["properties"]["name"], json.dumps(f["geometry"])) for f in roads],
        )
        cur.executemany(
            f"""INSERT INTO ls_services (id, kind, name, geom) VALUES (%s, %s, %s, {geo})
                ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, geom = EXCLUDED.geom""",
            [(f["properties"]["id"], f["properties"]["kind"], f["properties"]["name"], json.dumps(f["geometry"])) for f in services],
        )
    refresh_metrics(conn)
    return {"sites": len(sites), "roads": len(roads), "services": len(services)}


def seed_if_empty() -> None:
    with connect() as conn:
        create_schema(conn)
        if conn.execute("SELECT count(*) AS n FROM ls_sites").fetchone()["n"] == 0:
            log.info("Seeded %s", load(conn))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with connect() as c:
        create_schema(c)
        print("loaded", load(c))
