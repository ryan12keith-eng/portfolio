-- LandScope schema (PostgreSQL 14+ with PostGIS 3.1+)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() on older Postgres

CREATE TABLE IF NOT EXISTS ls_sites (
  id       text PRIMARY KEY,                -- OpenStreetMap way id
  landuse  text NOT NULL,
  name     text,
  geom     geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ls_sites_geom_idx ON ls_sites USING gist (geom);

CREATE TABLE IF NOT EXISTS ls_roads (
  id       text PRIMARY KEY,
  highway  text NOT NULL,
  ref      text,
  name     text,
  geom     geometry(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ls_roads_geom_idx ON ls_roads USING gist (geom);

CREATE TABLE IF NOT EXISTS ls_services (
  id    text PRIMARY KEY,
  kind  text NOT NULL CHECK (kind IN ('school', 'hospital')),
  name  text,
  geom  geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ls_services_geom_idx ON ls_services USING gist (geom);

-- Saved site reports
CREATE TABLE IF NOT EXISTS ls_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text NOT NULL REFERENCES ls_sites (id),
  target      text NOT NULL,
  weights     jsonb NOT NULL,
  score       int NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
