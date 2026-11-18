import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import { DemoBar } from '../../shared/DemoBar'
import { KINDS, KIND_LABEL, SUGGESTIONS, parseQuestion, run } from './spatial'
import type { Answer, Data, Intent, Kind, LngLat } from './spatial'
import { API_BASE, askServer, fetchFacilities, waitForApi } from './api'
import type { Health } from './api'
import facilities from './data/facilities.json'
import rivers from './data/rivers.json'

const data = { facilities, rivers } as unknown as Data
const COLORS: Record<Kind, string> = { school: '#2f5bff', hospital: '#e11d48', library: '#7c3aed', fire_station: '#f97316', park: '#16a34a' }
const START: LngLat = [-94.5833, 39.0997]
const EMPTY = turf.featureCollection([])

type Msg = { id: number; role: 'user' | 'assistant'; text: string; intent?: Intent | { type: string }; answer?: Answer; engine?: string; params?: Record<string, unknown> | null }
type Mode = 'browser' | 'connecting' | 'live' | 'unavailable'

const ENGINE_LABEL = (engine: string) =>
  engine === 'browser' ? 'In-browser · Turf.js' : engine.startsWith('claude:') ? `PostGIS · Claude tool calling (${engine.slice(7)})` : 'PostGIS · rule-based router'

const OVERLAY_PAINT: Record<NonNullable<Answer['overlayStyle']>, { fill: maplibregl.ExpressionSpecification | string; opacity: number; line: string }> = {
  buffer: { fill: '#2f5bff', opacity: 0.1, line: '#2f5bff' },
  flood: { fill: '#0ea5e9', opacity: 0.35, line: '#0369a1' },
  gaps: { fill: ['case', ['==', ['get', 'value'], 1], '#ff5a36', 'rgba(0,0,0,0)'], opacity: 0.5, line: 'rgba(255,90,54,0.25)' },
  density: {
    fill: ['interpolate', ['linear'], ['get', 'value'], 0, 'rgba(109,61,245,0)', 1, 'rgba(109,61,245,0.25)', 4, 'rgba(109,61,245,0.6)', 10, 'rgba(76,29,149,0.9)'],
    opacity: 0.85,
    line: 'rgba(109,61,245,0.15)',
  },
}

export default function App() {
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [point, setPoint] = useState<LngLat>(START)
  const [visible, setVisible] = useState<Record<Kind, boolean>>({ school: true, hospital: true, library: true, fire_station: true, park: false })
  const [showRivers, setShowRivers] = useState(true)
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, role: 'assistant', text: 'Hi! Click anywhere on the map to set a location, then ask about schools, hospitals, libraries, fire stations or parks in central Kansas City.' },
  ])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<string[]>([])
  const [mode, setMode] = useState<Mode>(API_BASE ? 'connecting' : 'browser')
  const [health, setHealth] = useState<Health | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // ---- connect to the FastAPI + PostGIS backend when one is configured
  useEffect(() => {
    if (!API_BASE) return
    let cancelled = false
    waitForApi()
      .then(async (h) => {
        if (cancelled) return
        setHealth(h)
        setMode('live')
        try {
          // show the database's copy of the data on the map
          const fc = await fetchFacilities()
          const src = map.current?.getSource('facilities') as GeoJSONSource | undefined
          src?.setData(fc)
        } catch {
          /* keep the bundled copy; queries still go to the server */
        }
      })
      .catch(() => !cancelled && setMode('unavailable'))
    return () => {
      cancelled = true
    }
  }, [])

  // ---- map setup
  useEffect(() => {
    const m = new maplibregl.Map({
      container: mapEl.current!,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: START,
      zoom: 12.4,
      pitch: 52,
      bearing: -18,
      attributionControl: { compact: true },
    })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.on('load', () => {
      const before = m.getLayer('building-3d') ? 'building-3d' : undefined
      m.addSource('analysis', { type: 'geojson', data: EMPTY })
      m.addLayer({ id: 'analysis-fill', type: 'fill', source: 'analysis', paint: { 'fill-color': '#2f5bff', 'fill-opacity': 0 } }, before)
      m.addLayer({ id: 'analysis-line', type: 'line', source: 'analysis', paint: { 'line-color': '#2f5bff', 'line-width': 1.5, 'line-opacity': 0 } }, before)
      m.addSource('rivers', { type: 'geojson', data: data.rivers })
      m.addLayer({ id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': '#0284c7', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 5], 'line-opacity': 0.75 } }, before)
      m.addSource('facilities', { type: 'geojson', data: data.facilities, promoteId: 'id' })
      m.addLayer({
        id: 'facilities',
        type: 'circle',
        source: 'facilities',
        paint: {
          'circle-color': ['match', ['get', 'kind'], ...KINDS.flatMap((k) => [k, COLORS[k]]), '#64748b'] as unknown as maplibregl.ExpressionSpecification,
          // zoom must be the top-level input; the highlight case goes inside each stop
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['boolean', ['feature-state', 'hit'], false], 7, 3], 15, ['case', ['boolean', ['feature-state', 'hit'], false], 11, 6]],
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hit'], false], '#0b0d17', '#ffffff'],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hit'], false], 3, 1.5],
          'circle-pitch-alignment': 'map',
        },
      })
      m.addSource('point', { type: 'geojson', data: turf.point(START) })
      m.addLayer({ id: 'point-halo', type: 'circle', source: 'point', paint: { 'circle-radius': 18, 'circle-color': '#0b0d17', 'circle-opacity': 0.15 } })
      m.addLayer({ id: 'point', type: 'circle', source: 'point', paint: { 'circle-radius': 8, 'circle-color': '#0b0d17', 'circle-stroke-color': '#c6f432', 'circle-stroke-width': 3 } })

      m.on('click', 'facilities', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as { name?: string; kind: Kind }
        new maplibregl.Popup({ offset: 10 })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as LngLat)
          .setHTML(`<b>${p.name ?? 'Unnamed'}</b><br/><span style="color:#5b6178">${KIND_LABEL[p.kind][0]}</span>`)
          .addTo(m)
      })
      m.on('click', (e) => {
        if (m.queryRenderedFeatures(e.point, { layers: ['facilities'] }).length) return
        setPoint([e.lngLat.lng, e.lngLat.lat])
      })
      m.on('mouseenter', 'facilities', () => (m.getCanvas().style.cursor = 'pointer'))
      m.on('mouseleave', 'facilities', () => (m.getCanvas().style.cursor = ''))
      setReady(true)
    })
    return () => m.remove()
  }, [])

  useEffect(() => {
    if (!ready) return
    ;(map.current!.getSource('point') as GeoJSONSource).setData(turf.point(point))
  }, [point, ready])

  useEffect(() => {
    if (!ready) return
    const m = map.current!
    m.setFilter('facilities', ['in', ['get', 'kind'], ['literal', KINDS.filter((k) => visible[k])]])
    m.setLayoutProperty('rivers', 'visibility', showRivers ? 'visible' : 'none')
  }, [visible, showRivers, ready])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  const applyAnswer = (a: Answer, intent: Intent) => {
    const m = map.current
    if (!m) return
    // style changes throw while the map is still loading (e.g. right after new data); wait for idle
    if (!m.isStyleLoaded()) {
      m.once('idle', () => applyAnswer(a, intent))
      return
    }
    for (const id of hits) m.setFeatureState({ source: 'facilities', id }, { hit: false })
    for (const id of a.highlight) m.setFeatureState({ source: 'facilities', id }, { hit: true })
    setHits(a.highlight)
    // make sure the kind being asked about is visible
    if ('kind' in intent && intent.kind) setVisible((v) => ({ ...v, [intent.kind!]: true }))
    if (intent.type === 'flood') setShowRivers(true)
    ;(m.getSource('analysis') as GeoJSONSource).setData(a.overlay ?? EMPTY)
    if (a.overlayStyle) {
      const s = OVERLAY_PAINT[a.overlayStyle]
      m.setPaintProperty('analysis-fill', 'fill-color', s.fill)
      m.setPaintProperty('analysis-fill', 'fill-opacity', s.opacity)
      m.setPaintProperty('analysis-line', 'line-color', s.line)
      m.setPaintProperty('analysis-line', 'line-opacity', 1)
      m.setPaintProperty('analysis-line', 'line-dasharray', a.overlayStyle === 'buffer' ? [2, 2] : [1, 0])
    } else {
      m.setPaintProperty('analysis-fill', 'fill-opacity', 0)
      m.setPaintProperty('analysis-line', 'line-opacity', 0)
    }
    const focus = a.overlay && a.overlayStyle === 'buffer' ? a.overlay : a.highlight.length ? turf.featureCollection(data.facilities.features.filter((f) => a.highlight.includes(f.properties.id))) : a.overlay
    if (focus && focus.features.length) {
      const [w, s, e, n] = turf.bbox(focus)
      m.fitBounds([[w, s], [e, n]], { padding: 70, maxZoom: 14.5, duration: 900 })
    }
  }

  const ask = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    setQ('')
    setMsgs((all) => [...all, { id: all.length, role: 'user', text: question }])
    const reply = (m: Omit<Msg, 'id' | 'role'>) => setMsgs((all) => [...all, { id: all.length, role: 'assistant', ...m }])

    if (mode === 'live') {
      setBusy(true)
      let res: Awaited<ReturnType<typeof askServer>> | null = null
      try {
        res = await askServer(question, point)
      } catch (e) {
        console.warn('GeoMind API request failed, falling back to in-browser queries', e)
      } finally {
        setBusy(false)
      }
      if (res) {
        reply({ text: res.text, answer: res, engine: res.engine, params: res.params, intent: res.intent })
        // the server's intent has the same type/kind fields the map uses
        applyAnswer(res, res.intent as unknown as Intent)
        return
      }
      setMode('unavailable')
      reply({ text: 'The GeoMind server stopped responding, so I switched to in-browser queries.' })
    }
    const intent = parseQuestion(question)
    const answer = run(intent, data, point)
    reply({ text: answer.text, intent, answer, engine: 'browser' })
    applyAnswer(answer, intent)
  }

  const counts = Object.fromEntries(KINDS.map((k) => [k, data.facilities.features.filter((f) => f.properties.kind === k).length])) as Record<Kind, number>
  const maxCount = Math.max(...Object.values(counts))

  return (
    <>
      <DemoBar
        id="geomind"
        name="GeoMind AI"
        tagline="Smart city GIS · central Kansas City"
        accent="#2f5bff"
        note={
          <>
            <p>
              Real OpenStreetMap data for central Kansas City (441 facilities, 6 rivers). Click the map to move the query point, then ask a question. The chip next to the assistant
              shows where answers come from.
            </p>
            <p>
              <b>Live · PostGIS:</b> questions go to the GeoMind API (FastAPI) and run as SQL on PostgreSQL/PostGIS. The assistant picks the query with Claude tool calling when an
              API key is configured on the server, otherwise with a rule-based router. The answer always comes from the database.
            </p>
            <p>
              <b>In-browser:</b> if the server is asleep or unreachable, the same queries run locally with Turf.js so the app keeps working. Open “How this was answered” on any
              reply to see the tool call and the exact SQL.
            </p>
          </>
        }
      />
      <main className="gm">
        <div className="map-wrap">
          <div ref={mapEl} className="map" />
          <div className="layers panel">
            <span className="label">Layers</span>
            {KINDS.map((k) => (
              <label key={k}>
                <input type="checkbox" checked={visible[k]} onChange={(e) => setVisible({ ...visible, [k]: e.target.checked })} />
                <i style={{ background: COLORS[k] }} />
                {KIND_LABEL[k][1][0].toUpperCase() + KIND_LABEL[k][1].slice(1)}
                <span className="muted">{counts[k]}</span>
              </label>
            ))}
            <label>
              <input type="checkbox" checked={showRivers} onChange={(e) => setShowRivers(e.target.checked)} />
              <i style={{ background: '#0284c7', height: 4 }} />
              Rivers
            </label>
          </div>
          <div className="point-chip">
            <span>Query point</span>
            <b className="mono">
              {point[1].toFixed(4)}°N, {Math.abs(point[0]).toFixed(4)}°W
            </b>
            <button className="btn btn-sm btn-ghost" onClick={() => { setPoint(START); map.current?.flyTo({ center: START, zoom: 12.4, pitch: 52, bearing: -18 }) }}>
              Reset
            </button>
          </div>
        </div>

        <aside className="assistant">
          <div className="chat-head">
            <span className="spark">✦</span>
            <div>
              <b>GIS assistant</b>
              <span className="muted">Answers come from real spatial queries</span>
            </div>
            <span
              className={`conn conn-${mode}`}
              title={
                mode === 'live'
                  ? `FastAPI server · PostGIS ${health?.postgis ?? ''} · router: ${health?.assistant ?? ''}`
                  : mode === 'connecting'
                    ? 'Waking the API server (free hosting sleeps when idle)…'
                    : mode === 'unavailable'
                      ? 'API server unreachable, using in-browser queries'
                      : 'No API server configured, using in-browser queries'
              }
            >
              <i />
              {mode === 'live' ? 'Live · PostGIS' : mode === 'connecting' ? 'Connecting…' : 'In-browser'}
            </span>
          </div>
          <div className="chat" ref={listRef}>
            {msgs.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                <p>{m.text}</p>
                {m.answer && m.answer.list.length > 0 && (
                  <ul className="hits">
                    {m.answer.list.map((h, i) => (
                      <li key={i}>
                        <span>{h.name}</span>
                        <span className="muted">{h.detail}</span>
                      </li>
                    ))}
                    {m.answer.highlight.length > m.answer.list.length && <li className="muted">+ {m.answer.highlight.length - m.answer.list.length} more on the map</li>}
                  </ul>
                )}
                {m.intent && m.intent.type !== 'unknown' && (
                  <details className="trace">
                    <summary>How this was answered</summary>
                    {m.engine && <span className="engine">{ENGINE_LABEL(m.engine)}</span>}
                    <span className="label">Tool call</span>
                    <code className="code">{JSON.stringify(m.intent, (_, v) => (v === null ? undefined : v))}</code>
                    {m.answer?.sql && (
                      <>
                        <span className="label">{m.engine === 'browser' ? 'Equivalent PostGIS' : 'SQL executed on PostGIS'}</span>
                        <code className="code">{m.answer.sql}</code>
                      </>
                    )}
                    {m.params && (
                      <>
                        <span className="label">Parameters</span>
                        <code className="code">{JSON.stringify(m.params)}</code>
                      </>
                    )}
                  </details>
                )}
              </div>
            ))}
            {busy && (
              <div className="msg assistant typing" aria-label="Querying PostGIS">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="pill pill-gray" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault()
              ask(q)
            }}
          >
            <input className="input" placeholder="Ask about the map…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask the GIS assistant" />
            <button className="btn" disabled={!q.trim()}>
              Ask
            </button>
          </form>
          <div className="dash">
            <span className="label">Facilities in study area</span>
            {KINDS.map((k) => (
              <div className="bar" key={k}>
                <span>{KIND_LABEL[k][1]}</span>
                <span className="track">
                  <span style={{ width: `${(counts[k] / maxCount) * 100}%`, background: COLORS[k] }} />
                </span>
                <b>{counts[k]}</b>
              </div>
            ))}
            <p className="muted tiny">Data © OpenStreetMap contributors (ODbL)</p>
          </div>
        </aside>
      </main>
    </>
  )
}
