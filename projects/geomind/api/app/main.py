"""GeoMind API: FastAPI + PostgreSQL/PostGIS.

Run locally:  uvicorn app.main:app --reload --port 8000
"""
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import assistant, queries
from .config import settings
from .db import DatabaseUnavailable, connect
from .seed import seed_if_empty

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("geomind")

# Kansas City study area; points outside it are rejected.
LON_RANGE = (-95.0, -94.0)
LAT_RANGE = (38.7, 39.5)
Kind = Literal["school", "hospital", "library", "fire_station", "park"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.seed_on_startup:
        try:
            seed_if_empty()
        except DatabaseUnavailable as e:
            log.error("Seeding skipped, database unavailable: %s", e)
    yield


app = FastAPI(title="GeoMind API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.exception_handler(DatabaseUnavailable)
async def db_down(_: Request, exc: DatabaseUnavailable):
    return JSONResponse(status_code=503, content={"detail": "Database unavailable", "reason": str(exc)})


class Point(BaseModel):
    lon: float = Field(ge=LON_RANGE[0], le=LON_RANGE[1])
    lat: float = Field(ge=LAT_RANGE[0], le=LAT_RANGE[1])


class WithinBody(Point):
    kind: Kind
    radius_m: float = Field(gt=0, le=50_000)


class NearestBody(Point):
    kind: Kind
    limit: int = Field(default=3, ge=1, le=25)


class GapsBody(BaseModel):
    kind: Kind
    radius_m: float = Field(gt=0, le=20_000)


class DensityBody(BaseModel):
    kind: Kind | None = None


class FloodBody(BaseModel):
    kind: Kind | None = None
    buffer_m: float = Field(default=300, gt=0, le=5_000)


class AskBody(Point):
    question: str = Field(min_length=2, max_length=300)


# Simple per-client sliding-window limit for the assistant (protects any API key from abuse).
_hits: dict[str, deque[float]] = defaultdict(deque)


def _rate_limit(request: Request) -> None:
    key = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= settings.assistant_rate_per_minute:
        raise HTTPException(status_code=429, detail="Too many questions; try again in a minute.")
    q.append(now)


@app.get("/api/health")
def health():
    """Reports database, PostGIS and assistant status. Returns 200 even when the DB is down so the UI can explain why."""
    ai = f"claude:{settings.claude_model}" if settings.anthropic_api_key else "rule-based"
    try:
        with connect() as conn:
            return {"status": "ok", "database": "ok", "assistant": ai, **queries.stats(conn)}
    except DatabaseUnavailable as e:
        return {"status": "degraded", "database": "unavailable", "reason": str(e), "assistant": ai}


@app.get("/api/facilities")
def facilities(kind: Kind | None = Query(default=None)):
    with connect() as conn:
        return queries.facilities_geojson(conn, kind)


@app.get("/api/rivers")
def rivers():
    with connect() as conn:
        return queries.rivers_geojson(conn)


@app.post("/api/query/within")
def within(body: WithinBody):
    with connect() as conn:
        return queries.within(conn, body.kind, body.lon, body.lat, body.radius_m)


@app.post("/api/query/nearest")
def nearest(body: NearestBody):
    with connect() as conn:
        return queries.nearest(conn, body.kind, body.lon, body.lat, body.limit)


@app.post("/api/query/gaps")
def gaps(body: GapsBody):
    with connect() as conn:
        return queries.coverage_gaps(conn, body.kind, body.radius_m)


@app.post("/api/query/density")
def density(body: DensityBody):
    with connect() as conn:
        return queries.density(conn, body.kind)


@app.post("/api/query/flood")
def flood(body: FloodBody):
    with connect() as conn:
        return queries.flood_exposure(conn, body.kind, body.buffer_m)


@app.post("/api/assistant", response_model=assistant.Answer)
def ask(body: AskBody, request: Request):
    _rate_limit(request)
    with connect() as conn:
        return assistant.answer(body.question, conn, body.lon, body.lat)
