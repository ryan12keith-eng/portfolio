# LandScope API

FastAPI + PostgreSQL/PostGIS backend for the LandScope land-suitability demo.

- **Measured in PostGIS:** for 415 real OpenStreetMap land-use sites, a materialized view (`sql/metrics.sql`) computes true area (acres) and geodesic distance from each site's centroid to the nearest major road, school and hospital (KNN shortlist + exact `geography` distance).
- **Scoring:** the same transparent rules as the frontend (`app/scoring.py` mirrors `src/scoring.ts`; both are tested).
- **Reports:** `POST /api/reports` saves a Markdown site report in PostgreSQL; `GET /api/reports/{id}` returns it. If `ANTHROPIC_API_KEY` is set, reports include a short Claude-written summary that may use only the measured facts.
- **Endpoints:** `GET /api/health`, `GET /api/metrics`, `GET /api/sites`, `POST /api/rank`, `POST /api/sites/{id}`, `POST /api/compare`, `POST /api/reports`, `GET /api/reports`, `GET /api/reports/{id}`.

## Run locally

```bash
cd projects/landscope/api
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql://user:pass@localhost:5432/landscope   # PostGIS 3.1+
python -m app.seed                                    # tables, data, and PostGIS measurements
uvicorn app.main:app --reload --port 8001
```

Frontend: `VITE_LANDSCOPE_API=http://127.0.0.1:8001 npm run dev` from the repo root.

## Deploy

Same as GeoMind (see `projects/geomind/api/README.md`): the `landscope-api` service is in `render.yaml` and can share the same Neon database (its tables are prefixed `ls_`). Add the Render URL as the GitHub repository variable `LANDSCOPE_API_URL`.

Data © OpenStreetMap contributors (ODbL).
