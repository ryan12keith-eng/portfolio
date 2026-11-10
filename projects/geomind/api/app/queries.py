"""PostGIS spatial queries behind GeoMind's API and assistant.

Every function runs parameterized SQL (never string-formatted user input) and
returns the rows plus the SQL text, so the UI can show exactly what ran.
Distances are true meters: points are cast to `geography` for ST_DWithin /
ST_Distance; hexagon grids are built in Web Mercator (EPSG:3857) and
transformed back to WGS84 for the map.
"""
from typing import Any, Literal

import psycopg

Kind = Literal["school", "hospital", "library", "fire_station", "park"]

POINT = "ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)"


def _result(sql: str, params: dict[str, Any], rows: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {"sql": " ".join(sql.split()), "params": params, "rows": rows, **extra}


def facilities_geojson(conn: psycopg.Connection, kind: str | None = None) -> dict[str, Any]:
    sql = """
      SELECT json_build_object('type', 'FeatureCollection',
             'features', coalesce(json_agg(ST_AsGeoJSON(f.*, 'geom')::json), '[]'::json)) AS fc
      FROM (SELECT id, kind, name, geom FROM facilities WHERE %(kind)s::text IS NULL OR kind = %(kind)s) f
    """
    return conn.execute(sql, {"kind": kind}).fetchone()["fc"]


def rivers_geojson(conn: psycopg.Connection) -> dict[str, Any]:
    sql = """
      SELECT json_build_object('type', 'FeatureCollection',
             'features', coalesce(json_agg(ST_AsGeoJSON(r.*, 'geom')::json), '[]'::json)) AS fc
      FROM (SELECT id, name, geom FROM rivers) r
    """
    return conn.execute(sql).fetchone()["fc"]


def within(conn: psycopg.Connection, kind: Kind, lon: float, lat: float, radius_m: float) -> dict[str, Any]:
    sql = f"""
      SELECT id, kind, name, ST_Distance(geom::geography, {POINT}::geography) AS meters
      FROM facilities
      WHERE kind = %(kind)s
        AND ST_DWithin(geom::geography, {POINT}::geography, %(radius)s)
      ORDER BY meters
    """
    params = {"kind": kind, "lon": lon, "lat": lat, "radius": radius_m}
    rows = conn.execute(sql, params).fetchall()
    circle = conn.execute(f"SELECT ST_AsGeoJSON(ST_Buffer({POINT}::geography, %(radius)s)::geometry)::json AS g", params).fetchone()["g"]
    return _result(sql, params, rows, overlay=circle)


def nearest(conn: psycopg.Connection, kind: Kind, lon: float, lat: float, limit: int = 3) -> dict[str, Any]:
    # <-> ranks by planar degrees, which skews east-west vs north-south distances, so it only
    # shortlists candidates via the index; the final order uses true geodesic meters.
    sql = f"""
      SELECT * FROM (
        SELECT id, kind, name, ST_Distance(geom::geography, {POINT}::geography) AS meters
        FROM facilities
        WHERE kind = %(kind)s
        ORDER BY geom <-> {POINT}
        LIMIT %(limit)s * 5
      ) candidates
      ORDER BY meters
      LIMIT %(limit)s
    """
    params = {"kind": kind, "lon": lon, "lat": lat, "limit": limit}
    return _result(sql, params, conn.execute(sql, params).fetchall())


def count(conn: psycopg.Connection, kind: Kind) -> dict[str, Any]:
    sql = "SELECT id FROM facilities WHERE kind = %(kind)s"
    params = {"kind": kind}
    return _result(sql, params, conn.execute(sql, params).fetchall())


# Hexagons are generated over the extent of all facilities. Edge length is in
# EPSG:3857 units; at Kansas City's latitude (~39°) 450 units ≈ 350 m on the ground.
HEX_CTE = """
  WITH ext AS (SELECT ST_Transform(ST_Envelope(ST_Collect(geom)), 3857) AS g FROM facilities),
  hex AS (SELECT h.geom AS g3857, row_number() OVER () AS hid FROM ext, ST_HexagonGrid(%(edge)s, ext.g) AS h)
"""


def coverage_gaps(conn: psycopg.Connection, kind: Kind, radius_m: float, edge: float = 450) -> dict[str, Any]:
    sql = f"""
      {HEX_CTE}
      SELECT hid,
             ST_AsGeoJSON(ST_Transform(g3857, 4326))::json AS geometry,
             NOT EXISTS (
               SELECT 1 FROM facilities f
               WHERE f.kind = %(kind)s
                 AND ST_DWithin(ST_Transform(ST_Centroid(g3857), 4326)::geography, f.geom::geography, %(radius)s)
             ) AS gap
      FROM hex
    """
    params = {"kind": kind, "radius": radius_m, "edge": edge}
    return _result(sql, params, conn.execute(sql, params).fetchall())


def density(conn: psycopg.Connection, kind: Kind | None, edge: float = 450) -> dict[str, Any]:
    sql = f"""
      {HEX_CTE}
      SELECT hid,
             ST_AsGeoJSON(ST_Transform(g3857, 4326))::json AS geometry,
             count(f.id) AS n,
             ST_X(ST_Transform(ST_Centroid(g3857), 4326)) AS lon,
             ST_Y(ST_Transform(ST_Centroid(g3857), 4326)) AS lat
      FROM hex
      JOIN facilities f
        ON ST_Intersects(hex.g3857, ST_Transform(f.geom, 3857))
       AND (%(kind)s::text IS NULL OR f.kind = %(kind)s)
      GROUP BY hid, g3857
      ORDER BY n DESC
    """
    params = {"kind": kind, "edge": edge}
    return _result(sql, params, conn.execute(sql, params).fetchall())


def flood_exposure(conn: psycopg.Connection, kind: Kind | None, buffer_m: float) -> dict[str, Any]:
    sql = """
      SELECT f.id, f.kind, f.name
      FROM facilities f
      WHERE (%(kind)s::text IS NULL OR f.kind = %(kind)s)
        AND EXISTS (
          SELECT 1 FROM rivers r
          WHERE r.name ILIKE '%%river%%'
            AND ST_DWithin(f.geom::geography, r.geom::geography, %(buffer)s)
        )
      ORDER BY f.kind, f.name
    """
    params = {"kind": kind, "buffer": buffer_m}
    rows = conn.execute(sql, params).fetchall()
    zone = conn.execute(
        "SELECT ST_AsGeoJSON(ST_Union(ST_Buffer(geom::geography, %(buffer)s)::geometry))::json AS g FROM rivers WHERE name ILIKE '%%river%%'",
        params,
    ).fetchone()["g"]
    return _result(sql, params, rows, overlay=zone)


def stats(conn: psycopg.Connection) -> dict[str, Any]:
    by_kind = conn.execute("SELECT kind, count(*) AS n FROM facilities GROUP BY kind ORDER BY kind").fetchall()
    version = conn.execute("SELECT postgis_lib_version() AS v").fetchone()["v"]
    rivers = conn.execute("SELECT count(*) AS n FROM rivers").fetchone()["n"]
    return {"postgis": version, "facilities": {r["kind"]: r["n"] for r in by_kind}, "rivers": rivers}
