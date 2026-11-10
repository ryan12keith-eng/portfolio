# GeoMind API

FastAPI + PostgreSQL/PostGIS backend for the GeoMind smart-city GIS demo.

- **Spatial SQL on real data:** OpenStreetMap schools, hospitals, libraries, fire stations, parks and rivers for central Kansas City, stored as PostGIS geometries with GiST indexes.
- **Endpoints:** `GET /api/health`, `GET /api/facilities`, `GET /api/rivers`, `POST /api/query/{within,nearest,gaps,density,flood}`, `POST /api/assistant`.
- **Assistant:** routes a plain-language question to one spatial query. Uses **Claude tool calling** (strict tool schemas) when `ANTHROPIC_API_KEY` is set, otherwise a rule-based router. Either way the answer is computed by PostGIS and returned with the SQL that ran.
- **Safety:** all SQL is parameterized; inputs are validated (study-area bounds, radius limits); the assistant is rate-limited per client; the API key never leaves the server.

## Run locally

```bash
cd projects/geomind/api
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql://user:pass@localhost:5432/geomind   # any Postgres with PostGIS 3.1+
python -m app.seed                                    # create tables + load the data
uvicorn app.main:app --reload --port 8000
```

Point the frontend at it: `VITE_GEOMIND_API=http://127.0.0.1:8000 npm run dev` (from the repo root).

## Tests

```bash
python -m pytest            # router + validation tests run anywhere
DATABASE_URL=... python -m pytest   # adds the PostGIS integration tests
```

GitHub Actions (`.github/workflows/ci.yml`) runs the full suite against a `postgis/postgis` container on every push.

## Deploy (free tiers)

1. **Database: [Neon](https://neon.tech)** → create a project → copy the *pooled* connection string. PostGIS is enabled automatically by `schema.sql` (`CREATE EXTENSION postgis`).
2. **API: [Render](https://render.com)** → New → *Blueprint* → select this repository. `render.yaml` creates the `geomind-api` service. Paste the Neon URL as `DATABASE_URL`. Leave `ANTHROPIC_API_KEY` empty for the rule-based router, or add a key to enable Claude tool calling. On first boot `SEED_ON_STARTUP=true` creates the tables and loads the data.
3. **Site: GitHub Pages** → repository *Settings → Pages → Source: GitHub Actions*. Then *Settings → Secrets and variables → Actions → Variables* → add `GEOMIND_API_URL` = your Render URL (e.g. `https://geomind-api.onrender.com`). Every push to `main` rebuilds the site with the live API.

Render's free tier sleeps after inactivity; the frontend shows "Connecting…" while it wakes (up to a minute) and answers in-browser in the meantime.

Data © OpenStreetMap contributors (ODbL).
