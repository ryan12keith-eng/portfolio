// Extracts structured print specs from a free-text quote request.
// Rule-based so the demo runs offline; in production the same `Specs` shape is
// what an LLM returns (validated by a schema) before this app's checks run.

export type Confidence = 'high' | 'low' | 'missing'
export type Field<T> = { value: T | null; confidence: Confidence; span?: [number, number] }

export type Specs = {
  quantity: Field<number>
  product: Field<string>
  size: Field<string>
  stock: Field<string>
  colors: Field<string>
  finishing: Field<string[]>
  dueDate: Field<string>
}

const PRODUCTS: [RegExp, string][] = [
  [/business\s+cards?/i, 'Business cards'],
  [/brochures?/i, 'Brochure'],
  [/flyers?|fliers?/i, 'Flyer'],
  [/postcards?/i, 'Postcard'],
  [/booklets?|catalog(?:ue)?s?/i, 'Booklet'],
  [/posters?/i, 'Poster'],
  [/door\s*hangers?/i, 'Door hanger'],
]
const FOLDS: [RegExp, string][] = [
  [/tri[\s-]?fold/i, 'tri-fold'],
  [/bi[\s-]?fold|half[\s-]?fold/i, 'bi-fold'],
  [/z[\s-]?fold/i, 'z-fold'],
]
const NAMED_SIZES: [RegExp, string][] = [
  [/\btabloid\b/i, '11 × 17 in'],
  [/\bletter[\s-]?size\b/i, '8.5 × 11 in'],
  [/\bA4\b/, '8.27 × 11.69 in'],
  [/\bA5\b/, '5.83 × 8.27 in'],
]
const FINISHES: [RegExp, string][] = [
  [/aqueous/i, 'Aqueous coating'],
  [/\bUV\b(?:\s*coat(?:ing)?)?/i, 'UV coating'],
  [/matte?\s+lam(?:inat(?:e|ion|ed))?/i, 'Matte lamination'],
  [/gloss\s+lam(?:inat(?:e|ion|ed))?/i, 'Gloss lamination'],
  [/saddle[\s-]?stitch(?:ed|ing)?/i, 'Saddle stitch'],
  [/perfect[\s-]?bound|perfect\s+binding/i, 'Perfect binding'],
  [/die[\s-]?cut/i, 'Die cut'],
  [/round(?:ed)?\s+corners?/i, 'Round corners'],
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const HEDGES = /\?|if possible|if it'?s not|maybe|not sure|might|possibly|ideally|optional/i

/** The sentence containing `index`, used to decide whether a value was stated firmly. */
function sentenceAt(text: string, index: number) {
  const start = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('\n', index - 1)) + 1
  const ends = ['.', '\n', '!'].map((c) => text.indexOf(c, index)).filter((n) => n >= 0)
  const end = ends.length ? Math.min(...ends) + 1 : text.length
  return text.slice(start, end)
}

const firm = (text: string, index: number): Confidence => (HEDGES.test(sentenceAt(text, index)) ? 'low' : 'high')
const missing = <T,>(): Field<T> => ({ value: null, confidence: 'missing' })
const span = (m: RegExpExecArray): [number, number] => [m.index, m.index + m[0].length]

function parseQuantity(text: string): Field<number> {
  const productWords = 'business\\s+cards?|brochures?|flyers?|fliers?|postcards?|booklets?|catalog(?:ue)?s?|posters?|door\\s*hangers?|copies|pieces|pcs|units|sheets'
  const before = new RegExp(`(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?\\s?k|\\d+)\\s*(?:x\\s*)?(?:[a-z-]+\\s+){0,3}?(?:${productWords})\\b`, 'i')
  const labeled = /\b(?:qty|quantity|quantities|run of)\s*(?:of|:|=)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?k|\d+)/i
  const m = before.exec(text) ?? labeled.exec(text)
  if (!m) return missing()
  const raw = m[1].replace(/,/g, '').trim().toLowerCase()
  const value = raw.endsWith('k') ? Math.round(parseFloat(raw) * 1000) : parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) return missing()
  return { value, confidence: firm(text, m.index), span: [m.index, m.index + m[1].length] }
}

function parseProduct(text: string): Field<string> {
  for (const [re, name] of PRODUCTS) {
    const m = re.exec(text)
    if (!m) continue
    const fold = FOLDS.find(([f]) => f.test(text))
    return { value: fold ? `${name} · ${fold[1]}` : name, confidence: firm(text, m.index), span: span(m) }
  }
  return missing()
}

function parseSize(text: string): Field<string> {
  const m = /(\d+(?:\.\d+)?)\s*(?:"|''|in(?:ch(?:es)?)?\b)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:"|''|in(?:ch(?:es)?)?\b)?/i.exec(text)
  if (m) return { value: `${m[1]} × ${m[2]} in`, confidence: firm(text, m.index), span: span(m) }
  for (const [re, size] of NAMED_SIZES) {
    const n = re.exec(text)
    if (n) return { value: size, confidence: 'low', span: span(n) }
  }
  return missing()
}

function parseStock(text: string): Field<string> {
  const lb = /(\d{2,3})\s*(?:#|lb\.?|lbs?\.?|pound)\s*(gloss|matte?|silk|dull|uncoated)?\s*(text|cover|book)?/i.exec(text)
  if (lb) {
    const finish = lb[2] ? lb[2][0].toUpperCase() + lb[2].slice(1).toLowerCase() : 'Gloss'
    const weight = lb[3] ? lb[3][0].toUpperCase() + lb[3].slice(1).toLowerCase() : 'Text'
    const inferred = !lb[2] || !lb[3]
    return { value: `${lb[1]}# ${finish} ${weight}`, confidence: inferred ? 'low' : firm(text, lb.index), span: span(lb) }
  }
  const pt = /(\d{1,2})\s*pt\b(?:\s*(gloss|matte?|uncoated))?(?:\s*cover)?/i.exec(text)
  if (pt) return { value: `${pt[1]} pt ${pt[2] ? pt[2][0].toUpperCase() + pt[2].slice(1).toLowerCase() + ' ' : ''}Cover`, confidence: firm(text, pt.index), span: span(pt) }
  return missing()
}

function parseColors(text: string): Field<string> {
  const both = /both sides|double[\s-]?sided|two[\s-]?sided|front and back|2[\s-]?sided/i.test(text)
  const explicit = /\b([14])\s*\/\s*([014])\b/.exec(text)
  if (explicit) return { value: `${explicit[1]}/${explicit[2]}`, confidence: 'high', span: span(explicit) }
  const full = /full[\s-]?colou?r|four[\s-]?colou?r|\bcmyk\b|\bcolou?r\b/i.exec(text)
  if (full) return { value: both ? '4/4' : '4/0', confidence: both || /full|four|cmyk/i.test(full[0]) ? firm(text, full.index) : 'low', span: span(full) }
  const bw = /black\s*(?:and|&)\s*white|\bb\s*&\s*w\b|grayscale|greyscale|one[\s-]?colou?r/i.exec(text)
  if (bw) return { value: both ? '1/1' : '1/0', confidence: firm(text, bw.index), span: span(bw) }
  return missing()
}

function parseFinishing(text: string): Field<string[]> {
  const found: string[] = []
  let confidence: Confidence = 'high'
  let first: [number, number] | undefined
  for (const [re, name] of FINISHES) {
    const m = re.exec(text)
    if (!m) continue
    found.push(name)
    first ??= span(m)
    if (firm(text, m.index) === 'low') confidence = 'low'
  }
  const fold = FOLDS.find(([f]) => f.test(text))
  if (fold) found.push(`Folding (${fold[1]})`)
  return found.length ? { value: found, confidence, span: first } : { value: [], confidence: 'high' }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Puts a month/day in the future: if it has already passed this year, use next year. */
function nextOccurrence(month: number, day: number, today: Date) {
  const d = new Date(today.getFullYear(), month, day)
  if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d.setFullYear(d.getFullYear() + 1)
  return d
}

function parseDue(text: string, today: Date): Field<string> {
  const isoM = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text)
  if (isoM) return { value: isoM[0], confidence: firm(text, isoM.index), span: span(isoM) }
  const named = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i').exec(text)
  if (named) {
    const d = nextOccurrence(MONTHS.indexOf(named[1].toLowerCase().slice(0, 3)), +named[2], today)
    return { value: iso(d), confidence: firm(text, named.index), span: span(named) }
  }
  // m/d dates, skipping color specs such as 4/4 or 4/0
  const slash = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)].find(
    (m) => +m[1] >= 1 && +m[1] <= 12 && !/^[014]\/[014]$/.test(m[0]),
  ) as RegExpExecArray | undefined
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + +slash[3] : +slash[3]) : null
    const d = year ? new Date(year, +slash[1] - 1, +slash[2]) : nextOccurrence(+slash[1] - 1, +slash[2], today)
    return { value: iso(d), confidence: firm(text, slash.index), span: span(slash) }
  }
  const weeks = /\bin\s+(\d|two|three|four)\s+weeks?\b/i.exec(text)
  if (weeks) {
    const n = { two: 2, three: 3, four: 4 }[weeks[1].toLowerCase() as 'two'] ?? +weeks[1]
    const d = new Date(today)
    d.setDate(d.getDate() + n * 7)
    return { value: iso(d), confidence: 'low', span: span(weeks) }
  }
  const asap = /\b(asap|rush|urgent)\b/i.exec(text)
  if (asap) {
    const d = new Date(today)
    d.setDate(d.getDate() + 3)
    return { value: iso(d), confidence: 'low', span: span(asap) }
  }
  return missing()
}

export function parseRequest(text: string, today = new Date()): Specs {
  return {
    quantity: parseQuantity(text),
    product: parseProduct(text),
    size: parseSize(text),
    stock: parseStock(text),
    colors: parseColors(text),
    finishing: parseFinishing(text),
    dueDate: parseDue(text, today),
  }
}
