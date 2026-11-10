// Pixel-level analysis of two co-registered RGB satellite images.
// Runs in the browser on canvas ImageData; pure functions so they are unit-tested.
//
// These NASA Earth Observatory images are true-color (red, green, blue only), so
// vegetation uses VARI, a visible-band index. NDVI needs a near-infrared band
// (Sentinel-2 B8 or Landsat B5), which is what the production pipeline would use.

export const CLASSES = ['water', 'vegetation', 'sediment', 'cloud'] as const
export type LandClass = (typeof CLASSES)[number]
export const CLASS_COLORS: Record<LandClass, [number, number, number]> = {
  water: [37, 99, 235],
  vegetation: [34, 160, 80],
  sediment: [214, 150, 60],
  cloud: [226, 232, 240],
}

/** Visible Atmospherically Resistant Index: (G − R) / (G + R − B), clamped to −1..1. */
export function vari(r: number, g: number, b: number) {
  const d = g + r - b
  if (Math.abs(d) < 1) return 0
  return Math.max(-1, Math.min(1, (g - r) / d))
}

/** Rule-based classifier tuned for true-color tropical river imagery. */
export function classify(r: number, g: number, b: number): LandClass {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (min > 175 && max - min < 40) return 'cloud'
  if (b >= r && b + 12 >= g) return 'water'
  if (r > g * 0.92 && r > b + 22) return 'sediment'
  if (g >= r) return 'vegetation'
  return 'sediment'
}

export type Stats = { total: number; counts: Record<LandClass, number> }

export function landCover(px: Uint8ClampedArray): Stats {
  const counts: Record<LandClass, number> = { water: 0, vegetation: 0, sediment: 0, cloud: 0 }
  for (let i = 0; i < px.length; i += 4) counts[classify(px[i], px[i + 1], px[i + 2])]++
  return { total: px.length / 4, counts }
}

export type Change = {
  /** RGBA overlay: orange where land turned to sediment/flood water, red where vegetation was lost. */
  mask: Uint8ClampedArray
  flooded: number
  vegetationLoss: number
  vegetationGain: number
  cloudMasked: number
  total: number
}

/**
 * Compares before/after pixels. A pixel counts as newly flooded when it was
 * vegetation before and is sediment-laden water after; clouds in either image are masked out.
 * `sensitivity` (0–1) lowers the brightness-change threshold.
 */
export function detectChange(before: Uint8ClampedArray, after: Uint8ClampedArray, sensitivity = 0.5): Change {
  if (before.length !== after.length) throw new Error('Images must be the same size')
  const mask = new Uint8ClampedArray(before.length)
  const minDelta = 60 - sensitivity * 50 // RGB distance needed to count as change
  let flooded = 0
  let loss = 0
  let gain = 0
  let clouds = 0
  for (let i = 0; i < before.length; i += 4) {
    const a = classify(before[i], before[i + 1], before[i + 2])
    const b = classify(after[i], after[i + 1], after[i + 2])
    if (a === 'cloud' || b === 'cloud') {
      clouds++
      continue
    }
    const dr = after[i] - before[i]
    const dg = after[i + 1] - before[i + 1]
    const db = after[i + 2] - before[i + 2]
    if (Math.sqrt(dr * dr + dg * dg + db * db) < minDelta) continue
    if (a === 'vegetation' && (b === 'sediment' || b === 'water')) {
      flooded++
      mask.set([255, 106, 0, 200], i)
    } else if (a === 'vegetation' && b !== 'vegetation') {
      loss++
      mask.set([220, 38, 38, 190], i)
    } else if (a !== 'vegetation' && b === 'vegetation') {
      gain++
      mask.set([34, 197, 94, 150], i)
    }
  }
  return { mask, flooded, vegetationLoss: loss, vegetationGain: gain, cloudMasked: clouds, total: before.length / 4 }
}

/** Histogram of VARI values (−1..1) in `bins` buckets, ignoring cloud pixels. */
export function variHistogram(px: Uint8ClampedArray, bins = 24) {
  const h = new Array<number>(bins).fill(0)
  for (let i = 0; i < px.length; i += 4) {
    if (classify(px[i], px[i + 1], px[i + 2]) === 'cloud') continue
    const v = vari(px[i], px[i + 1], px[i + 2])
    h[Math.min(bins - 1, Math.floor(((v + 1) / 2) * bins))]++
  }
  return h
}

/** Brown → yellow → green color ramp for VARI overlays. */
export function variColor(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (v + 0.3) / 0.6))
  const stops: [number, number, number][] = [
    [140, 81, 10],
    [246, 232, 160],
    [26, 152, 80],
  ]
  const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2]
  return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)]
}
