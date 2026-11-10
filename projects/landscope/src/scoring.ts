// LandScope site metrics and suitability scoring.
// Metrics are measured with Turf.js on real OpenStreetMap geometry; scores use
// transparent, configurable rules so every number can be explained.
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'

export type Site = Feature<Polygon, { id: string; landuse: string; name: string | null; area_m2: number }>
export type Road = Feature<LineString, { id: string; highway: string; ref: string | null; name: string | null }>
export type Service = Feature<Point, { id: string; kind: 'school' | 'hospital'; name: string | null }>

export type Metrics = {
  id: string
  landuse: string
  name: string | null
  acres: number
  roadM: number
  roadName: string
  schoolM: number
  schoolName: string
  hospitalM: number
  hospitalName: string
  center: [number, number]
}

export type Target = 'residential' | 'commercial' | 'industrial'
export type Weights = { size: number; road: number; services: number; zoning: number }
export const DEFAULT_WEIGHTS: Weights = { size: 25, road: 25, services: 25, zoning: 25 }

export const ZONING_FIT: Record<Target, Record<string, number>> = {
  residential: { farmland: 1, meadow: 1, greenfield: 1, grass: 0.85, construction: 0.8, residential: 0.65, brownfield: 0.6, commercial: 0.35, retail: 0.35, industrial: 0.1 },
  commercial: { retail: 1, commercial: 1, brownfield: 0.85, construction: 0.7, grass: 0.6, meadow: 0.55, greenfield: 0.55, industrial: 0.5, farmland: 0.4, residential: 0.2 },
  industrial: { industrial: 1, brownfield: 1, meadow: 0.6, farmland: 0.6, construction: 0.6, grass: 0.5, greenfield: 0.5, commercial: 0.45, retail: 0.3, residential: 0 },
}
export const IDEAL_ACRES: Record<Target, [number, number]> = { residential: [5, 60], commercial: [2, 25], industrial: [10, 120] }

const M2_PER_ACRE = 4046.86
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const roadLabel = (r: Road) => (r.properties.ref ?? r.properties.name ?? r.properties.highway).replace(/;/g, ' / ')

/** Measures every site once: area, and distance from its centroid to the nearest major road, school and hospital. */
export function computeMetrics(sites: FeatureCollection<Polygon>, roads: FeatureCollection<LineString>, services: FeatureCollection<Point>): Metrics[] {
  const roadList = roads.features as Road[]
  // coarse index: every road vertex, to shortlist candidate roads before exact point-to-line distance
  const vertices = roadList.flatMap((r, i) => r.geometry.coordinates.map((c) => ({ c: c as [number, number], i })))
  const svc = services.features as Service[]
  return (sites.features as Site[]).map((s) => {
    const center = turf.centroid(s).geometry.coordinates as [number, number]
    const cand = new Map<number, number>()
    for (const v of vertices) {
      const d = turf.distance(center, v.c, { units: 'meters' })
      if (!cand.has(v.i) || d < cand.get(v.i)!) cand.set(v.i, d)
    }
    const shortlist = [...cand.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4)
    let road = { d: Infinity, name: '—' }
    for (const [i] of shortlist) {
      const d = turf.pointToLineDistance(center, roadList[i], { units: 'meters' })
      if (d < road.d) road = { d, name: roadLabel(roadList[i]) }
    }
    const nearest = (kind: 'school' | 'hospital') => {
      let best = { d: Infinity, name: '—' }
      for (const p of svc) {
        if (p.properties.kind !== kind) continue
        const d = turf.distance(center, p.geometry.coordinates as [number, number], { units: 'meters' })
        if (d < best.d) best = { d, name: p.properties.name ?? `Unnamed ${kind}` }
      }
      return best
    }
    const school = nearest('school')
    const hospital = nearest('hospital')
    return {
      id: s.properties.id,
      landuse: s.properties.landuse,
      name: s.properties.name,
      acres: Math.round((s.properties.area_m2 / M2_PER_ACRE) * 10) / 10,
      roadM: Math.round(road.d),
      roadName: road.name,
      schoolM: Math.round(school.d),
      schoolName: school.name,
      hospitalM: Math.round(hospital.d),
      hospitalName: hospital.name,
      center,
    }
  })
}

export type Score = { total: number; parts: Record<keyof Weights, number> }

export function sizeScore(acres: number, target: Target) {
  const [min, max] = IDEAL_ACRES[target]
  return acres < min ? clamp01(acres / min) : acres > max ? clamp01(max / acres) : 1
}
/** 1 within 200 m of a major road, falling to 0 at 3 km. */
export const roadScore = (m: number) => clamp01(1 - (m - 200) / 2800)
/** Residential sites value nearby schools and hospitals; others mainly hospitals/emergency access. */
export function servicesScore(m: Pick<Metrics, 'schoolM' | 'hospitalM'>, target: Target) {
  const school = clamp01(1 - (m.schoolM - 500) / 4500)
  const hospital = clamp01(1 - (m.hospitalM - 1000) / 9000)
  return target === 'residential' ? 0.65 * school + 0.35 * hospital : hospital
}
export const zoningScore = (landuse: string, target: Target) => ZONING_FIT[target][landuse] ?? 0.3

export function scoreSite(m: Metrics, target: Target, w: Weights): Score {
  const parts = {
    size: sizeScore(m.acres, target),
    road: roadScore(m.roadM),
    services: servicesScore(m, target),
    zoning: zoningScore(m.landuse, target),
  }
  const sumW = w.size + w.road + w.services + w.zoning
  const total = sumW === 0 ? 0 : (parts.size * w.size + parts.road * w.road + parts.services * w.services + parts.zoning * w.zoning) / sumW
  return { total: Math.round(total * 100), parts }
}

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)

/** Plain-language assessment built from the measured facts and the score breakdown. */
export function assess(m: Metrics, s: Score, target: Target) {
  const opportunities: string[] = []
  const constraints: string[] = []
  if (s.parts.size >= 0.9) opportunities.push(`${m.acres} acres is within the typical range for ${target} projects`)
  else if (m.acres < IDEAL_ACRES[target][0]) constraints.push(`At ${m.acres} acres the site is small for ${target} use (typical ${IDEAL_ACRES[target][0]}+ acres)`)
  else constraints.push(`At ${m.acres} acres the site is larger than typical; consider phasing or subdividing`)
  if (s.parts.road >= 0.75) opportunities.push(`Major road access: ${fmtM(m.roadM)} to ${m.roadName}`)
  else if (s.parts.road <= 0.4) constraints.push(`Far from major roads (${fmtM(m.roadM)} to ${m.roadName})`)
  if (target === 'residential') {
    if (m.schoolM <= 1500) opportunities.push(`School within ${fmtM(m.schoolM)} (${m.schoolName})`)
    else constraints.push(`Nearest school is ${fmtM(m.schoolM)} away`)
  }
  if (m.hospitalM <= 5000) opportunities.push(`Hospital within ${fmtM(m.hospitalM)} (${m.hospitalName})`)
  if (s.parts.zoning >= 0.8) opportunities.push(`Current land use (${m.landuse}) suits ${target} development`)
  else if (s.parts.zoning <= 0.4) constraints.push(`Current land use (${m.landuse}) would likely need rezoning for ${target} use`)
  const missing = ['Terrain slope (needs a DEM)', 'Utility capacity', 'Official parcel boundaries and zoning code']
  return { opportunities, constraints, missing }
}
