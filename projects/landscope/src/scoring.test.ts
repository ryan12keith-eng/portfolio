import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import { DEFAULT_WEIGHTS, assess, computeMetrics, roadScore, scoreSite, sizeScore, zoningScore } from './scoring'
import type { Metrics } from './scoring'

const base: Metrics = { id: 's', landuse: 'meadow', name: null, acres: 20, roadM: 150, roadName: 'I-435', schoolM: 600, schoolName: 'Oak Elementary', hospitalM: 2500, hospitalName: 'Mercy', center: [-94.6, 38.93] }

describe('scoring rules', () => {
  it('rewards sizes inside the ideal range', () => {
    expect(sizeScore(20, 'residential')).toBe(1)
    expect(sizeScore(2.5, 'residential')).toBe(0.5)
    expect(sizeScore(120, 'residential')).toBe(0.5)
  })
  it('scales road access from 200 m to 3 km', () => {
    expect(roadScore(100)).toBe(1)
    expect(roadScore(1600)).toBe(0.5)
    expect(roadScore(5000)).toBe(0)
  })
  it('looks up land-use fit per target', () => {
    expect(zoningScore('industrial', 'industrial')).toBe(1)
    expect(zoningScore('residential', 'industrial')).toBe(0)
    expect(zoningScore('unknown', 'commercial')).toBe(0.3)
  })
  it('combines parts with weights', () => {
    expect(scoreSite(base, 'residential', DEFAULT_WEIGHTS).total).toBeGreaterThan(90)
    const worse = scoreSite({ ...base, roadM: 5000 }, 'residential', { size: 0, road: 100, services: 0, zoning: 0 })
    expect(worse.total).toBe(0)
    expect(scoreSite(base, 'residential', { size: 0, road: 0, services: 0, zoning: 0 }).total).toBe(0)
  })
  it('explains opportunities, constraints and missing data', () => {
    const a = assess(base, scoreSite(base, 'residential', DEFAULT_WEIGHTS), 'residential')
    expect(a.opportunities.join(' ')).toContain('I-435')
    expect(a.missing.length).toBeGreaterThan(0)
    const small = { ...base, acres: 1 }
    expect(assess(small, scoreSite(small, 'residential', DEFAULT_WEIGHTS), 'residential').constraints[0]).toMatch(/small/)
  })
})

describe('computeMetrics', () => {
  it('measures area and distances on real geometry', () => {
    const square = turf.polygon([[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]], { id: 'p', landuse: 'meadow', name: null, area_m2: 12300 })
    const road = turf.lineString([[0.0005, 0.003], [0.0005, 0.01]], { id: 'r', highway: 'primary', ref: 'US-69', name: null })
    const school = turf.point([0.0005, 0.0005], { id: 'k', kind: 'school', name: 'On-site School' })
    const hosp = turf.point([0.02, 0.0005], { id: 'h', kind: 'hospital', name: 'Far Hospital' })
    const [m] = computeMetrics(turf.featureCollection([square]), turf.featureCollection([road]), turf.featureCollection([school, hosp]))
    expect(m.acres).toBeCloseTo(3.0, 1)
    expect(m.roadName).toBe('US-69')
    expect(m.roadM).toBeGreaterThan(270)
    expect(m.roadM).toBeLessThan(290)
    expect(m.schoolM).toBe(0)
    expect(m.hospitalName).toBe('Far Hospital')
  })
})
