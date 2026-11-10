import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import { DemoBar } from '../../shared/DemoBar'
import { DEFAULT_WEIGHTS, assess, computeMetrics, scoreSite } from './scoring'
import type { Metrics, Score, Target, Weights } from './scoring'
import { API_BASE, fetchMetrics, reportUrl, saveReport, waitForApi } from './api'
import type { Health, SavedReport } from './api'
import sitesJson from './data/sites.json'
import roadsJson from './data/roads.json'
import servicesJson from './data/services.json'

const sites = sitesJson as unknown as FeatureCollection<Polygon, { id: string; landuse: string; name: string | null; area_m2: number }>
const roads = roadsJson as unknown as FeatureCollection<LineString>
const services = servicesJson as unknown as FeatureCollection<Point>

const LANDUSE_COLORS: Record<string, string> = {
  residential: '#fcd34d', commercial: '#fca5a5', retail: '#f9a8d4', industrial: '#c4b5fd', farmland: '#bef264', grass: '#86efac', meadow: '#6ee7b7', construction: '#fdba74', brownfield: '#d6a76b', greenfield: '#a3e635',
}
const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)
const label = (m: Metrics) => m.name ?? `${m.landuse[0].toUpperCase() + m.landuse.slice(1)} site ${m.id.slice(-4)}`
type Mode = 'score' | 'landuse'

export default function App() {
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [metrics, setMetrics] = useState<Metrics[] | null>(null)
  const [target, setTarget] = useState<Target>('residential')
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS)
  const [mode, setMode] = useState<Mode>('score')
  const [selected, setSelected] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [conn, setConn] = useState<'browser' | 'connecting' | 'live' | 'unavailable'>(API_BASE ? 'connecting' : 'browser')
  const [health, setHealth] = useState<Health | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)

  // Measure all sites in the browser right away, then switch to PostGIS measurements when the API is live.
  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => !cancelled && setMetrics((m) => m ?? computeMetrics(sites, roads, services)), 50)
    if (API_BASE)
      waitForApi()
        .then(async (h) => {
          const server = await fetchMetrics()
          if (cancelled) return
          setHealth(h)
          setMetrics(server)
          setConn('live')
        })
        .catch(() => !cancelled && setConn('unavailable'))
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [])

  const saveToServer = async () => {
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    try {
      const r = await saveReport(selected, target, weights)
      setSaved((all) => [r, ...all].slice(0, 5))
    } catch (e) {
      setSaveError(e instanceof Error && e.message.startsWith('429') ? 'Too many reports, try again in a minute.' : 'Could not save the report. The server may be waking up.')
    } finally {
      setSaving(false)
    }
  }

  const scores = useMemo(() => {
    const out = new Map<string, Score>()
    metrics?.forEach((m) => out.set(m.id, scoreSite(m, target, weights)))
    return out
  }, [metrics, target, weights])
  const byId = useMemo(() => new Map(metrics?.map((m) => [m.id, m])), [metrics])
  const ranked = useMemo(() => (metrics ? [...metrics].sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total) : []), [metrics, scores])

  useEffect(() => {
    const [w, s, e, n] = turf.bbox(sites)
    const m = new maplibregl.Map({ container: mapEl.current!, style: 'https://tiles.openfreemap.org/styles/positron', bounds: [[w, s], [e, n]], fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true } })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource('sites', { type: 'geojson', data: sites, promoteId: 'id' })
      m.addLayer({ id: 'sites-fill', type: 'fill', source: 'sites', paint: { 'fill-color': '#cbd5e1', 'fill-opacity': 0.75 } })
      m.addLayer({
        id: 'sites-line',
        type: 'line',
        source: 'sites',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0b0d17', ['boolean', ['feature-state', 'compare'], false], '#2f5bff', '#ffffff'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, ['boolean', ['feature-state', 'compare'], false], 3, 0.8],
        },
      })
      m.addSource('roads', { type: 'geojson', data: roads })
      m.addLayer({ id: 'roads', type: 'line', source: 'roads', paint: { 'line-color': '#f59e0b', 'line-width': ['match', ['get', 'highway'], 'motorway', 3, 'trunk', 2.5, 1.6] } })
      m.addSource('services', { type: 'geojson', data: services })
      m.addLayer({
        id: 'services',
        type: 'circle',
        source: 'services',
        paint: { 'circle-radius': 5, 'circle-color': ['match', ['get', 'kind'], 'hospital', '#e11d48', '#16a34a'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      })
      m.on('click', 'sites-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id) setSelected(id)
      })
      m.on('mouseenter', 'sites-fill', () => (m.getCanvas().style.cursor = 'pointer'))
      m.on('mouseleave', 'sites-fill', () => (m.getCanvas().style.cursor = ''))
      setReady(true)
    })
    return () => m.remove()
  }, [])

  // Recolor sites when scores or mode change.
  useEffect(() => {
    if (!ready || !metrics) return
    const m = map.current!
    const data = { ...sites, features: sites.features.map((f) => ({ ...f, properties: { ...f.properties, score: scores.get(f.properties.id)?.total ?? 0 } })) }
    ;(m.getSource('sites') as GeoJSONSource).setData(data)
    m.setPaintProperty(
      'sites-fill',
      'fill-color',
      mode === 'score'
        ? ['interpolate', ['linear'], ['get', 'score'], 20, '#ef4444', 50, '#fbbf24', 75, '#84cc16', 92, '#15803d']
        : ['match', ['get', 'landuse'], ...Object.entries(LANDUSE_COLORS).flat(), '#cbd5e1'],
    )
  }, [ready, metrics, scores, mode])

  // Selection / compare outlines.
  const prev = useRef<{ sel: string | null; cmp: string[] }>({ sel: null, cmp: [] })
  useEffect(() => {
    if (!ready) return
    const m = map.current!
    if (prev.current.sel) m.setFeatureState({ source: 'sites', id: prev.current.sel }, { selected: false })
    prev.current.cmp.forEach((id) => m.setFeatureState({ source: 'sites', id }, { compare: false }))
    if (selected) m.setFeatureState({ source: 'sites', id: selected }, { selected: true })
    compare.forEach((id) => m.setFeatureState({ source: 'sites', id }, { compare: true }))
    prev.current = { sel: selected, cmp: compare }
  }, [selected, compare, ready, metrics])

  const focus = (id: string) => {
    setSelected(id)
    const f = sites.features.find((s) => s.properties.id === id)
    if (f) {
      const [w, s, e, n] = turf.bbox(f)
      map.current?.fitBounds([[w, s], [e, n]], { padding: 120, maxZoom: 15.5, duration: 800 })
    }
  }

  const sel = selected ? byId.get(selected) : undefined
  const selScore = selected ? scores.get(selected) : undefined
  const report = sel && selScore ? assess(sel, selScore, target) : null

  const copyReport = async () => {
    if (!sel || !selScore || !report) return
    const text = [
      `LandScope site report: ${label(sel)}`,
      `Target use: ${target} · Suitability ${selScore.total}/100`,
      `Area ${sel.acres} ac · Land use ${sel.landuse} · ${fmtM(sel.roadM)} to ${sel.roadName}`,
      `Nearest school ${fmtM(sel.schoolM)} (${sel.schoolName}) · Nearest hospital ${fmtM(sel.hospitalM)} (${sel.hospitalName})`,
      '',
      'Opportunities:',
      ...report.opportunities.map((o) => `- ${o}`),
      'Constraints:',
      ...(report.constraints.length ? report.constraints.map((c) => `- ${c}`) : ['- None found in the loaded data']),
      'Not yet assessed:',
      ...report.missing.map((x) => `- ${x}`),
      '',
      'Data © OpenStreetMap contributors (ODbL).',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked: nothing else to do */
    }
  }

  return (
    <>
      <DemoBar
        id="landscope"
        name="LandScope AI"
        tagline="Land suitability · south Kansas City metro"
        accent="#6d3df5"
        note={
          <>
            <p>
              The 415 sites are real OpenStreetMap land-use areas, standing in for county parcel data. Adjust the planned use and weights to re-rank every site instantly; the
              scoring rules are covered by tests in both TypeScript and Python.
            </p>
            <p>
              <b>Live · FastAPI + PostGIS:</b> site areas and distances to the nearest major road, school and hospital are measured by PostGIS (a materialized view), and “Save
              report” stores a report in PostgreSQL with a shareable link. With an API key on the server, saved reports also get a Claude-written summary of the measured facts.
            </p>
            <p>
              <b>In-browser · Turf.js:</b> if the server is asleep or unreachable, the same measurements are computed locally.
            </p>
          </>
        }
      />
      <main className="ls">
        <aside className="ls-controls">
          <span
            className={`conn conn-${conn}`}
            title={
              conn === 'live'
                ? `Measurements from PostGIS ${health?.postgis ?? ''} · ${health?.sites ?? ''} sites · ${health?.reports ?? 0} saved reports`
                : conn === 'connecting'
                  ? 'Waking the API server (free hosting sleeps when idle)…'
                  : 'Measuring sites in the browser with Turf.js'
            }
          >
            <i />
            {conn === 'live' ? 'Live · FastAPI + PostGIS' : conn === 'connecting' ? 'Connecting to API…' : 'In-browser · Turf.js'}
          </span>
          <section className="panel">
            <span className="label">Planned use</span>
            <div className="seg3">
              {(['residential', 'commercial', 'industrial'] as Target[]).map((t) => (
                <button key={t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>
                  {t}
                </button>
              ))}
            </div>
            <span className="label weights-label">Criteria weights</span>
            {(
              [
                ['size', 'Site size'],
                ['road', 'Major road access'],
                ['services', target === 'residential' ? 'Schools & hospitals' : 'Hospital access'],
                ['zoning', 'Land-use fit'],
              ] as [keyof Weights, string][]
            ).map(([k, t]) => (
              <label key={k} className="weight">
                <span>
                  {t} <b>{weights[k]}</b>
                </span>
                <input type="range" min={0} max={100} step={5} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: +e.target.value })} />
              </label>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setWeights(DEFAULT_WEIGHTS)}>
              Reset weights
            </button>
          </section>
          <section className="panel ranked">
            <h2 className="panel-title">Top sites for {target}</h2>
            {!metrics ? (
              <p className="muted">Measuring 415 sites…</p>
            ) : (
              <ol>
                {ranked.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <button className={selected === m.id ? 'on' : ''} onClick={() => focus(m.id)}>
                      <span className="score-badge" data-s={scores.get(m.id)!.total}>
                        {scores.get(m.id)!.total}
                      </span>
                      <span>
                        <b>{label(m)}</b>
                        <span className="muted">
                          {m.acres} ac · {fmtM(m.roadM)} to {m.roadName}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>

        <div className="ls-map">
          <div ref={mapEl} className="map" />
          <div className="map-legend panel">
            <div className="seg2">
              <button className={mode === 'score' ? 'on' : ''} onClick={() => setMode('score')}>
                Suitability
              </button>
              <button className={mode === 'landuse' ? 'on' : ''} onClick={() => setMode('landuse')}>
                Land use
              </button>
            </div>
            {mode === 'score' ? (
              <div className="ramp">
                <span>Low</span>
                <i />
                <span>High</span>
              </div>
            ) : (
              <ul>
                {Object.entries(LANDUSE_COLORS)
                  .filter(([k]) => sites.features.some((f) => f.properties.landuse === k))
                  .map(([k, c]) => (
                    <li key={k}>
                      <i style={{ background: c }} />
                      {k}
                    </li>
                  ))}
              </ul>
            )}
            <ul className="extras">
              <li><i className="line" /> Major roads</li>
              <li><i style={{ background: '#16a34a', borderRadius: '50%' }} /> Schools</li>
              <li><i style={{ background: '#e11d48', borderRadius: '50%' }} /> Hospitals</li>
            </ul>
          </div>
        </div>

        <aside className="ls-detail">
          {sel && selScore && report ? (
            <section className="panel detail">
              <div className="detail-head">
                <div>
                  <span className="label">{target} suitability</span>
                  <h2>{label(sel)}</h2>
                </div>
                <span className="big-score" data-s={selScore.total}>
                  {selScore.total}
                </span>
              </div>
              <dl className="facts">
                <div><dt>Area</dt><dd>{sel.acres} acres</dd></div>
                <div><dt>Land use</dt><dd>{sel.landuse}</dd></div>
                <div><dt>Major road</dt><dd>{fmtM(sel.roadM)} · {sel.roadName}</dd></div>
                <div><dt>School</dt><dd>{fmtM(sel.schoolM)} · {sel.schoolName}</dd></div>
                <div><dt>Hospital</dt><dd>{fmtM(sel.hospitalM)} · {sel.hospitalName}</dd></div>
              </dl>
              <div className="parts">
                {(Object.keys(selScore.parts) as (keyof Weights)[]).map((k) => (
                  <div key={k}>
                    <span>{{ size: 'Size', road: 'Road access', services: 'Services', zoning: 'Land-use fit' }[k]}</span>
                    <span className="track"><span style={{ width: `${selScore.parts[k] * 100}%` }} /></span>
                    <b>{Math.round(selScore.parts[k] * 100)}</b>
                  </div>
                ))}
              </div>
              <div className="assessment">
                <h3>Assessment</h3>
                {report.opportunities.map((o) => <p key={o} className="op">✓ {o}</p>)}
                {report.constraints.map((c) => <p key={c} className="con">! {c}</p>)}
                <p className="muted small">Not yet assessed: {report.missing.join(', ')}.</p>
              </div>
              <div className="detail-actions">
                <button className="btn btn-ghost btn-sm" disabled={compare.includes(sel.id)} onClick={() => setCompare((c) => [...c.filter((x) => x !== sel.id), sel.id].slice(-2))}>
                  {compare.includes(sel.id) ? 'In comparison' : 'Add to compare'}
                </button>
                <button className={`btn btn-sm ${conn === 'live' ? 'btn-ghost' : ''}`} onClick={copyReport}>
                  {copied ? 'Copied ✓' : 'Copy report'}
                </button>
                {conn === 'live' && (
                  <button className="btn btn-sm" onClick={saveToServer} disabled={saving}>
                    {saving ? 'Saving…' : 'Save report'}
                  </button>
                )}
              </div>
              {saveError && <p className="error">{saveError}</p>}
              {saved.length > 0 && (
                <ul className="saved-reports">
                  {saved.map((r) => (
                    <li key={r.id}>
                      <a href={reportUrl(r.id)} target="_blank" rel="noreferrer">
                        Report {r.id.slice(0, 8)} · score {r.score}
                      </a>
                      <span className="muted small">
                        saved {new Date(r.created_at).toLocaleTimeString()} · {r.summary_by === 'claude' ? 'with Claude summary' : 'rule-based'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="panel">
              <p className="muted">Click a site on the map or in the ranked list to see its measurements, score breakdown and assessment.</p>
            </section>
          )}
          {compare.length > 0 && (
            <section className="panel compare">
              <div className="row">
                <h2 className="panel-title">Compare</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setCompare([])}>Clear</button>
              </div>
              <table>
                <thead>
                  <tr><th />{compare.map((id) => <th key={id}>{label(byId.get(id)!)}</th>)}</tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Score', (m: Metrics) => `${scores.get(m.id)!.total}`],
                      ['Acres', (m: Metrics) => `${m.acres}`],
                      ['Land use', (m: Metrics) => m.landuse],
                      ['Major road', (m: Metrics) => fmtM(m.roadM)],
                      ['School', (m: Metrics) => fmtM(m.schoolM)],
                      ['Hospital', (m: Metrics) => fmtM(m.hospitalM)],
                    ] as [string, (m: Metrics) => string][]
                  ).map(([k, fn]) => (
                    <tr key={k}><td>{k}</td>{compare.map((id) => <td key={id}>{fn(byId.get(id)!)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {compare.length < 2 && <p className="muted small">Select another site and add it to compare.</p>}
            </section>
          )}
          <p className="muted small credit">Data © OpenStreetMap contributors (ODbL)</p>
        </aside>
      </main>
    </>
  )
}
