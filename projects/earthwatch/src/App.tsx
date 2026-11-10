import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { DemoBar } from '../../shared/DemoBar'
import { CLASSES, CLASS_COLORS, classify, detectChange, landCover, vari, variColor, variHistogram } from './analysis'
import type { Change, LandClass, Stats } from './analysis'
import beforeUrl from './assets/before-2023.webp'
import afterUrl from './assets/after-2024.webp'

const W = 720
const H = 480
type Layer = 'none' | 'change' | 'landcover' | 'vari'
type Pixels = { before: Uint8ClampedArray; after: Uint8ClampedArray }

function loadPixels(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, W, H)
      resolve(ctx.getImageData(0, 0, W, H).data)
    }
    img.onerror = reject
    img.src = url
  })
}

const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`
const LABEL: Record<LandClass, string> = { water: 'Water', vegetation: 'Vegetation', sediment: 'Sediment / flood', cloud: 'Cloud' }

export default function App() {
  const [px, setPx] = useState<Pixels | null>(null)
  const [error, setError] = useState(false)
  const [layer, setLayer] = useState<Layer>('change')
  const [overlayOn, setOverlayOn] = useState<'after' | 'before'>('after')
  const [opacity, setOpacity] = useState(0.85)
  const [sensitivity, setSensitivity] = useState(0.5)
  const [split, setSplit] = useState(50)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    Promise.all([loadPixels(beforeUrl), loadPixels(afterUrl)])
      .then(([before, after]) => setPx({ before, after }))
      .catch(() => setError(true))
  }, [])

  const stats = useMemo(() => (px ? { before: landCover(px.before), after: landCover(px.after) } : null), [px])
  const change: Change | null = useMemo(() => (px ? detectChange(px.before, px.after, sensitivity) : null), [px, sensitivity])
  const hist = useMemo(() => (px ? { before: variHistogram(px.before), after: variHistogram(px.after) } : null), [px])

  // Paint the selected analysis layer into the overlay canvas.
  useEffect(() => {
    const c = overlayRef.current
    if (!c || !px || !change) return
    const ctx = c.getContext('2d')!
    const out = ctx.createImageData(W, H)
    const src = overlayOn === 'after' ? px.after : px.before
    if (layer === 'change') out.data.set(change.mask)
    else if (layer !== 'none')
      for (let i = 0; i < src.length; i += 4) {
        const [r, g, b] = [src[i], src[i + 1], src[i + 2]]
        if (layer === 'landcover') {
          const [cr, cg, cb] = CLASS_COLORS[classify(r, g, b)]
          out.data.set([cr, cg, cb, 220], i)
        } else {
          if (classify(r, g, b) === 'cloud') continue
          const [cr, cg, cb] = variColor(vari(r, g, b))
          out.data.set([cr, cg, cb, 225], i)
        }
      }
    ctx.putImageData(out, 0, 0)
  }, [layer, px, change, overlayOn])

  const moveSplit = (e: PointerEvent) => {
    const r = viewRef.current!.getBoundingClientRect()
    setSplit(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)))
  }

  return (
    <>
      <DemoBar
        id="earthwatch"
        name="EarthWatch AI"
        tagline="Flood change detection on real satellite imagery · Rufiji River, Tanzania"
        accent="#12a37f"
        note={
          <>
            <p>
              Real NASA Earth Observatory images (Landsat, 5 May 2023 and 29 Apr 2024). Drag the slider to compare, then switch layers. Every number on this page is computed
              in your browser from the image pixels (<code>analysis.ts</code>, 8 unit tests).
            </p>
            <p>
              These are true-color images, so vegetation uses VARI, a visible-band index. NDVI needs the near-infrared band, which the production pipeline reads from Sentinel-2 via
              Earth Engine and Rasterio, with a trained segmentation model in place of the rule-based classifier used here.
            </p>
          </>
        }
      />
      <main className="ew">
        <section className="viewer-wrap">
          <div
            ref={viewRef}
            className="viewer"
            onPointerDown={(e) => {
              dragging.current = true
              ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
              moveSplit(e)
            }}
            onPointerMove={(e) => dragging.current && moveSplit(e)}
            onPointerUp={() => (dragging.current = false)}
          >
            <img src={afterUrl} alt="Satellite image of the Rufiji River delta during the April 2024 flood" draggable={false} />
            <img className="before" src={beforeUrl} alt="The same area before the flood, May 2023" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} draggable={false} />
            <canvas
              ref={overlayRef}
              width={W}
              height={H}
              className="overlay"
              style={{ opacity: layer === 'none' ? 0 : opacity, clipPath: overlayOn === 'after' ? `inset(0 0 0 ${split}%)` : `inset(0 ${100 - split}% 0 0)` }}
              aria-hidden="true"
            />
            <div className="handle" style={{ left: `${split}%` }}>
              <span>⟷</span>
            </div>
            <span className="tag left">Before · 5 May 2023</span>
            <span className="tag right">After · 29 Apr 2024</span>
            {!px && <div className="loading">{error ? 'Could not load the imagery.' : 'Analyzing pixels…'}</div>}
          </div>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Before/after split" className="split-range" />
          <p className="muted credit">
            Imagery: NASA Earth Observatory / Landsat (public domain). Analysis at {W}×{H} px.
          </p>
        </section>

        <aside className="ew-side">
          <section className="panel">
            <h2 className="panel-title">Analysis layer</h2>
            <div className="layers" role="radiogroup">
              {(
                [
                  ['change', 'Change detection', 'Flooded / lost vegetation'],
                  ['landcover', 'Land-cover classes', 'Water, vegetation, sediment, cloud'],
                  ['vari', 'Vegetation index', 'VARI, brown → green'],
                  ['none', 'Imagery only', 'No overlay'],
                ] as [Layer, string, string][]
              ).map(([id, t, d]) => (
                <button key={id} role="radio" aria-checked={layer === id} className={layer === id ? 'on' : ''} onClick={() => setLayer(id)}>
                  <b>{t}</b>
                  <span>{d}</span>
                </button>
              ))}
            </div>
            {(layer === 'landcover' || layer === 'vari') && (
              <div className="seg">
                <span className="label">Show layer for</span>
                <div>
                  <button className={overlayOn === 'before' ? 'on' : ''} onClick={() => setOverlayOn('before')}>
                    2023
                  </button>
                  <button className={overlayOn === 'after' ? 'on' : ''} onClick={() => setOverlayOn('after')}>
                    2024
                  </button>
                </div>
              </div>
            )}
            <label className="slider">
              <span>Overlay opacity</span>
              <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
            </label>
            {layer === 'change' && (
              <label className="slider">
                <span>Change sensitivity · {Math.round(sensitivity * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e) => setSensitivity(+e.target.value)} />
              </label>
            )}
            <Legend layer={layer} />
          </section>

          {change && stats && (
            <>
              <section className="panel kpis">
                <div>
                  <span className="label">Newly flooded</span>
                  <b className="orange">{pct(change.flooded, change.total)}</b>
                  <span className="muted small">of the scene</span>
                </div>
                <div>
                  <span className="label">Vegetation loss</span>
                  <b className="red">{pct(change.vegetationLoss, change.total)}</b>
                  <span className="muted small">other causes</span>
                </div>
                <div>
                  <span className="label">Cloud-masked</span>
                  <b>{pct(change.cloudMasked, change.total)}</b>
                  <span className="muted small">excluded</span>
                </div>
              </section>
              <section className="panel">
                <h2 className="panel-title">Land cover, before vs after</h2>
                <CoverBars before={stats.before} after={stats.after} />
              </section>
            </>
          )}
          {hist && (
            <section className="panel">
              <h2 className="panel-title">Vegetation index distribution</h2>
              <Histogram before={hist.before} after={hist.after} />
            </section>
          )}
        </aside>
      </main>
    </>
  )
}

function Legend({ layer }: { layer: Layer }) {
  if (layer === 'change')
    return (
      <ul className="legend">
        <li><i style={{ background: 'rgb(255,106,0)' }} /> Vegetation → flood water / sediment</li>
        <li><i style={{ background: 'rgb(220,38,38)' }} /> Other vegetation loss</li>
        <li><i style={{ background: 'rgb(34,197,94)' }} /> Vegetation gain</li>
      </ul>
    )
  if (layer === 'landcover')
    return (
      <ul className="legend">
        {CLASSES.map((c) => (
          <li key={c}><i style={{ background: `rgb(${CLASS_COLORS[c].join(',')})` }} /> {LABEL[c]}</li>
        ))}
      </ul>
    )
  if (layer === 'vari')
    return (
      <div className="ramp">
        <span>Bare</span>
        <i />
        <span>Dense vegetation</span>
      </div>
    )
  return null
}

function CoverBars({ before, after }: { before: Stats; after: Stats }) {
  return (
    <div className="cover">
      {CLASSES.map((c) => {
        const b = before.counts[c] / before.total
        const a = after.counts[c] / after.total
        const delta = (a - b) * 100
        return (
          <div className="cover-row" key={c}>
            <span className="cover-name">{LABEL[c]}</span>
            <div className="bars">
              <span style={{ width: `${b * 100}%`, background: `rgba(${CLASS_COLORS[c].join(',')},.45)` }} title={`2023: ${(b * 100).toFixed(1)}%`} />
              <span style={{ width: `${a * 100}%`, background: `rgb(${CLASS_COLORS[c].join(',')})` }} title={`2024: ${(a * 100).toFixed(1)}%`} />
            </div>
            <span className={`delta ${delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : ''}`}>
              {delta > 0 ? '+' : ''}
              {delta.toFixed(1)} pts
            </span>
          </div>
        )
      })}
      <p className="muted small">Faded bar: 2023 · solid bar: 2024</p>
    </div>
  )
}

function Histogram({ before, after }: { before: number[]; after: number[] }) {
  const max = Math.max(...before, ...after)
  const n = before.length
  const path = (h: number[]) => h.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (n - 1)) * 300} ${100 - (v / max) * 92}`).join(' ')
  return (
    <figure className="hist">
      <svg viewBox="0 0 300 112" role="img" aria-label="VARI histogram for 2023 and 2024">
        <path d={path(before) + ' L300 100 L0 100 Z'} fill="rgba(18,163,127,.15)" />
        <path d={path(before)} fill="none" stroke="#12a37f" strokeWidth="2" />
        <path d={path(after)} fill="none" stroke="#ff6a00" strokeWidth="2" strokeDasharray="5 4" />
        <line x1="150" x2="150" y1="0" y2="100" stroke="#cbd5e1" />
        <text x="2" y="110" fontSize="9" fill="#5b6178">−1 bare</text>
        <text x="150" y="110" fontSize="9" fill="#5b6178" textAnchor="middle">0</text>
        <text x="298" y="110" fontSize="9" fill="#5b6178" textAnchor="end">+1 green</text>
      </svg>
      <figcaption>
        <span><i style={{ background: '#12a37f' }} /> 2023</span>
        <span><i style={{ background: '#ff6a00' }} /> 2024</span>
      </figcaption>
    </figure>
  )
}
