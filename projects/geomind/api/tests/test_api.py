"""HTTP-level tests. Validation tests always run; database tests need DATABASE_URL (PostGIS)."""
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
needs_db = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs a PostGIS DATABASE_URL")
KC = {"lon": -94.5833, "lat": 39.0997}


def test_health_always_responds():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] in {"ok", "degraded"}


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/query/within", {"kind": "school", "radius_m": 1000, "lon": 2.35, "lat": 48.85}),  # Paris: outside study area
        ("/api/query/within", {"kind": "casino", "radius_m": 1000, **KC}),  # unknown kind
        ("/api/query/within", {"kind": "school", "radius_m": -5, **KC}),  # negative radius
        ("/api/query/nearest", {"kind": "school", "limit": 500, **KC}),  # limit too high
        ("/api/assistant", {"question": "", **KC}),  # empty question
    ],
)
def test_rejects_invalid_input(path, body):
    assert client.post(path, json=body).status_code == 422


@pytest.fixture(scope="module")
def seeded():
    from app.db import connect
    from app.seed import create_schema, load

    with connect() as conn:
        create_schema(conn)
        return load(conn)


@needs_db
def test_health_reports_postgis(seeded):
    body = client.get("/api/health").json()
    assert body["database"] == "ok"
    assert body["postgis"].startswith("3.")
    assert sum(body["facilities"].values()) == seeded["facilities"]


@needs_db
def test_facilities_geojson(seeded):
    fc = client.get("/api/facilities", params={"kind": "hospital"}).json()
    assert fc["type"] == "FeatureCollection"
    assert fc["features"] and all(f["properties"]["kind"] == "hospital" for f in fc["features"])


@needs_db
def test_within_is_sorted_and_bounded(seeded):
    r = client.post("/api/query/within", json={"kind": "school", "radius_m": 3000, **KC}).json()
    meters = [row["meters"] for row in r["rows"]]
    assert meters == sorted(meters) and all(m <= 3000 for m in meters)
    assert "ST_DWithin" in r["sql"] and r["overlay"]["type"] == "Polygon"
    bigger = client.post("/api/query/within", json={"kind": "school", "radius_m": 6000, **KC}).json()
    assert len(bigger["rows"]) >= len(r["rows"])


@needs_db
def test_nearest_uses_knn(seeded):
    r = client.post("/api/query/nearest", json={"kind": "hospital", "limit": 3, **KC}).json()
    assert len(r["rows"]) == 3 and "<->" in r["sql"]
    assert r["rows"][0]["meters"] <= r["rows"][1]["meters"]


@needs_db
def test_gaps_density_and_flood(seeded):
    gaps = client.post("/api/query/gaps", json={"kind": "school", "radius_m": 1500}).json()["rows"]
    assert gaps and any(c["gap"] for c in gaps) and not all(c["gap"] for c in gaps)
    dens = client.post("/api/query/density", json={"kind": "park"}).json()["rows"]
    assert dens[0]["n"] >= dens[-1]["n"] >= 1
    flood = client.post("/api/query/flood", json={"buffer_m": 2000}).json()
    assert flood["rows"] and flood["overlay"]["type"] in {"Polygon", "MultiPolygon"}


@needs_db
def test_assistant_end_to_end(seeded):
    r = client.post("/api/assistant", json={"question": "Show me all schools within 5 km of this location", **KC}).json()
    assert r["intent"]["type"] == "within" and r["highlight"] and r["sql"]
    assert r["engine"] in {"rule-based"} or r["engine"].startswith("claude:")
    r = client.post("/api/assistant", json={"question": "What is the population within 2 km?", **KC}).json()
    assert r["intent"]["type"] == "unsupported" and r["sql"] is None
