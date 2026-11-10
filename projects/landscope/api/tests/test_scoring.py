"""Same cases as src/scoring.test.ts, so the Python and TypeScript rules stay in sync."""
from app.scoring import Weights, assess, road_score, score_site, size_score, zoning_score

BASE = {"id": "s1234", "landuse": "meadow", "name": None, "acres": 20, "road_m": 150, "road_name": "I-435", "school_m": 600,
        "school_name": "Oak Elementary", "hospital_m": 2500, "hospital_name": "Mercy", "lon": -94.6, "lat": 38.93}


def test_size():
    assert size_score(20, "residential") == 1
    assert size_score(2.5, "residential") == 0.5
    assert size_score(120, "residential") == 0.5


def test_road():
    assert road_score(100) == 1
    assert road_score(1600) == 0.5
    assert road_score(5000) == 0


def test_zoning():
    assert zoning_score("industrial", "industrial") == 1
    assert zoning_score("residential", "industrial") == 0
    assert zoning_score("unknown", "commercial") == 0.3


def test_weighted_total():
    assert score_site(BASE, "residential", Weights())["total"] > 90
    assert score_site({**BASE, "road_m": 5000}, "residential", Weights(size=0, road=100, services=0, zoning=0))["total"] == 0
    assert score_site(BASE, "residential", Weights(size=0, road=0, services=0, zoning=0))["total"] == 0


def test_assessment():
    a = assess(BASE, score_site(BASE, "residential", Weights()), "residential")
    assert "I-435" in " ".join(a["opportunities"])
    assert a["missing"]
    small = {**BASE, "acres": 1}
    assert "small" in assess(small, score_site(small, "residential", Weights()), "residential")["constraints"][0]
