// Client for the LandScope API (FastAPI + PostGIS). Without VITE_LANDSCOPE_API, or while the
// server is unreachable, the app measures and scores sites in the browser instead.
import type { Metrics, Target, Weights } from './scoring'

export const API_BASE = ((import.meta.env.VITE_LANDSCOPE_API as string | undefined) ?? '').replace(/\/$/, '')

export type Health = { status: 'ok' | 'degraded'; database: 'ok' | 'unavailable'; summaries: string; postgis?: string; sites?: number; reports?: number }
export type SavedReport = { id: string; created_at: string; score: number; summary_by: 'claude' | 'rules'; body: string }

type ServerMetrics = {
  id: string
  landuse: string
  name: string | null
  acres: number
  road_m: number
  road_name: string
  school_m: number
  school_name: string
  hospital_m: number
  hospital_name: string
  lon: number
  lat: number
}

async function getJson<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const res = await fetch(API_BASE + path, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

const post = <T,>(path: string, body: unknown) => getJson<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Polls /api/health until the database is ready (free hosting can take ~1 minute to wake). */
export async function waitForApi(maxWaitMs = 90_000): Promise<Health> {
  const start = Date.now()
  let lastError: unknown = new Error('API not configured')
  while (API_BASE && Date.now() - start < maxWaitMs) {
    try {
      const h = await getJson<Health>('/api/health')
      if (h.database === 'ok') return h
      lastError = new Error('Database unavailable')
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  throw lastError
}

/** Site measurements computed by PostGIS (materialized view), in the app's Metrics shape. */
export async function fetchMetrics(): Promise<Metrics[]> {
  const rows = await getJson<ServerMetrics[]>('/api/metrics')
  return rows.map((r) => ({
    id: r.id,
    landuse: r.landuse,
    name: r.name,
    acres: r.acres,
    roadM: r.road_m,
    roadName: r.road_name,
    schoolM: r.school_m,
    schoolName: r.school_name,
    hospitalM: r.hospital_m,
    hospitalName: r.hospital_name,
    center: [r.lon, r.lat],
  }))
}

export const saveReport = (siteId: string, target: Target, weights: Weights) => post<SavedReport>('/api/reports', { site_id: siteId, target, weights })

export const reportUrl = (id: string) => `${API_BASE}/api/reports/${id}`
