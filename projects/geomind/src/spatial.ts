// GeoMind's GIS engine: turns a plain-language question into a structured
// spatial operation, runs it with Turf.js on real OpenStreetMap data, and
// returns the answer plus the equivalent PostGIS SQL.
//
// The production design gives an LLM these operations as tools (function
// calling); the model chooses the tool and arguments, and the answer always
// comes from running the query. This demo uses a rule-based intent parser
// so it runs offline.
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'

export const KINDS = ['school', 'hospital', 'library', 'fire_station', 'park'] as const
export type Kind = (typeof KINDS)[number]
export const KIND_LABEL: Record<Kind, [string, string]> = {
  school: ['school', 'schools'],
  hospital: ['hospital', 'hospitals'],
  library: ['library', 'libraries'],
  fire_station: ['fire station', 'fire stations'],
  park: ['park', 'parks'],
}

export type Facility = Feature<Point, { id: string; kind: Kind; name: string | null }>
export type Data = { facilities: FeatureCollection<Point, Facility['properties']>; rivers: FeatureCollection<LineString, { name: string | null }> }
export type LngLat = [number, number]

export type Intent =
  | { type: 'within'; kind: Kind; radiusM: number }
  | { type: 'nearest'; kind: Kind }
  | { type: 'count'; kind: Kind }
  | { type: 'gaps'; kind: Kind; radiusM: number }
  | { type: 'density'; kind: Kind | null }
  | { type: 'flood'; kind: Kind | null; bufferM: number }
  | { type: 'unsupported'; reason: string }
  | { type: 'unknown' }

const KIND_WORDS: [RegExp, Kind][] = [
  [/\bschools?\b|\beducation\b/i, 'school'],
  [/\bhospitals?\b|\bmedical\b|\bclinics?\b|\bhealth\b/i, 'hospital'],
  [/\blibrar(y|ies)\b/i, 'library'],
  [/\bfire\s*(stations?|department|houses?)\b/i, 'fire_station'],
  [/\bparks?\b|\bgreen\s*spaces?\b/i, 'park'],
]

export function kindIn(q: string): Kind | null {
  return KIND_WORDS.find(([re]) => re.test(q))?.[1] ?? null
}

/** Parses "5 km", "800 m", "2 miles" into meters. */
export function distanceIn(q: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|m\b|met(?:er|re)s?|mi\b|miles?)/i.exec(q)
  if (!m) return null
  const n = parseFloat(m[1])
  const u = m[2].toLowerCase()
  return Math.round(u.startsWith('k') ? n * 1000 : u.startsWith('mi') ? n * 1609.34 : n)
}

export function parseQuestion(q: string): Intent {
  const kind = kindIn(q)
  const dist = distanceIn(q)
  if (/\bpopulation|people live|residents|census\b/i.test(q))
    return { type: 'unsupported', reason: 'Population data (e.g. WorldPop or census blocks) is not loaded in this demo, so I can’t answer that without guessing.' }
  if (/\bflood|river|inundat/i.test(q)) return { type: 'flood', kind, bufferM: dist ?? 300 }
  if (/\b(gap|gaps|underserved|insufficient|lack|lacking|without|far from|no\s+\w+\s+(nearby|within)|fewest|least)\b/i.test(q) && kind)
    return { type: 'gaps', kind, radiusM: dist ?? (kind === 'school' ? 1500 : kind === 'park' ? 800 : 3000) }
  if (/\b(density|dense|concentrat|hotspots?|cluster|highest number|most)\b/i.test(q)) return { type: 'density', kind }
  if (!kind) return { type: 'unknown' }
  if (/\b(nearest|closest)\b/i.test(q)) return { type: 'nearest', kind }
  if (dist !== null || /\bwithin|near|around\b/i.test(q)) return { type: 'within', kind, radiusM: dist ?? 2000 }
  if (/\bhow many|count|number of|total\b/i.test(q)) return { type: 'count', kind }
  return { type: 'within', kind, radiusM: 2000 }
}

export type Answer = {
  text: string
  sql: string | null
  highlight: string[] // facility ids
  overlay: FeatureCollection<Polygon> | null
  overlayStyle: 'buffer' | 'gaps' | 'density' | 'flood' | null
  list: { name: string; detail: string }[]
}

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`)
const nameOf = (f: Facility) => f.properties.name ?? `Unnamed ${KIND_LABEL[f.properties.kind][0]}`
const plural = (k: Kind, n: number) => KIND_LABEL[k][n === 1 ? 0 : 1]
const pt = (p: LngLat) => `ST_SetSRID(ST_MakePoint(${p[0].toFixed(5)}, ${p[1].toFixed(5)}), 4326)::geography`

function ofKind(data: Data, kind: Kind | null) {
  return data.facilities.features.filter((f) => !kind || f.properties.kind === kind) as Facility[]
}

export function run(intent: Intent, data: Data, at: LngLat): Answer {
  const empty: Answer = { text: '', sql: null, highlight: [], overlay: null, overlayStyle: null, list: [] }
  switch (intent.type) {
    case 'unknown':
      return { ...empty, text: 'I can find facilities within a distance, the nearest one, coverage gaps, density hotspots and flood exposure. Try one of the suggestions below.' }
    case 'unsupported':
      return { ...empty, text: intent.reason }
    case 'within': {
      const { kind, radiusM } = intent
      const hits = ofKind(data, kind)
        .map((f) => ({ f, d: turf.distance(at, f.geometry.coordinates as LngLat, { units: 'meters' }) }))
        .filter((x) => x.d <= radiusM)
        .sort((a, b) => a.d - b.d)
      return {
        text: `Found ${hits.length} ${plural(kind, hits.length)} within ${fmtDist(radiusM)} of the selected point.`,
        sql: `SELECT name, ST_Distance(geom::geography, ${pt(at)}) AS meters\nFROM facilities\nWHERE kind = '${kind}'\n  AND ST_DWithin(geom::geography, ${pt(at)}, ${radiusM})\nORDER BY meters;`,
        highlight: hits.map((h) => h.f.properties.id),
        overlay: turf.featureCollection([turf.circle(at, radiusM / 1000, { steps: 96, units: 'kilometers' })]),
        overlayStyle: 'buffer',
        list: hits.slice(0, 8).map((h) => ({ name: nameOf(h.f), detail: fmtDist(h.d) })),
      }
    }
    case 'nearest': {
      const { kind } = intent
      const ranked = ofKind(data, kind)
        .map((f) => ({ f, d: turf.distance(at, f.geometry.coordinates as LngLat, { units: 'meters' }) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
      if (!ranked.length) return { ...empty, text: `No ${KIND_LABEL[kind][1]} are loaded.` }
      return {
        text: `The nearest ${KIND_LABEL[kind][0]} is ${nameOf(ranked[0].f)}, ${fmtDist(ranked[0].d)} away.`,
        sql: `SELECT name, ST_Distance(geom::geography, ${pt(at)}) AS meters\nFROM facilities\nWHERE kind = '${kind}'\nORDER BY geom <-> ST_SetSRID(ST_MakePoint(${at[0].toFixed(5)}, ${at[1].toFixed(5)}), 4326)\nLIMIT 3;`,
        highlight: ranked.map((r) => r.f.properties.id),
        overlay: null,
        overlayStyle: null,
        list: ranked.map((r) => ({ name: nameOf(r.f), detail: fmtDist(r.d) })),
      }
    }
    case 'count': {
      const all = ofKind(data, intent.kind)
      return {
        ...empty,
        text: `There are ${all.length} ${plural(intent.kind, all.length)} in the study area (central Kansas City).`,
        sql: `SELECT count(*) FROM facilities WHERE kind = '${intent.kind}';`,
        highlight: all.map((f) => f.properties.id),
      }
    }
    case 'gaps': {
      const { kind, radiusM } = intent
      const pts = ofKind(data, kind)
      const cells = studyGrid(data)
      let gaps = 0
      for (const c of cells.features) {
        const center = turf.centroid(c).geometry.coordinates as LngLat
        const nearest = Math.min(...pts.map((p) => turf.distance(center, p.geometry.coordinates as LngLat, { units: 'meters' })))
        const isGap = nearest > radiusM
        c.properties = { value: isGap ? 1 : 0, nearest: Math.round(nearest) }
        if (isGap) gaps++
      }
      const share = (gaps / cells.features.length) * 100
      return {
        ...empty,
        text: `${gaps} of ${cells.features.length} hexagons (${share.toFixed(0)}% of the area) are more than ${fmtDist(radiusM)} from any ${KIND_LABEL[kind][0]}. They are shaded on the map.`,
        sql: `SELECT h.id\nFROM hex_grid h\nWHERE NOT EXISTS (\n  SELECT 1 FROM facilities f\n  WHERE f.kind = '${kind}'\n    AND ST_DWithin(ST_Centroid(h.geom)::geography, f.geom::geography, ${radiusM})\n);`,
        overlay: cells,
        overlayStyle: 'gaps',
      }
    }
    case 'density': {
      const pts = ofKind(data, intent.kind)
      const cells = studyGrid(data)
      let best = { n: 0, c: null as Feature<Polygon> | null }
      for (const c of cells.features) {
        const n = pts.filter((p) => turf.booleanPointInPolygon(p, c)).length
        c.properties = { value: n }
        if (n > best.n) best = { n, c }
      }
      const center = best.c ? (turf.centroid(best.c).geometry.coordinates as LngLat) : at
      const label = intent.kind ? KIND_LABEL[intent.kind][1] : 'public facilities'
      return {
        ...empty,
        text: `The densest hexagon has ${best.n} ${label}, centered near ${center[1].toFixed(3)}°N, ${Math.abs(center[0]).toFixed(3)}°W. Darker cells have more.`,
        sql: `SELECT h.id, count(f.*) AS n\nFROM hex_grid h\nLEFT JOIN facilities f\n  ON ST_Contains(h.geom, f.geom)${intent.kind ? ` AND f.kind = '${intent.kind}'` : ''}\nGROUP BY h.id\nORDER BY n DESC;`,
        overlay: cells,
        overlayStyle: 'density',
      }
    }
    case 'flood': {
      const zones = data.rivers.features
        .filter((r) => r.properties.name && /river/i.test(r.properties.name))
        .map((r) => turf.buffer(r, intent.bufferM, { units: 'meters' }))
        .filter((b): b is Feature<Polygon> => !!b && b.geometry.type === 'Polygon')
      const exposed = ofKind(data, intent.kind).filter((f) => zones.some((z) => turf.booleanPointInPolygon(f, z)))
      const label = intent.kind ? KIND_LABEL[intent.kind][1] : 'facilities'
      return {
        text: `${exposed.length} ${label} lie within ${fmtDist(intent.bufferM)} of the Missouri, Kansas or Blue rivers. This is a simple proximity estimate, not an engineering flood assessment.`,
        sql: `SELECT f.name, f.kind\nFROM facilities f\nJOIN rivers r ON ST_DWithin(f.geom::geography, r.geom::geography, ${intent.bufferM})\nWHERE r.name ILIKE '%river%'${intent.kind ? ` AND f.kind = '${intent.kind}'` : ''};`,
        highlight: exposed.map((f) => f.properties.id),
        overlay: turf.featureCollection(zones),
        overlayStyle: 'flood',
        list: exposed.slice(0, 8).map((f) => ({ name: nameOf(f), detail: KIND_LABEL[f.properties.kind][0] })),
      }
    }
  }
}

let gridCache: string | null = null
/** 600 m hexagons covering the data's bounding box (cloned per call so results don't leak). */
export function studyGrid(data: Data): FeatureCollection<Polygon, Record<string, number>> {
  if (!gridCache) {
    const bbox = turf.bbox(data.facilities)
    gridCache = JSON.stringify(turf.hexGrid(bbox, 0.6, { units: 'kilometers' }))
  }
  return JSON.parse(gridCache)
}

export const SUGGESTIONS = [
  'Show me all schools within 5 km of this location',
  'Where is the nearest hospital?',
  'Which areas lack a school within 1.5 km?',
  'Where are parks most concentrated?',
  'Which fire stations are near a river?',
  'What is the population within 2 km?',
]
