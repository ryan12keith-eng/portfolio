"""LandScope API: FastAPI + PostgreSQL/PostGIS.

Run locally:  uvicorn app.main:app --reload --port 8001
"""
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from . import narrative
from .config import settings
from .db import DatabaseUnavailable, connect
from .scoring import Metrics, Target, Weights, assess, report_text, score_site, site_label
from .seed import seed_if_empty

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("landscope")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.seed_on_startup:
        try:
            seed_if_empty()
        except DatabaseUnavailable as e:
            log.error("Seeding skipped, database unavailable: %s", e)
    yield


app = FastAPI(title="LandScope API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.exception_handler(DatabaseUnavailable)
async def db_down(_: Request, exc: DatabaseUnavailable):
    return JSONResponse(status_code=503, content={"detail": "Database unavailable", "reason": str(exc)})


METRICS_SQL = "SELECT id, landuse, name, acres, road_m, road_name, school_m, school_name, hospital_m, hospital_name, lon, lat FROM ls_site_metrics"


def _metrics(conn, site_id: str) -> Metrics:
    row = conn.execute(METRICS_SQL + " WHERE id = %(id)s", {"id": site_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Site not found")
    return row


class RankBody(BaseModel):
    target: Target = "residential"
    weights: Weights = Weights()
    limit: int = Field(default=10, ge=1, le=500)


class SiteBody(BaseModel):
    target: Target = "residential"
    weights: Weights = Weights()


class ReportBody(SiteBody):
    site_id: str = Field(min_length=1, max_length=40)


class CompareBody(SiteBody):
    ids: list[str] = Field(min_length=2, max_length=5)


_hits: dict[str, deque[float]] = defaultdict(deque)


def _rate_limit(request: Request) -> None:
    key = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= settings.narrative_rate_per_minute:
        raise HTTPException(status_code=429, detail="Too many reports; try again in a minute.")
    q.append(now)


@app.get("/api/health")
def health():
    summary = "claude:" + settings.claude_model if settings.anthropic_api_key else "rule-based"
    try:
        with connect() as conn:
            counts = conn.execute(
                "SELECT (SELECT count(*) FROM ls_sites) AS sites, (SELECT count(*) FROM ls_roads) AS roads, "
                "(SELECT count(*) FROM ls_services) AS services, (SELECT count(*) FROM ls_reports) AS reports, postgis_lib_version() AS postgis"
            ).fetchone()
            return {"status": "ok", "database": "ok", "summaries": summary, **counts}
    except DatabaseUnavailable as e:
        return {"status": "degraded", "database": "unavailable", "reason": str(e), "summaries": summary}


@app.get("/api/metrics")
def metrics():
    """Every site's PostGIS measurements (area, nearest road / school / hospital)."""
    with connect() as conn:
        return conn.execute(METRICS_SQL + " ORDER BY id").fetchall()


@app.get("/api/sites")
def sites():
    with connect() as conn:
        return conn.execute(
            "SELECT json_build_object('type','FeatureCollection','features', coalesce(json_agg(ST_AsGeoJSON(s.*, 'geom')::json), '[]'::json)) AS fc "
            "FROM (SELECT id, landuse, name, geom FROM ls_sites) s"
        ).fetchone()["fc"]


@app.post("/api/rank")
def rank(body: RankBody):
    with connect() as conn:
        rows = conn.execute(METRICS_SQL).fetchall()
    scored = [{**m, "label": site_label(m), "score": score_site(m, body.target, body.weights)} for m in rows]
    scored.sort(key=lambda r: (-r["score"]["total"], r["id"]))
    return scored[: body.limit]


@app.post("/api/sites/{site_id}")
def site_detail(site_id: str, body: SiteBody):
    with connect() as conn:
        m = _metrics(conn, site_id)
    s = score_site(m, body.target, body.weights)
    return {**m, "label": site_label(m), "score": s, "assessment": assess(m, s, body.target)}


@app.post("/api/compare")
def compare(body: CompareBody):
    with connect() as conn:
        out = []
        for sid in body.ids:
            m = _metrics(conn, sid)
            out.append({**m, "label": site_label(m), "score": score_site(m, body.target, body.weights)})
    return out


@app.post("/api/reports", status_code=201)
def create_report(body: ReportBody, request: Request):
    _rate_limit(request)
    with connect() as conn:
        m = _metrics(conn, body.site_id)
        s = score_site(m, body.target, body.weights)
        summary = narrative.summarize(m, s, body.target)
        text = report_text(m, s, body.target, body.weights, summary)
        row = conn.execute(
            "INSERT INTO ls_reports (site_id, target, weights, score, body) VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
            (body.site_id, body.target, Jsonb(body.weights.model_dump()), s["total"], text),
        ).fetchone()
    return {"id": str(row["id"]), "created_at": row["created_at"].isoformat(), "score": s["total"], "summary_by": "claude" if summary else "rules", "body": text}


@app.get("/api/reports")
def list_reports(limit: int = 10):
    with connect() as conn:
        return conn.execute(
            "SELECT r.id::text AS id, r.site_id, r.target, r.score, r.created_at FROM ls_reports r ORDER BY r.created_at DESC LIMIT %(n)s",
            {"n": max(1, min(limit, 50))},
        ).fetchall()


@app.get("/api/reports/{report_id}", response_class=PlainTextResponse)
def get_report(report_id: UUID):
    with connect() as conn:
        row = conn.execute("SELECT body FROM ls_reports WHERE id = %(id)s", {"id": report_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return PlainTextResponse(row["body"], media_type="text/markdown; charset=utf-8")
