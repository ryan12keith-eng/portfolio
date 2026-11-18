import { describe, expect, it } from 'vitest'
import { businessDaysBetween, piecesPerSheet, priceQuote } from './pricing'

const today = new Date(2026, 10, 2) // Mon 2 Nov 2026
const base = { quantity: 1000, size: '4 × 6 in', stock: '14 pt Cover', colors: '4/4', finishing: [], dueDate: '2026-12-15', today }

describe('pricing rules', () => {
  it('imposes pieces on a 12 × 18 press sheet in the best orientation', () => {
    expect(piecesPerSheet(4, 6)).toBe(9)
    expect(piecesPerSheet(8.5, 11)).toBe(2)
    expect(piecesPerSheet(24, 36)).toBe(1)
  })

  it('prices a known postcard job exactly', () => {
    const q = priceQuote(base)
    expect(q.up).toBe(9)
    expect(q.sheets).toBe(118) // ceil(ceil(1000 / 9) × 1.05)
    expect(q.lines.map((l) => l.amount)).toEqual([90, 19.82, 21.24])
    expect(q.total).toBe(131.06)
    expect(q.unitPrice).toBe(0.13)
    expect(q.rush).toBe(false)
  })

  it('applies the volume discount at 5,000+', () => {
    const q = priceQuote({ ...base, quantity: 5000 })
    expect(q.lines.some((l) => l.label.startsWith('Volume discount (8%)'))).toBe(true)
  })

  it('adds a 25% rush fee under 5 business days', () => {
    const q = priceQuote({ ...base, dueDate: '2026-11-05' })
    expect(q.businessDays).toBe(3)
    expect(q.rush).toBe(true)
    expect(q.total).toBeCloseTo(131.06 * 1.25, 1)
  })

  it('counts business days, skipping weekends', () => {
    expect(businessDaysBetween(today, new Date(2026, 10, 6))).toBe(4)
    expect(businessDaysBetween(today, new Date(2026, 10, 9))).toBe(5)
  })

  it('rejects invalid input instead of producing a price', () => {
    expect(() => priceQuote({ ...base, quantity: 0 })).toThrow()
    expect(() => priceQuote({ ...base, size: 'big' })).toThrow()
    expect(() => priceQuote({ ...base, colors: '6/6' })).toThrow()
  })
})
