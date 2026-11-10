import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

const REPO = 'https://github.com/ryan12keith-eng/portfolio/tree/main/projects/'

/** Top bar shared by every demo: back to the portfolio, app name, source link and a short note. */
export function DemoBar({ id, name, tagline, note, accent = '#2f5bff' }: { id: string; name: string; tagline: string; note: ReactNode; accent?: string }) {
  const [showNote, setShowNote] = useState(false)
  return (
    <header className="demo-bar" style={{ '--accent': accent } as CSSProperties}>
      <a className="demo-back" href={`../../#${id === 'geomind' ? 'flagship' : id}`} title="Back to Ryan Keith's portfolio">
        <span className="demo-mark">RK</span>
        <span className="demo-back-text">Portfolio</span>
      </a>
      <div className="demo-title">
        <b>{name}</b>
        <span>{tagline}</span>
      </div>
      <div className="demo-actions">
        <button className="demo-chip" onClick={() => setShowNote((v) => !v)} aria-expanded={showNote}>
          About this demo
        </button>
        <a className="demo-chip demo-chip-dark" href={REPO + id} target="_blank" rel="noreferrer">
          Source code ↗
        </a>
      </div>
      {showNote && (
        <div className="demo-note" role="note">
          {note}
          <button onClick={() => setShowNote(false)} aria-label="Close">
            ×
          </button>
        </div>
      )}
    </header>
  )
}

/** useState that survives reloads via localStorage (falls back silently when storage is unavailable). */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      /* storage blocked or corrupt: use the initial value */
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* quota exceeded or storage blocked: keep working in memory */
    }
  }, [key, value])
  return [value, setValue] as const
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
