-- Measures every site once: true area in acres, and geodesic distance from its
-- centroid to the nearest major road, school and hospital.
-- KNN (<->) shortlists 5 candidates by index; exact distance on geography picks the winner.
DROP MATERIALIZED VIEW IF EXISTS ls_site_metrics;
CREATE MATERIALIZED VIEW ls_site_metrics AS
WITH c AS (
  SELECT id, landuse, name, geom, ST_Centroid(geom) AS pt FROM ls_sites
)
SELECT
  c.id, c.landuse, c.name,
  round((ST_Area(c.geom::geography) / 4046.86)::numeric, 1)::float AS acres,
  road.meters  AS road_m,     road.label   AS road_name,
  school.meters AS school_m,  school.name  AS school_name,
  hosp.meters  AS hospital_m, hosp.name    AS hospital_name,
  ST_X(c.pt) AS lon, ST_Y(c.pt) AS lat
FROM c
CROSS JOIN LATERAL (
  SELECT round(min(d))::int AS meters, (array_agg(label ORDER BY d))[1] AS label
  FROM (
    SELECT ST_Distance(c.pt::geography, r.geom::geography) AS d,
           replace(coalesce(r.ref, r.name, r.highway), ';', ' / ') AS label
    FROM ls_roads r ORDER BY r.geom <-> c.pt LIMIT 5
  ) cand
) road
CROSS JOIN LATERAL (
  SELECT round(ST_Distance(c.pt::geography, s.geom::geography))::int AS meters, coalesce(s.name, 'Unnamed school') AS name
  FROM ls_services s WHERE s.kind = 'school' ORDER BY s.geom <-> c.pt LIMIT 1
) school
CROSS JOIN LATERAL (
  SELECT round(ST_Distance(c.pt::geography, s.geom::geography))::int AS meters, coalesce(s.name, 'Unnamed hospital') AS name
  FROM ls_services s WHERE s.kind = 'hospital' ORDER BY s.geom <-> c.pt LIMIT 1
) hosp;
CREATE UNIQUE INDEX ON ls_site_metrics (id);
