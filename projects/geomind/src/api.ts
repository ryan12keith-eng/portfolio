// Client for the GeoMind API (FastAPI + PostGIS). When VITE_GEOMIND_API is not set,
// or the server can't be reached, the app keeps working with in-browser Turf.js queries.
import type { FeatureCollection, Polygon } from 'geojson'
import type { Answer, LngLat } from './spatial'

export const API_BASE = ((import.meta.env.VITE_GEOMIND_API as string | undefined) ?? '').replace(/\/$/, '')

export type Health = {
  status: 'ok' | 'degraded'
  database: 'ok' | 'unavailable'
  assistant: string
  postgis?: string
  facilities?: Record<string, number>
}

type ServerAnswer = {
  text: string
  sql: string | null
  params: Record<string, unknown> | null
  highlight: string[]
  overlay: FeatureCollection<Polygon> | null
  overlay_style: Answer['overlayStyle']
  items: { name: string; detail: string }[]
  intent: ServerIntent
  engine: string
}

export type ServerIntent = { type: string; kind: string | null; radius_m: number | null; buffer_m: number | null; reason: string | null }
export type LiveAnswer = Answer & { engine: string; params: Record<string, unknown> | null; intent: ServerIntent }

async function getJson<T>(path: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const res = await fetch(API_BASE + path, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

/**
 * Polls /api/health until the database is ready. Free hosting tiers sleep when idle,
 * so the first request can take up to a minute while the server wakes.
 */
export async function waitForApi(maxWaitMs = 90_000): Promise<Health> {
  const start = Date.now()
  let lastError: unknown = new Error('API not configured')
  while (API_BASE && Date.now() - start < maxWaitMs) {
    try {
      const h = await getJson<Health>('/api/health', undefined, 20_000)
      if (h.database === 'ok') return h
      lastError = new Error('Database unavailable')
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  throw lastError
}

export const fetchFacilities = () => getJson<FeatureCollection>('/api/facilities')

export async function askServer(question: string, at: LngLat): Promise<LiveAnswer> {
  const a = await getJson<ServerAnswer>('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, lon: at[0], lat: at[1] }),
  })
  return {
    text: a.text,
    sql: a.sql,
    params: a.params,
    highlight: a.highlight,
    overlay: a.overlay,
    overlayStyle: a.overlay_style,
    list: a.items,
    engine: a.engine,
    intent: a.intent,
  }
}
