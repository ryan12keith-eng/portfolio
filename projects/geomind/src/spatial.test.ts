import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import { distanceIn, parseQuestion, run } from './spatial'
import type { Data, Kind } from './spatial'

const at: [number, number] = [-94.58, 39.1]
// points roughly 1 km, 3 km and 6 km east of `at`
const east = (km: number): [number, number] => turf.destination(at, km, 90, { units: 'kilometers' }).geometry.coordinates as [number, number]
const data: Data = {
  facilities: turf.featureCollection([
    turf.point(east(1), { id: 'a', kind: 'school' as Kind, name: 'Near School' }),
    turf.point(east(3), { id: 'b', kind: 'school' as Kind, name: 'Mid School' }),
    turf.point(east(6), { id: 'c', kind: 'school' as Kind, name: 'Far School' }),
    turf.point(east(2), { id: 'h', kind: 'hospital' as Kind, name: 'General Hospital' }),
  ]) as Data['facilities'],
  rivers: turf.featureCollection([turf.lineString([east(0.95), turf.destination(east(0.95), 1, 0).geometry.coordinates], { name: 'Test River' })]) as Data['rivers'],
}

describe('parseQuestion', () => {
  it('understands distance queries', () => {
    expect(parseQuestion('Show me all schools within 5 km of this location')).toEqual({ type: 'within', kind: 'school', radiusM: 5000 })
    expect(parseQuestion('hospitals within 2 miles')).toEqual({ type: 'within', kind: 'hospital', radiusM: 3219 })
  })
  it('understands nearest, gaps, density and flood questions', () => {
    expect(parseQuestion('Where is the nearest hospital?').type).toBe('nearest')
    expect(parseQuestion('Which areas lack a school within 1.5 km?')).toEqual({ type: 'gaps', kind: 'school', radiusM: 1500 })
    expect(parseQuestion('Where are parks most concentrated?')).toEqual({ type: 'density', kind: 'park' })
    expect(parseQuestion('Which fire stations are near a river?')).toMatchObject({ type: 'flood', kind: 'fire_station' })
  })
  it('refuses questions it has no data for instead of inventing an answer', () => {
    expect(parseQuestion('What is the population within 2 km?').type).toBe('unsupported')
    expect(parseQuestion('tell me a joke').type).toBe('unknown')
  })
  it('parses units', () => {
    expect(distanceIn('800 m')).toBe(800)
    expect(distanceIn('1.5km')).toBe(1500)
    expect(distanceIn('no distance')).toBeNull()
  })
})

describe('run', () => {
  it('returns only facilities inside the radius, nearest first, with SQL', () => {
    const a = run({ type: 'within', kind: 'school', radiusM: 4000 }, data, at)
    expect(a.highlight).toEqual(['a', 'b'])
    expect(a.list[0].name).toBe('Near School')
    expect(a.sql).toContain('ST_DWithin')
    expect(a.overlayStyle).toBe('buffer')
  })
  it('finds the nearest facility', () => {
    expect(run({ type: 'nearest', kind: 'hospital' }, data, at).text).toContain('General Hospital')
  })
  it('flags river-adjacent facilities', () => {
    expect(run({ type: 'flood', kind: null, bufferM: 300 }, data, at).highlight).toEqual(['a'])
  })
  it('explains unsupported questions', () => {
    expect(run({ type: 'unsupported', reason: 'no data' }, data, at)).toMatchObject({ text: 'no data', sql: null })
  })
})
