import { describe, expect, it } from 'vitest'
import { parseRequest } from './parser'

const today = new Date(2026, 10, 2) // Mon 2 Nov 2026

describe('parseRequest', () => {
  const email = `Hi team, could you quote 2,500 tri-fold brochures, 8.5 x 11, 100# gloss text, full color both sides.
Need them by Nov 20. Aqueous coat? if it's not too much extra. Thanks!`
  const specs = parseRequest(email, today)

  it('extracts firm values with high confidence', () => {
    expect(specs.quantity).toMatchObject({ value: 2500, confidence: 'high' })
    expect(specs.product.value).toBe('Brochure · tri-fold')
    expect(specs.size.value).toBe('8.5 × 11 in')
    expect(specs.stock).toMatchObject({ value: '100# Gloss Text', confidence: 'high' })
    expect(specs.colors).toMatchObject({ value: '4/4', confidence: 'high' })
    expect(specs.dueDate).toMatchObject({ value: '2026-11-20', confidence: 'high' })
  })

  it('flags hedged requests as low confidence', () => {
    expect(specs.finishing.value).toContain('Aqueous coating')
    expect(specs.finishing.value).toContain('Folding (tri-fold)')
    expect(specs.finishing.confidence).toBe('low')
  })

  it('reports missing fields instead of guessing', () => {
    const s = parseRequest('Can you send me a price for some flyers?', today)
    expect(s.quantity.confidence).toBe('missing')
    expect(s.size.confidence).toBe('missing')
    expect(s.product.value).toBe('Flyer')
  })

  it('handles shorthand quantities, pt stock, one-sided color and m/d dates', () => {
    const s = parseRequest('Need 5k postcards 4x6 on 14pt cover, color front only, 4/0. Due 12/3.', today)
    expect(s.quantity.value).toBe(5000)
    expect(s.size.value).toBe('4 × 6 in')
    expect(s.stock.value).toBe('14 pt Cover')
    expect(s.colors.value).toBe('4/0')
    expect(s.dueDate.value).toBe('2026-12-03')
  })

  it('rolls past dates into next year', () => {
    expect(parseRequest('500 flyers by Jan 15', today).dueDate.value).toBe('2027-01-15')
  })
})
