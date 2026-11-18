"""GeoMind GIS assistant: question → spatial tool call → PostGIS query → answer.

Two routers pick the tool and its arguments:
  * Claude tool calling, when ANTHROPIC_API_KEY is set on the server.
  * A rule-based parser otherwise (and as a fallback if the API call fails).
Either way the answer is computed from the database, never invented by a model.
"""
import logging
import re
from typing import Any, Literal

import psycopg
from pydantic import BaseModel, Field

from . import queries
from .config import settings

log = logging.getLogger(__name__)

KINDS = ("school", "hospital", "library", "fire_station", "park")
LABEL = {
    "school": ("school", "schools"),
    "hospital": ("hospital", "hospitals"),
    "library": ("library", "libraries"),
    "fire_station": ("fire station", "fire stations"),
    "park": ("park", "parks"),
}


class Intent(BaseModel):
    type: Literal["within", "nearest", "count", "gaps", "density", "flood", "unsupported", "unknown"]
    kind: str | None = None
    radius_m: float | None = Field(default=None, gt=0, le=50_000)
    buffer_m: float | None = Field(default=None, gt=0, le=5_000)
    reason: str | None = None


class Answer(BaseModel):
    text: str
    sql: str | None = None
    params: dict[str, Any] | None = None
    highlight: list[str] = []
    overlay: dict[str, Any] | None = None
    overlay_style: Literal["buffer", "gaps", "density", "flood"] | None = None
    items: list[dict[str, str]] = []
    intent: Intent
    engine: str


# ---------------------------------------------------------------- rule-based router

KIND_WORDS = [
    (r"\bschools?\b|\beducation\b", "school"),
    (r"\bhospitals?\b|\bmedical\b|\bclinics?\b|\bhealth\b", "hospital"),
    (r"\blibrar(y|ies)\b", "library"),
    (r"\bfire\s*(stations?|department|houses?)\b", "fire_station"),
    (r"\bparks?\b|\bgreen\s*spaces?\b", "park"),
]


def kind_in(q: str) -> str | None:
    return next((k for pat, k in KIND_WORDS if re.search(pat, q, re.I)), None)


def distance_in(q: str) -> float | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|m\b|met(?:er|re)s?|mi\b|miles?)", q, re.I)
    if not m:
        return None
    n, unit = float(m.group(1)), m.group(2).lower()
    return round(n * 1000 if unit.startswith("k") else n * 1609.34 if unit.startswith("mi") else n)


def parse_question(q: str) -> Intent:
    kind, dist = kind_in(q), distance_in(q)
    if re.search(r"\bpopulation|people live|residents|census\b", q, re.I):
        return Intent(type="unsupported", reason="Population data (for example WorldPop or census blocks) isn't loaded, so I can't answer that without guessing.")
    if re.search(r"\bflood|river|inundat", q, re.I):
        return Intent(type="flood", kind=kind, buffer_m=dist or 300)
    if kind and re.search(r"\b(gap|gaps|underserved|insufficient|lack|lacking|without|far from|fewest|least)\b", q, re.I):
        default = 1500 if kind == "school" else 800 if kind == "park" else 3000
        return Intent(type="gaps", kind=kind, radius_m=dist or default)
    if re.search(r"\b(density|dense|concentrat|hotspots?|cluster|highest number|most)\b", q, re.I):
        return Intent(type="density", kind=kind)
    if not kind:
        return Intent(type="unknown")
    if re.search(r"\b(nearest|closest)\b", q, re.I):
        return Intent(type="nearest", kind=kind)
    if dist is not None or re.search(r"\bwithin|near|around\b", q, re.I):
        return Intent(type="within", kind=kind, radius_m=dist or 2000)
    if re.search(r"\bhow many|count|number of|total\b", q, re.I):
        return Intent(type="count", kind=kind)
    return Intent(type="within", kind=kind, radius_m=2000)


# ---------------------------------------------------------------- Claude router (optional)

def _tool(name: str, description: str, props: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {"type": "object", "properties": props, "required": list(props), "additionalProperties": False},
    }


KIND_PROP = {"type": "string", "enum": list(KINDS)}
KIND_OR_ALL = {"type": "string", "enum": [*KINDS, "all"], "description": "Facility type, or 'all' for every type"}
TOOLS = [
    _tool("find_within", "Facilities of one type within a radius of the user's selected map point.", {"kind": KIND_PROP, "radius_m": {"type": "number", "description": "Radius in meters"}}),
    _tool("find_nearest", "The closest facilities of one type to the selected map point.", {"kind": KIND_PROP}),
    _tool("count_facilities", "Count all facilities of one type in the study area.", {"kind": KIND_PROP}),
    _tool("find_coverage_gaps", "Areas farther than a distance from any facility of one type (underserved areas).", {"kind": KIND_PROP, "radius_m": {"type": "number"}}),
    _tool("find_density", "Where facilities are most concentrated, on a hexagon grid.", {"kind": KIND_OR_ALL}),
    _tool("flood_exposure", "Facilities within a buffer distance of the major rivers (a simple flood-proximity estimate).", {"kind": KIND_OR_ALL, "buffer_m": {"type": "number"}}),
    _tool("cannot_answer", "Use when the question needs data that is not loaded (population, elevation, traffic, etc.) or is off-topic.", {"reason": {"type": "string"}}),
]
SYSTEM = (
    "You route questions about a GIS map of central Kansas City to exactly one spatial tool. "
    "Loaded data: schools, hospitals, libraries, fire stations, parks (OpenStreetMap points) and rivers. "
    "Call one tool with sensible defaults (radius 2000 m, gap distance 1500 m for schools, flood buffer 300 m). "
    "If the question needs data that isn't loaded, call cannot_answer. Never answer from your own knowledge."
)


def route_with_claude(question: str) -> Intent | None:
    """Returns the intent Claude chose, or None if Claude is unavailable or didn't call a tool."""
    if not settings.anthropic_api_key:
        return None
    import anthropic  # imported lazily so the rule-based mode needs no SDK

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=1, timeout=30)
    try:
        response = client.beta.messages.create(
            model=settings.claude_model,
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # re-run on Anthropic's recommended model if this one declines
            output_config={"effort": "low"},
            system=SYSTEM,
            tools=TOOLS,
            messages=[{"role": "user", "content": question}],
        )
    except anthropic.RateLimitError:
        log.warning("Claude rate limited; using rule-based router")
        return None
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s; using rule-based router", e.status_code)
        return None
    except anthropic.APIConnectionError:
        log.warning("Claude unreachable; using rule-based router")
        return None

    if response.stop_reason == "refusal":
        return Intent(type="unsupported", reason="That question can't be answered here.")
    call = next((b for b in response.content if b.type == "tool_use"), None)
    if call is None:
        return None
    args = dict(call.input)
    kind = None if args.get("kind") in (None, "all") else args.get("kind")
    try:
        match call.name:
            case "find_within":
                return Intent(type="within", kind=kind, radius_m=args["radius_m"])
            case "find_nearest":
                return Intent(type="nearest", kind=kind)
            case "count_facilities":
                return Intent(type="count", kind=kind)
            case "find_coverage_gaps":
                return Intent(type="gaps", kind=kind, radius_m=args["radius_m"])
            case "find_density":
                return Intent(type="density", kind=kind)
            case "flood_exposure":
                return Intent(type="flood", kind=kind, buffer_m=args["buffer_m"])
            case "cannot_answer":
                return Intent(type="unsupported", reason=args["reason"])
    except (KeyError, ValueError):  # out-of-range or missing arguments: let the rule-based parser handle it
        return None
    return None


# ---------------------------------------------------------------- execution

def fmt_dist(m: float) -> str:
    return f"{m / 1000:.{0 if m >= 10_000 else 1}f} km" if m >= 1000 else f"{round(m)} m"


def _name(row: dict[str, Any]) -> str:
    return row.get("name") or f"Unnamed {LABEL[row['kind']][0]}"


def _plural(kind: str, n: int) -> str:
    return LABEL[kind][0 if n == 1 else 1]


def execute(intent: Intent, conn: psycopg.Connection, lon: float, lat: float, engine: str) -> Answer:
    base = {"intent": intent, "engine": engine}
    t = intent.type
    if t == "unknown":
        return Answer(text="I can find facilities within a distance, the nearest one, coverage gaps, density hotspots and river proximity. Try one of the suggestions.", **base)
    if t == "unsupported":
        return Answer(text=intent.reason or "That isn't something the loaded data can answer.", **base)
    if t in ("within", "nearest", "count", "gaps") and intent.kind not in KINDS:
        return Answer(text="Which facility type? Schools, hospitals, libraries, fire stations or parks.", **base)

    if t == "within":
        r = queries.within(conn, intent.kind, lon, lat, intent.radius_m or 2000)
        rows = r["rows"]
        return Answer(
            text=f"Found {len(rows)} {_plural(intent.kind, len(rows))} within {fmt_dist(intent.radius_m or 2000)} of the selected point.",
            sql=r["sql"], params=r["params"], highlight=[x["id"] for x in rows],
            overlay={"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": r["overlay"]}]},
            overlay_style="buffer", items=[{"name": _name(x), "detail": fmt_dist(x["meters"])} for x in rows[:8]], **base,
        )
    if t == "nearest":
        r = queries.nearest(conn, intent.kind, lon, lat)
        rows = r["rows"]
        if not rows:
            return Answer(text=f"No {LABEL[intent.kind][1]} are loaded.", **base)
        return Answer(
            text=f"The nearest {LABEL[intent.kind][0]} is {_name(rows[0])}, {fmt_dist(rows[0]['meters'])} away.",
            sql=r["sql"], params=r["params"], highlight=[x["id"] for x in rows],
            items=[{"name": _name(x), "detail": fmt_dist(x["meters"])} for x in rows], **base,
        )
    if t == "count":
        r = queries.count(conn, intent.kind)
        n = len(r["rows"])
        return Answer(text=f"There are {n} {_plural(intent.kind, n)} in the study area (central Kansas City).", sql=r["sql"], params=r["params"], highlight=[x["id"] for x in r["rows"]], **base)
    if t == "gaps":
        radius = intent.radius_m or 1500
        r = queries.coverage_gaps(conn, intent.kind, radius)
        cells = r["rows"]
        gaps = sum(1 for c in cells if c["gap"])
        share = 100 * gaps / len(cells) if cells else 0
        features = [{"type": "Feature", "properties": {"value": 1 if c["gap"] else 0}, "geometry": c["geometry"]} for c in cells]
        return Answer(
            text=f"{gaps} of {len(cells)} hexagons ({share:.0f}% of the area) are more than {fmt_dist(radius)} from any {LABEL[intent.kind][0]}. They are shaded on the map.",
            sql=r["sql"], params=r["params"], overlay={"type": "FeatureCollection", "features": features}, overlay_style="gaps", **base,
        )
    if t == "density":
        r = queries.density(conn, intent.kind)
        cells = r["rows"]
        label = LABEL[intent.kind][1] if intent.kind else "public facilities"
        if not cells:
            return Answer(text=f"No {label} found.", sql=r["sql"], params=r["params"], **base)
        top = cells[0]
        features = [{"type": "Feature", "properties": {"value": c["n"]}, "geometry": c["geometry"]} for c in cells]
        return Answer(
            text=f"The densest hexagon has {top['n']} {label}, centered near {top['lat']:.3f}°N, {abs(top['lon']):.3f}°W. Darker cells have more.",
            sql=r["sql"], params=r["params"], overlay={"type": "FeatureCollection", "features": features}, overlay_style="density", **base,
        )
    if t == "flood":
        buffer_m = intent.buffer_m or 300
        r = queries.flood_exposure(conn, intent.kind, buffer_m)
        rows = r["rows"]
        label = LABEL[intent.kind][1] if intent.kind else "facilities"
        return Answer(
            text=f"{len(rows)} {label} lie within {fmt_dist(buffer_m)} of the Missouri, Kansas or Blue rivers. This is a proximity estimate, not an engineering flood assessment.",
            sql=r["sql"], params=r["params"], highlight=[x["id"] for x in rows],
            overlay={"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": r["overlay"]}]} if r["overlay"] else None,
            overlay_style="flood", items=[{"name": _name(x), "detail": LABEL[x["kind"]][0]} for x in rows[:8]], **base,
        )
    return Answer(text="I couldn't work out that question.", **base)


def answer(question: str, conn: psycopg.Connection, lon: float, lat: float) -> Answer:
    intent = route_with_claude(question)
    engine = f"claude:{settings.claude_model}" if intent else "rule-based"
    if intent is None:
        intent = parse_question(question)
    return execute(intent, conn, lon, lat, engine)
