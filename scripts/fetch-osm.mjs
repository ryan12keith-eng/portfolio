// Downloads real OpenStreetMap data used by the GIS demo projects and writes
// compact GeoJSON into each project's src/data folder.
//
//   node scripts/fetch-osm.mjs
//
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
import { mkdirSync, writeFileSync } from 'node:fs'
import * as turf from '@turf/turf'

const OVERPASS = 'https://overpass-api.de/api/interpreter'
const UA = 'RyanKeithPortfolio/1.0 (https://github.com/ryan12keith-eng/portfolio)'

async function overpass(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    })
    if (res.ok) return (await res.json()).elements
    console.warn(`overpass ${res.status}, retry ${attempt}`)
    await new Promise((r) => setTimeout(r, 4000 * attempt))
  }
  throw new Error('Overpass failed')
}

const round = (c) => Math.round(c * 1e5) / 1e5
const roundCoords = (coords) => (typeof coords[0] === 'number' ? coords.map(round) : coords.map(roundCoords))

function pointsFrom(elements, kind) {
  return elements
    .map((e) => {
      const lat = e.lat ?? e.center?.lat
      const lon = e.lon ?? e.center?.lon
      if (lat == null) return null
      return turf.point([round(lon), round(lat)], { id: `${e.type[0]}${e.id}`, kind, name: e.tags?.name ?? null })
    })
    .filter(Boolean)
}

function linesFrom(elements, props = () => ({})) {
  return elements
    .filter((e) => e.geometry?.length > 1)
    .map((e) => turf.lineString(roundCoords(e.geometry.map((g) => [g.lon, g.lat])), { id: `w${e.id}`, ...props(e) }))
}

function polygonsFrom(elements, props) {
  const out = []
  for (const e of elements) {
    const g = e.geometry
    if (!g || g.length < 4) continue
    const ring = g.map((p) => [p.lon, p.lat])
    if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) continue
    let poly = turf.polygon([ring], { id: `w${e.id}`, ...props(e) })
    poly = turf.simplify(poly, { tolerance: 0.00004, highQuality: true })
    poly.geometry.coordinates = roundCoords(poly.geometry.coordinates)
    out.push(poly)
  }
  return out
}

const fc = (features) => turf.featureCollection(features)
const save = (path, data) => {
  writeFileSync(path, JSON.stringify(data))
  console.log('wrote', path, data.features.length, 'features')
}

// ---------------------------------------------------------------- GeoMind: downtown Kansas City
{
  const bbox = '39.02,-94.66,39.14,-94.50'
  const dir = 'projects/geomind/src/data'
  mkdirSync(dir, { recursive: true })
  const amenities = await overpass(`[out:json][timeout:120];
    ( nwr["amenity"="school"](${bbox}); nwr["amenity"="hospital"](${bbox});
      nwr["amenity"="library"](${bbox}); nwr["amenity"="fire_station"](${bbox});
      nwr["leisure"="park"](${bbox}); );
    out center tags;`)
  const kindOf = (t = {}) =>
    t.amenity === 'school' ? 'school' : t.amenity === 'hospital' ? 'hospital' : t.amenity === 'library' ? 'library' : t.amenity === 'fire_station' ? 'fire_station' : 'park'
  const byKind = {}
  for (const e of amenities) (byKind[kindOf(e.tags)] ??= []).push(e)
  const features = Object.entries(byKind).flatMap(([k, els]) => pointsFrom(els, k))
  // de-duplicate the same facility mapped as node + building
  const seen = new Set()
  save(
    `${dir}/facilities.json`,
    fc(features.filter((f) => {
      const key = `${f.properties.kind}|${f.properties.name ?? f.properties.id}`
      if (f.properties.name && seen.has(key)) return false
      seen.add(key)
      return true
    })),
  )
  await new Promise((r) => setTimeout(r, 3000))
  const rivers = await overpass(`[out:json][timeout:120]; way["waterway"="river"](${bbox}); out geom;`)
  save(`${dir}/rivers.json`, fc(linesFrom(rivers, (e) => ({ name: e.tags?.name ?? null }))))
}

// ---------------------------------------------------------------- LandScope: south Kansas City metro
{
  const bbox = '38.90,-94.70,38.97,-94.58'
  const dir = 'projects/landscope/src/data'
  mkdirSync(dir, { recursive: true })
  await new Promise((r) => setTimeout(r, 3000))
  const landuse = await overpass(`[out:json][timeout:120];
    way["landuse"~"^(residential|commercial|retail|industrial|farmland|grass|meadow|greenfield|brownfield|construction)$"](${bbox});
    out geom tags;`)
  let sites = polygonsFrom(landuse, (e) => ({ landuse: e.tags.landuse, name: e.tags?.name ?? null }))
  sites = sites
    .map((f) => ({ ...f, properties: { ...f.properties, area_m2: Math.round(turf.area(f)) } }))
    .filter((f) => f.properties.area_m2 > 8000 && f.properties.area_m2 < 3_000_000)
  save(`${dir}/sites.json`, fc(sites))
  await new Promise((r) => setTimeout(r, 3000))
  const roads = await overpass(`[out:json][timeout:120];
    way["highway"~"^(motorway|trunk|primary)$"](${bbox}); out geom tags;`)
  save(`${dir}/roads.json`, fc(linesFrom(roads, (e) => ({ highway: e.tags.highway, ref: e.tags?.ref ?? null, name: e.tags?.name ?? null }))))
  await new Promise((r) => setTimeout(r, 3000))
  const services = await overpass(`[out:json][timeout:120];
    ( nwr["amenity"="school"](${bbox}); nwr["amenity"="hospital"](${bbox}); );
    out center tags;`)
  const schools = services.filter((e) => e.tags?.amenity === 'school')
  const hospitals = services.filter((e) => e.tags?.amenity === 'hospital')
  save(`${dir}/services.json`, fc([...pointsFrom(schools, 'school'), ...pointsFrom(hospitals, 'hospital')]))
}
