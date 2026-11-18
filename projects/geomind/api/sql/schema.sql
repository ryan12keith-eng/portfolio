-- GeoMind spatial schema (PostgreSQL 14+ with PostGIS 3.1+)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS facilities (
  id    text PRIMARY KEY,                        -- OpenStreetMap id, e.g. n12345 / w678
  kind  text NOT NULL CHECK (kind IN ('school','hospital','library','fire_station','park')),
  name  text,
  geom  geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS facilities_geom_idx ON facilities USING gist (geom);
-- geography index so ST_DWithin(geom::geography, ...) in meters can use it
CREATE INDEX IF NOT EXISTS facilities_geog_idx ON facilities USING gist ((geom::geography));
CREATE INDEX IF NOT EXISTS facilities_kind_idx ON facilities (kind);

CREATE TABLE IF NOT EXISTS rivers (
  id    text PRIMARY KEY,
  name  text,
  geom  geometry(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS rivers_geom_idx ON rivers USING gist (geom);
