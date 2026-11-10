import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { DemoBar, uid, usePersistentState } from '../../shared/DemoBar'
import { analyzePosting, suggestSkills } from './analyze'
import type { Analysis } from './analyze'
import { validateApplication } from './validate'

const STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected'] as const
type Status = (typeof STATUSES)[number]
type Application = {
  id: string
  company: string
  role: string
  status: Status
  deadline: string
  url: string
  notes: string
  analysis: Analysis | null
  updatedAt: string
}

const SAMPLE_POSTING = `Senior Full Stack Engineer - Brightline (Hybrid, Kansas City)

You will build and maintain customer-facing web apps with React and TypeScript.
Design REST APIs in Node.js and Express backed by PostgreSQL.
Required: 5+ years of professional experience and strong testing habits (Jest or Playwright).
Experience with Docker and AWS is a plus. Familiarity with accessibility (WCAG) is required.
Salary: $120,000 - $145,000 per year. We offer great benefits and 401k matching.`

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const daysUntil = (iso: string) => Math.round((new Date(iso + 'T12:00:00').getTime() - Date.now()) / 86_400_000)

function seed(): Application[] {
  const now = new Date().toISOString()
  const a = (company: string, role: string, status: Status, deadline: string, notes = ''): Application => ({ id: uid(), company, role, status, deadline, url: '', notes, analysis: null, updatedAt: now })
  return [
    { ...a('Brightline', 'Senior Full Stack Engineer', 'Interview', inDays(3), 'Panel interview Tue 10:00'), analysis: analyzePosting(SAMPLE_POSTING) },
    a('Northwind Labs', 'Full Stack Engineer', 'Applied', inDays(9)),
    a('Coreway', 'Backend Developer', 'Applied', inDays(14)),
    a('Parallax GIS', 'WebGIS Engineer', 'Interview', inDays(6), 'Take-home: MapLibre + PostGIS'),
    a('Ironleaf', 'Software Engineer', 'Offer', inDays(4), 'Reply to offer by deadline'),
    a('Halcyon', 'React Developer', 'Rejected', ''),
  ]
}

const DEFAULT_SKILLS = ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'Python', 'FastAPI', 'PostgreSQL', 'REST APIs', 'Git', 'GIS', 'PostGIS']
const COLORS: Record<Status, string> = { Applied: '#2f5bff', Interview: '#c27a00', Offer: '#12a37f', Rejected: '#94a3b8' }

export default function App() {
  const [apps, setApps] = usePersistentState<Application[]>('job-tracker.apps', seed)
  const [mySkills, setMySkills] = usePersistentState<string[]>('job-tracker.skills', DEFAULT_SKILLS)
  const [editing, setEditing] = useState<Application | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? apps.filter((a) => `${a.company} ${a.role} ${a.notes}`.toLowerCase().includes(q)) : apps
  }, [apps, query])

  const upcoming = apps
    .filter((a) => a.deadline && a.status !== 'Rejected' && daysUntil(a.deadline) >= 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 5)

  const move = (id: string, status: Status) => setApps((all) => all.map((a) => (a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a)))
  const save = (app: Application) => {
    setApps((all) => (all.some((a) => a.id === app.id) ? all.map((a) => (a.id === app.id ? app : a)) : [app, ...all]))
    setEditing(null)
  }
  const remove = (id: string) => {
    setApps((all) => all.filter((a) => a.id !== id))
    setEditing(null)
  }

  const onDrop = (e: DragEvent, status: Status) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId
    if (id) move(id, status)
    setDragId(null)
    setOverCol(null)
  }

  return (
    <>
      <DemoBar
        id="job-tracker"
        name="Job Application Tracker"
        tagline="Every application, deadline and posting summary in one place"
        accent="#2f5bff"
        note={
          <>
            <p>Drag cards between columns (or use the arrows), add applications, and paste a job posting to get a summary and resume-skill suggestions you can accept or discard.</p>
            <p>
              Data is saved in this browser. Posting analysis runs offline with keyword and sentence scoring (tested in <code>analyze.test.ts</code>); the production design swaps in an LLM that returns the same
              schema, behind an Express API with PostgreSQL and hashed-password login.
            </p>
          </>
        }
      />
      <main className="jt">
        <section className="jt-top">
          <div className="stats">
            {STATUSES.map((s) => (
              <div className="stat" key={s}>
                <span className="dot" style={{ background: COLORS[s] }} />
                <span className="muted">{s}</span>
                <b>{apps.filter((a) => a.status === s).length}</b>
              </div>
            ))}
          </div>
          <input className="input search" placeholder="Search company, role or notes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search applications" />
          <button className="btn" onClick={() => setEditing('new')}>
            + Add application
          </button>
        </section>

        <div className="jt-body">
          <section className="board" aria-label="Application pipeline">
            {STATUSES.map((s) => {
              const col = filtered.filter((a) => a.status === s)
              return (
                <div
                  key={s}
                  className={`column ${overCol === s ? 'over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOverCol(s)
                  }}
                  onDragLeave={() => setOverCol((c) => (c === s ? null : c))}
                  onDrop={(e) => onDrop(e, s)}
                >
                  <h2>
                    <span className="dot" style={{ background: COLORS[s] }} /> {s} <span className="muted">{col.length}</span>
                  </h2>
                  {col.map((a) => {
                    const i = STATUSES.indexOf(a.status)
                    const d = a.deadline ? daysUntil(a.deadline) : null
                    return (
                      <article
                        key={a.id}
                        className={`job ${dragId === a.id ? 'dragging' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', a.id)
                          setDragId(a.id)
                        }}
                        onDragEnd={() => {
                          setDragId(null)
                          setOverCol(null)
                        }}
                      >
                        <button className="job-open" onClick={() => setEditing(a)}>
                          <b>{a.company}</b>
                          <span>{a.role}</span>
                        </button>
                        <div className="job-meta">
                          {d !== null && a.status !== 'Rejected' && (
                            <span className={`pill ${d < 0 ? 'pill-gray' : d <= 3 ? 'pill-red' : 'pill'}`}>{d < 0 ? 'Past due' : d === 0 ? 'Due today' : `Due in ${d}d`}</span>
                          )}
                          {a.analysis && <span className="pill pill-green">Summary</span>}
                          <span className="arrows">
                            <button aria-label={`Move ${a.company} left`} disabled={i === 0} onClick={() => move(a.id, STATUSES[i - 1])}>
                              ←
                            </button>
                            <button aria-label={`Move ${a.company} right`} disabled={i === STATUSES.length - 1} onClick={() => move(a.id, STATUSES[i + 1])}>
                              →
                            </button>
                          </span>
                        </div>
                      </article>
                    )
                  })}
                  {col.length === 0 && <p className="drop-hint">Drop here</p>}
                </div>
              )
            })}
          </section>

          <aside className="side">
            <section className="panel">
              <h2 className="panel-title">Upcoming deadlines</h2>
              {upcoming.length ? (
                <ul className="deadlines">
                  {upcoming.map((a) => (
                    <li key={a.id}>
                      <span className="date">
                        <b>{new Date(a.deadline + 'T12:00:00').getDate()}</b>
                        {new Date(a.deadline + 'T12:00:00').toLocaleString(undefined, { month: 'short' })}
                      </span>
                      <span>
                        <b>{a.company}</b>
                        <span className="muted small">
                          {a.status} · {daysUntil(a.deadline) === 0 ? 'today' : `in ${daysUntil(a.deadline)} days`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">No upcoming deadlines.</p>
              )}
            </section>
            <section className="panel">
              <h2 className="panel-title">My resume skills</h2>
              <SkillEditor skills={mySkills} onChange={setMySkills} />
            </section>
            <button className="btn btn-ghost btn-sm" onClick={() => { setApps(seed()); setMySkills(DEFAULT_SKILLS) }}>
              Reset sample data
            </button>
          </aside>
        </div>
      </main>
      {editing && <Editor initial={editing === 'new' ? null : editing} mySkills={mySkills} onSave={save} onDelete={remove} onClose={() => setEditing(null)} />}
    </>
  )
}

function SkillEditor({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    const s = v.trim()
    if (s && !skills.some((x) => x.toLowerCase() === s.toLowerCase())) onChange([...skills, s])
    setV('')
  }
  return (
    <>
      <div className="skill-chips">
        {skills.map((s) => (
          <button key={s} className="pill pill-gray" onClick={() => onChange(skills.filter((x) => x !== s))} title="Remove">
            {s} ×
          </button>
        ))}
      </div>
      <div className="inline">
        <input className="input" placeholder="Add a skill" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn btn-sm" onClick={add}>
          Add
        </button>
      </div>
    </>
  )
}

function Editor({
  initial,
  mySkills,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Application | null
  mySkills: string[]
  onSave: (a: Application) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [f, setF] = useState(() => initial ?? { id: uid(), company: '', role: '', status: 'Applied' as Status, deadline: '', url: '', notes: '', analysis: null, updatedAt: '' })
  const [touched, setTouched] = useState(false)
  const [posting, setPosting] = useState('')
  const [draft, setDraft] = useState<Analysis | null>(null)
  const errors = validateApplication(f)
  const valid = Object.keys(errors).length === 0
  const shownAnalysis = draft ?? f.analysis
  const suggestion = shownAnalysis ? suggestSkills(shownAnalysis.skills, mySkills) : null

  const runAnalysis = () => {
    const a = analyzePosting(posting)
    setDraft(a)
    if (!f.role && a.title) setF((x) => ({ ...x, role: a.title! }))
  }

  const input = (k: 'company' | 'role' | 'url', label: string, placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input className={`input ${touched && errors[k] ? 'is-invalid' : ''}`} value={f[k]} placeholder={placeholder} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {touched && errors[k] && <span className="error">{errors[k]}</span>}
    </label>
  )

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="panel modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (valid) onSave({ ...f, company: f.company.trim(), role: f.role.trim(), updatedAt: new Date().toISOString() })
        }}
      >
        <div className="modal-head">
          <h2>{initial ? 'Edit application' : 'Add application'}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid2">
          {input('company', 'Company')}
          {input('role', 'Role')}
          <label className="field">
            <span>Status</span>
            <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Deadline</span>
            <input type="date" className={`input ${touched && errors.deadline ? 'is-invalid' : ''}`} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </label>
        </div>
        {input('url', 'Posting link (optional)', 'https://…')}
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>

        <div className="analysis">
          <div className="modal-head">
            <h3>Posting summary</h3>
            {!posting && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPosting(SAMPLE_POSTING)}>
                Use a sample posting
              </button>
            )}
          </div>
          <textarea className="textarea" rows={4} placeholder="Paste the job posting text here…" value={posting} onChange={(e) => setPosting(e.target.value)} />
          <button type="button" className="btn btn-dark btn-sm" disabled={posting.trim().length < 40} onClick={runAnalysis}>
            Summarize posting
          </button>
          {shownAnalysis && (
            <div className={`result ${draft ? 'draft' : ''}`}>
              {draft && <p className="pill pill-amber">Suggestion: review before saving</p>}
              <div className="facts">
                {shownAnalysis.title && <span className="pill">{shownAnalysis.title}</span>}
                {shownAnalysis.seniority && <span className="pill pill-gray">{shownAnalysis.seniority}</span>}
                {shownAnalysis.years && <span className="pill pill-gray">{shownAnalysis.years}</span>}
                {shownAnalysis.workplace && <span className="pill pill-gray">{shownAnalysis.workplace}</span>}
                {shownAnalysis.salary && <span className="pill pill-green">{shownAnalysis.salary}</span>}
              </div>
              <ul className="summary">
                {shownAnalysis.summary.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {suggestion && (
                <div className="skills">
                  <div>
                    <span className="label">On your resume</span>
                    {suggestion.have.length ? suggestion.have.map((s) => <span key={s} className="pill pill-green">✓ {s}</span>) : <span className="muted small">None yet</span>}
                  </div>
                  <div>
                    <span className="label">Suggested to add</span>
                    {suggestion.add.length ? suggestion.add.map((s) => <span key={s} className="pill pill-amber">+ {s}</span>) : <span className="muted small">You already list them all</span>}
                  </div>
                </div>
              )}
              {draft && (
                <div className="inline">
                  <button type="button" className="btn btn-green btn-sm" onClick={() => { setF({ ...f, analysis: draft }); setDraft(null) }}>
                    Accept summary
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
                    Discard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {initial && (
            <button type="button" className="btn btn-red" onClick={() => onDelete(initial.id)}>
              Delete
            </button>
          )}
          <button className="btn">{initial ? 'Save changes' : 'Add application'}</button>
        </div>
      </form>
    </div>
  )
}
