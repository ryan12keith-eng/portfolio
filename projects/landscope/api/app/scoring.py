"""LandScope suitability rules. Mirrors src/scoring.ts so browser and server agree;
tests/test_scoring.py checks the same cases as the TypeScript tests."""
from typing import Literal, TypedDict

from pydantic import BaseModel, Field

Target = Literal["residential", "commercial", "industrial"]

ZONING_FIT: dict[str, dict[str, float]] = {
    "residential": {"farmland": 1, "meadow": 1, "greenfield": 1, "grass": 0.85, "construction": 0.8, "residential": 0.65, "brownfield": 0.6, "commercial": 0.35, "retail": 0.35, "industrial": 0.1},
    "commercial": {"retail": 1, "commercial": 1, "brownfield": 0.85, "construction": 0.7, "grass": 0.6, "meadow": 0.55, "greenfield": 0.55, "industrial": 0.5, "farmland": 0.4, "residential": 0.2},
    "industrial": {"industrial": 1, "brownfield": 1, "meadow": 0.6, "farmland": 0.6, "construction": 0.6, "grass": 0.5, "greenfield": 0.5, "commercial": 0.45, "retail": 0.3, "residential": 0},
}
IDEAL_ACRES: dict[str, tuple[float, float]] = {"residential": (5, 60), "commercial": (2, 25), "industrial": (10, 120)}
MISSING = ["Terrain slope (needs a DEM)", "Utility capacity", "Official parcel boundaries and zoning code"]


class Weights(BaseModel):
    size: float = Field(default=25, ge=0, le=100)
    road: float = Field(default=25, ge=0, le=100)
    services: float = Field(default=25, ge=0, le=100)
    zoning: float = Field(default=25, ge=0, le=100)


class Metrics(TypedDict):
    id: str
    landuse: str
    name: str | None
    acres: float
    road_m: int
    road_name: str
    school_m: int
    school_name: str
    hospital_m: int
    hospital_name: str
    lon: float
    lat: float


def clamp01(n: float) -> float:
    return max(0.0, min(1.0, n))


def size_score(acres: float, target: Target) -> float:
    lo, hi = IDEAL_ACRES[target]
    if acres < lo:
        return clamp01(acres / lo)
    if acres > hi:
        return clamp01(hi / acres)
    return 1.0


def road_score(meters: float) -> float:
    """1 within 200 m of a major road, falling to 0 at 3 km."""
    return clamp01(1 - (meters - 200) / 2800)


def services_score(school_m: float, hospital_m: float, target: Target) -> float:
    school = clamp01(1 - (school_m - 500) / 4500)
    hospital = clamp01(1 - (hospital_m - 1000) / 9000)
    return 0.65 * school + 0.35 * hospital if target == "residential" else hospital


def zoning_score(landuse: str, target: Target) -> float:
    return ZONING_FIT[target].get(landuse, 0.3)


def score_site(m: Metrics, target: Target, w: Weights) -> dict:
    parts = {
        "size": size_score(m["acres"], target),
        "road": road_score(m["road_m"]),
        "services": services_score(m["school_m"], m["hospital_m"], target),
        "zoning": zoning_score(m["landuse"], target),
    }
    total_w = w.size + w.road + w.services + w.zoning
    total = 0 if total_w == 0 else sum(parts[k] * getattr(w, k) for k in parts) / total_w
    return {"total": round(total * 100), "parts": parts}


def fmt_m(m: float) -> str:
    return f"{m / 1000:.1f} km" if m >= 1000 else f"{round(m)} m"


def assess(m: Metrics, s: dict, target: Target) -> dict[str, list[str]]:
    p = s["parts"]
    ops: list[str] = []
    cons: list[str] = []
    lo = IDEAL_ACRES[target][0]
    if p["size"] >= 0.9:
        ops.append(f"{m['acres']} acres is within the typical range for {target} projects")
    elif m["acres"] < lo:
        cons.append(f"At {m['acres']} acres the site is small for {target} use (typical {lo:g}+ acres)")
    else:
        cons.append(f"At {m['acres']} acres the site is larger than typical; consider phasing or subdividing")
    if p["road"] >= 0.75:
        ops.append(f"Major road access: {fmt_m(m['road_m'])} to {m['road_name']}")
    elif p["road"] <= 0.4:
        cons.append(f"Far from major roads ({fmt_m(m['road_m'])} to {m['road_name']})")
    if target == "residential":
        if m["school_m"] <= 1500:
            ops.append(f"School within {fmt_m(m['school_m'])} ({m['school_name']})")
        else:
            cons.append(f"Nearest school is {fmt_m(m['school_m'])} away")
    if m["hospital_m"] <= 5000:
        ops.append(f"Hospital within {fmt_m(m['hospital_m'])} ({m['hospital_name']})")
    if p["zoning"] >= 0.8:
        ops.append(f"Current land use ({m['landuse']}) suits {target} development")
    elif p["zoning"] <= 0.4:
        cons.append(f"Current land use ({m['landuse']}) would likely need rezoning for {target} use")
    return {"opportunities": ops, "constraints": cons, "missing": list(MISSING)}


def site_label(m: Metrics) -> str:
    return m["name"] or f"{m['landuse'].capitalize()} site {m['id'][-4:]}"


def report_text(m: Metrics, s: dict, target: Target, w: Weights, narrative: str | None = None) -> str:
    a = assess(m, s, target)
    none = ["- None found in the loaded data"]
    lines = [
        f"# LandScope site report: {site_label(m)}",
        "",
        f"**Target use:** {target} · **Suitability:** {s['total']}/100",
        f"**Weights:** size {w.size:g}, road access {w.road:g}, services {w.services:g}, land-use fit {w.zoning:g}",
        "",
        "## Measurements (PostGIS)",
        f"- Area: {m['acres']} acres · land use: {m['landuse']}",
        f"- Major road: {fmt_m(m['road_m'])} to {m['road_name']}",
        f"- Nearest school: {fmt_m(m['school_m'])} ({m['school_name']})",
        f"- Nearest hospital: {fmt_m(m['hospital_m'])} ({m['hospital_name']})",
        f"- Centroid: {m['lat']:.5f}, {m['lon']:.5f}",
        "",
        "## Score breakdown",
        *[f"- {k}: {round(v * 100)}" for k, v in s["parts"].items()],
        "",
        "## Opportunities",
        *([f"- {o}" for o in a["opportunities"]] or none),
        "",
        "## Constraints",
        *([f"- {c}" for c in a["constraints"]] or none),
        "",
        "## Not yet assessed",
        *[f"- {x}" for x in a["missing"]],
    ]
    if narrative:
        lines += ["", "## Summary", narrative]
    lines += ["", "_Data © OpenStreetMap contributors (ODbL)._"]
    return "\n".join(lines)
