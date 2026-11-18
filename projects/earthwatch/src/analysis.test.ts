import { describe, expect, it } from 'vitest'
import { classify, detectChange, landCover, vari, variColor, variHistogram } from './analysis'

const px = (...rgb: [number, number, number][]) => new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255]))

const FOREST: [number, number, number] = [40, 90, 35]
const FLOOD: [number, number, number] = [190, 150, 90]
const RIVER: [number, number, number] = [30, 70, 110]
const CLOUD: [number, number, number] = [235, 238, 240]

describe('classify', () => {
  it('labels typical pixels', () => {
    expect(classify(...FOREST)).toBe('vegetation')
    expect(classify(...FLOOD)).toBe('sediment')
    expect(classify(...RIVER)).toBe('water')
    expect(classify(...CLOUD)).toBe('cloud')
  })
})

describe('vari', () => {
  it('is positive for vegetation and negative for bare sediment', () => {
    expect(vari(...FOREST)).toBeGreaterThan(0.3)
    expect(vari(...FLOOD)).toBeLessThan(0)
    expect(vari(0, 0, 0)).toBe(0)
  })
  it('maps to a brown-to-green ramp', () => {
    expect(variColor(-1)).toEqual([140, 81, 10])
    expect(variColor(1)).toEqual([26, 152, 80])
  })
})

describe('landCover', () => {
  it('counts each class', () => {
    const s = landCover(px(FOREST, FOREST, FLOOD, RIVER, CLOUD))
    expect(s.total).toBe(5)
    expect(s.counts).toEqual({ vegetation: 2, sediment: 1, water: 1, cloud: 1 })
  })
})

describe('detectChange', () => {
  it('flags forest that became flood water, and masks clouds', () => {
    const before = px(FOREST, FOREST, RIVER, FOREST)
    const after = px(FLOOD, FOREST, RIVER, CLOUD)
    const c = detectChange(before, after)
    expect(c.flooded).toBe(1)
    expect(c.cloudMasked).toBe(1)
    expect(c.vegetationLoss).toBe(0)
    expect(Array.from(c.mask.slice(0, 4))).toEqual([255, 106, 0, 200])
    expect(Array.from(c.mask.slice(4, 8))).toEqual([0, 0, 0, 0])
  })
  it('ignores small color shifts below the threshold', () => {
    expect(detectChange(px(FOREST), px([48, 96, 40])).flooded).toBe(0)
  })
  it('rejects images of different sizes', () => {
    expect(() => detectChange(px(FOREST), px(FOREST, FOREST))).toThrow()
  })
})

describe('variHistogram', () => {
  it('bins values and skips clouds', () => {
    const h = variHistogram(px(FOREST, FLOOD, CLOUD), 10)
    expect(h.reduce((a, b) => a + b, 0)).toBe(2)
  })
})
