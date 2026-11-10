"""Validation tests always run; database tests need a PostGIS DATABASE_URL."""
import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import narrative
from app.main import app

client = TestClient(app)
needs_db = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs a PostGIS DATABASE_URL")


def test_health_always_responds():
    assert client.get("/api/health").json()["status"] in {"ok", "degraded"}


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/rank", {"target": "casino"}),
        ("/api/rank", {"weights": {"size": 500}}),
        ("/api/rank", {"limit": 0}),
        ("/api/compare", {"ids": ["only-one"]}),
        ("/api/reports", {"site_id": ""}),
    ],
)
def test_rejects_invalid_input(path, body):
    assert client.post(path, json=body).status_code == 422


def test_bad_report_id_is_rejected():
    assert client.get("/api/reports/not-a-uuid").status_code == 422


def test_narrative_is_off_without_key():
    assert narrative.summarize({}, {}, "residential") is None


def test_narrative_uses_claude_when_configured(monkeypatch):
    import anthropic

    sent = {}

    class FakeClient:
        def __init__(self, **_):
            self.beta = SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: sent.update(kw) or SimpleNamespace(
                stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Strong road access; check slope.")])))

    monkeypatch.setattr(anthropic, "Anthropic", FakeClient)
    monkeypatch.setattr(narrative.settings.__class__, "anthropic_api_key", property(lambda self: "test-key"), raising=False)
    m = {"id": "s1", "landuse": "meadow", "name": None, "acres": 20, "road_m": 150, "road_name": "I-435", "school_m": 600,
         "school_name": "Oak", "hospital_m": 2500, "hospital_name": "Mercy", "lon": -94.6, "lat": 38.93}
    from app.scoring import Weights, score_site

    assert narrative.summarize(m, score_site(m, "residential", Weights()), "residential") == "Strong road access; check slope."
    assert sent["model"] == "claude-opus-5-5" and sent["fallbacks"] == "default"
    assert "Use ONLY the facts" in sent["system"]


@pytest.fixture(scope="module")
def seeded():
    from app.db import connect
    from app.seed import create_schema, load

    with connect() as conn:
        create_schema(conn)
        return load(conn)


@needs_db
def test_metrics_measured_in_postgis(seeded):
    rows = client.get("/api/metrics").json()
    assert len(rows) == seeded["sites"]
    r = rows[0]
    assert r["acres"] > 0 and r["road_m"] >= 0 and r["school_m"] >= 0 and r["hospital_m"] >= 0
    assert ";" not in r["road_name"]


@needs_db
def test_rank_detail_compare_and_reports(seeded):
    ranked = client.post("/api/rank", json={"target": "commercial", "limit": 5}).json()
    totals = [r["score"]["total"] for r in ranked]
    assert len(ranked) == 5 and totals == sorted(totals, reverse=True)
    top = ranked[0]["id"]
    detail = client.post(f"/api/sites/{top}", json={"target": "commercial"}).json()
    assert detail["score"]["total"] == ranked[0]["score"]["total"] and detail["assessment"]["missing"]
    cmp = client.post("/api/compare", json={"ids": [ranked[0]["id"], ranked[1]["id"]]}).json()
    assert len(cmp) == 2
    created = client.post("/api/reports", json={"site_id": top, "target": "commercial"})
    assert created.status_code == 201 and created.json()["body"].startswith("# LandScope site report")
    text = client.get(f"/api/reports/{created.json()['id']}")
    assert text.status_code == 200 and "Measurements (PostGIS)" in text.text
    assert client.post("/api/sites/does-not-exist", json={}).status_code == 404
