# Ryan Keith | Software Engineer

Portfolio site for Ryan Keith, Software Engineer in Kansas City building full-stack, geospatial and AI-powered systems.

Built with React 19, TypeScript and Vite. No UI or animation libraries: the motion (masked text reveals, wipes,
shape layers, counters, marquee, parallax) is plain CSS plus a few small hooks in `src/motion.tsx`.
All motion is disabled for visitors who set "reduce motion".

## Run locally

```bash
npm install
npm run dev      # http://127.0.0.1:5174
npm run build    # type-check + production build to dist/
npm run preview  # serve the build
```

## Projects

Six working demo apps live in [`projects/`](projects). Each one is built alongside the portfolio
(`npm run build` → `dist/projects/<id>/`) and linked from its card with **Live demo** and **Source code** buttons.
All of them run fully in the browser, so they work on static hosting such as GitHub Pages.

| App | What it does | Core logic (unit-tested) |
| --- | --- | --- |
| [`geomind`](projects/geomind) | **Full stack:** React + MapLibre frontend and a [FastAPI + PostGIS API](projects/geomind/api) (spatial SQL, Claude tool-calling router when a key is set, CI against a PostGIS container, Render/Neon deploy). 3D map of central Kansas City with real OpenStreetMap facilities and rivers; falls back to in-browser Turf.js when the API is asleep. | `spatial.ts`, `api/app/queries.py`, `api/app/assistant.py` |
| [`landscope`](projects/landscope) | **Full stack:** React + MapLibre frontend and a [FastAPI + PostGIS API](projects/landscope/api) that measures 415 real land-use sites in SQL (area, nearest road / school / hospital), ranks them with configurable weights, and saves site reports in PostgreSQL (optional Claude summary). Falls back to in-browser Turf.js. | `scoring.ts`, `api/app/scoring.py`, `api/sql/metrics.sql` |
| [`earthwatch`](projects/earthwatch) | Before/after swipe of NASA Landsat imagery of the 2024 Rufiji River flood, with in-browser change detection, land-cover classification and a vegetation index computed from the pixels. | `analysis.ts` |
| [`job-tracker`](projects/job-tracker) | Drag-and-drop application pipeline with validated forms, deadlines, and a job-posting summary with resume-skill suggestions you accept or discard. | `analyze.ts`, `validate.ts` |
| [`printflow`](projects/printflow) | Print job portal with customer / CSR / production roles, enforced status transitions, validated artwork uploads, click-to-comment proofs, audit history and email alerts with retry. | `workflow.ts` |
| [`quote-assistant`](projects/quote-assistant) | Extracts print specs from a quote email (with confidence flags), requires a human check of uncertain fields, and prices the job with deterministic rules. | `parser.ts`, `pricing.ts` |

The AI-style features (GIS assistant, posting summaries, spec extraction) use deterministic, tested parsers so the
demos run offline with no API keys. Each app's **About this demo** note explains where an LLM fits in the
production design. Demo data is saved in the browser's local storage.

```bash
npm test         # 49 frontend unit tests across the six apps
cd projects/geomind/api && python -m pytest     # GeoMind API tests (PostGIS tests need DATABASE_URL)
cd projects/landscope/api && python -m pytest   # LandScope API tests
npm run data     # re-download the OpenStreetMap data used by geomind and landscope
```

Map data © OpenStreetMap contributors (ODbL). Basemap by OpenFreeMap. Satellite imagery: NASA Earth Observatory (public domain).

## Editing content

All copy lives in [`src/data.ts`](src/data.ts): profile, contact details, role tracks, projects,
the GeoMind flagship deep-dive and the Q&A.

## Images

Each project has three real photos in `public/images/projects/` (`<id>.webp` cover plus `<id>-2.webp` and `<id>-3.webp`),
shown as a main image with clickable thumbnails. All come from Wikimedia Commons under public-domain, CC0 or
Creative Commons licenses; they were cropped and resized. The full source, author and license for every photo is in
`src/data.ts` (`credit` fields) and is listed on the site under **Photo credits** in the footer.

To use a screenshot of the real app instead, replace the file and update its `alt`, `caption` and `credit` in `src/data.ts`.

## Deploying

`vite.config.ts` uses `base: './'`, so the `dist/` build works from any path, including GitHub Pages at
`https://ryan12keith-eng.github.io/portfolio/`.
