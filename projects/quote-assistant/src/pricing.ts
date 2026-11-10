// Deterministic, unit-tested pricing rules. The AI never sets a price:
// it only drafts specs, and every number below comes from these rules.

export type PriceInput = {
  quantity: number
  size: string // "8.5 × 11 in"
  stock: string // "100# Gloss Text", "14 pt Cover"
  colors: string // "4/4", "4/0", "1/1", "1/0"
  finishing: string[]
  dueDate: string | null // yyyy-mm-dd
  today?: Date
}

export type Line = { label: string; amount: number }
export type Quote = { lines: Line[]; subtotal: number; total: number; unitPrice: number; sheets: number; up: number; rush: boolean; businessDays: number | null }

export const PRESS_SHEET = { w: 12, h: 18 } // inches
export const SPOILAGE = 0.05
const SETUP: Record<string, number> = { '4/4': 90, '4/0': 60, '1/1': 50, '1/0': 40 }
const CLICK: Record<string, number> = { '4/4': 0.18, '4/0': 0.1, '1/1': 0.05, '1/0': 0.03 }

const cents = (n: number) => Math.round(n * 100) / 100

export function parseSize(size: string): { w: number; h: number } | null {
  const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/.exec(size)
  return m ? { w: +m[1], h: +m[2] } : null
}

/** How many finished pieces fit on one press sheet (best of the two orientations). */
export function piecesPerSheet(w: number, h: number) {
  const a = Math.floor(PRESS_SHEET.w / w) * Math.floor(PRESS_SHEET.h / h)
  const b = Math.floor(PRESS_SHEET.w / h) * Math.floor(PRESS_SHEET.h / w)
  return Math.max(a, b, 1)
}

/** Paper cost per press sheet, from the stock description. */
export function paperCost(stock: string) {
  const pt = /(\d{1,2})\s*pt/i.exec(stock)
  if (pt) return 0.012 * +pt[1]
  const lb = /(\d{2,3})\s*(?:#|lb)/i.exec(stock)
  if (lb) return /cover/i.test(stock) ? 0.1 + 0.0012 * +lb[1] : 0.06 + 0.0008 * +lb[1]
  return 0.12
}

/** Business days from `from` (exclusive) to `to` (inclusive), skipping weekends. */
export function businessDaysBetween(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  let days = 0
  for (const d = new Date(start); d < end; ) {
    d.setDate(d.getDate() + 1)
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) days++
  }
  return days
}

export function priceQuote(input: PriceInput): Quote {
  const size = parseSize(input.size)
  if (!size) throw new Error('Size must look like "8.5 × 11 in"')
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be a positive whole number')
  if (!(input.colors in CLICK)) throw new Error('Colors must be 4/4, 4/0, 1/1 or 1/0')

  const up = piecesPerSheet(size.w, size.h)
  const sheets = Math.ceil(Math.ceil(input.quantity / up) * (1 + SPOILAGE))
  const lines: Line[] = [
    { label: `Setup & plates (${input.colors})`, amount: SETUP[input.colors] },
    { label: `Paper: ${sheets} sheets × $${paperCost(input.stock).toFixed(3)}`, amount: sheets * paperCost(input.stock) },
    { label: `Printing: ${sheets} sheets × $${CLICK[input.colors].toFixed(2)}`, amount: sheets * CLICK[input.colors] },
  ]

  const has = (re: RegExp) => input.finishing.some((f) => re.test(f))
  if (has(/aqueous/i)) lines.push({ label: 'Aqueous coating', amount: sheets * 0.02 })
  if (has(/uv/i)) lines.push({ label: 'UV coating', amount: sheets * 0.04 })
  if (has(/lamination/i)) lines.push({ label: 'Lamination', amount: sheets * 0.15 })
  if (has(/fold/i)) lines.push({ label: 'Folding', amount: 20 + input.quantity * 0.015 })
  if (has(/saddle/i)) lines.push({ label: 'Saddle stitch', amount: input.quantity * 0.12 })
  if (has(/perfect/i)) lines.push({ label: 'Perfect binding', amount: 75 + input.quantity * 0.6 })
  if (has(/die cut/i)) lines.push({ label: 'Die cut (die + run)', amount: 150 + input.quantity * 0.01 })
  if (has(/round corners/i)) lines.push({ label: 'Round corners', amount: input.quantity * 0.01 })

  const variable = lines.slice(1).reduce((s, l) => s + l.amount, 0)
  const discountRate = input.quantity >= 10000 ? 0.12 : input.quantity >= 5000 ? 0.08 : 0
  if (discountRate) lines.push({ label: `Volume discount (${discountRate * 100}%)`, amount: -variable * discountRate })

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const businessDays = input.dueDate ? businessDaysBetween(input.today ?? new Date(), new Date(`${input.dueDate}T12:00:00`)) : null
  const rush = businessDays !== null && businessDays < 5
  if (rush) lines.push({ label: 'Rush (under 5 business days, +25%)', amount: subtotal * 0.25 })

  const rounded = lines.map((l) => ({ ...l, amount: cents(l.amount) }))
  const total = cents(rounded.reduce((s, l) => s + l.amount, 0))
  return { lines: rounded, subtotal: cents(subtotal), total, unitPrice: cents(total / input.quantity), sheets, up, rush, businessDays }
}
