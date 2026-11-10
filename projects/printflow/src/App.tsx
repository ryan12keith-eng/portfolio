import { useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { DemoBar, fmtDate, uid, usePersistentState } from '../../shared/DemoBar'
import { ACTIONS, STATUSES, canPerform, canView, formatBytes, permissions, validateUpload, withRetry } from './workflow'
import type { Action, Role, Status } from './workflow'

type FileMeta = { id: string; name: string; size: number; by: string; at: string }
type Proof = { id: string; version: number; name: string; url: string; persisted: boolean; at: string }
type Comment = { id: string; proofId: string; x: number; y: number; text: string; by: string; at: string; resolved: boolean }
type Audit = { id: string; at: string; by: string; text: string }
type Job = {
  id: string
  number: string
  title: string
  customer: string
  qty: number
  specs: string
  due: string
  status: Status
  artwork: FileMeta[]
  proofs: Proof[]
  comments: Comment[]
  audit: Audit[]
}
type Email = { id: string; to: string; subject: string; status: 'sending' | 'sent' | 'failed'; attempts: number; at: string }

const USERS: Record<Role, { name: string; label: string; company?: string }> = {
  customer: { name: 'Maria Reyes', label: 'Customer', company: 'Northwind Coffee' },
  csr: { name: 'Jordan Ortiz', label: 'CSR' },
  production: { name: 'Sam Lee', label: 'Production' },
}
const CUSTOMER = USERS.customer.company!

/** A simple brochure-style proof, drawn as SVG so the app works without uploads. */
function sampleProof(title: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#f4f1ea"/>
  <g stroke="#9aa3b2"><path d="M30 40H10M40 30V10M570 40H590M560 30V10M30 760H10M40 770V790M570 760H590M560 770V790"/></g>
  <rect x="40" y="40" width="520" height="720" fill="#fff"/>
  <rect x="70" y="70" width="460" height="300" fill="hsl(${hue},45%,30%)"/>
  <circle cx="440" cy="160" r="54" fill="hsl(${(hue + 160) % 360},90%,60%)"/>
  <path d="M70 370l120-120 80 80 60-50 200 90z" fill="hsl(${hue},55%,45%)"/>
  <text x="70" y="430" font-family="Georgia,serif" font-size="42" font-weight="700" fill="#1f2937">${title}</text>
  <rect x="70" y="460" width="460" height="10" rx="3" fill="#cbd5e1"/><rect x="70" y="482" width="420" height="10" rx="3" fill="#cbd5e1"/>
  <rect x="70" y="504" width="440" height="10" rx="3" fill="#cbd5e1"/><rect x="70" y="526" width="300" height="10" rx="3" fill="#cbd5e1"/>
  <rect x="70" y="580" width="140" height="44" rx="6" fill="hsl(${(hue + 160) % 360},80%,50%)"/>
  <text x="140" y="608" font-family="Arial" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">LOGO</text>
  <g transform="translate(380 680)"><rect width="30" height="20" fill="#00aeef"/><rect x="30" width="30" height="20" fill="#ec008c"/><rect x="60" width="30" height="20" fill="#fff200"/><rect x="90" width="30" height="20" fill="#111"/></g>
</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

function seedJobs(): Job[] {
  return [
    {
      id: uid(), number: 'PF-2318', title: 'Spring catalog', customer: CUSTOMER, qty: 5000, specs: '24 pp · 80# gloss text · saddle stitch', due: '2026-12-04', status: 'Proof',
      artwork: [{ id: uid(), name: 'spring-catalog-v3.pdf', size: 48_200_000, by: 'Maria Reyes', at: ago(30) }],
      proofs: [{ id: 'p1', version: 3, name: 'Proof v3', url: sampleProof('Spring Catalog', 195), persisted: true, at: ago(2) }],
      comments: [{ id: uid(), proofId: 'p1', x: 0.24, y: 0.75, text: 'Move the logo up about 3 mm', by: 'Maria Reyes', at: ago(1), resolved: false }],
      audit: [
        { id: uid(), at: ago(30), by: 'Maria Reyes', text: 'Uploaded artwork spring-catalog-v3.pdf (48.2 MB, validated)' },
        { id: uid(), at: ago(2), by: 'Jordan Ortiz', text: 'Uploaded Proof v3 and sent it to the customer (Prepress → Proof)' },
        { id: uid(), at: ago(1), by: 'Maria Reyes', text: 'Commented on Proof v3' },
      ],
    },
    {
      id: uid(), number: 'PF-2321', title: 'Holiday postcards', customer: CUSTOMER, qty: 2500, specs: '4 × 6 · 14 pt cover · 4/4', due: '2026-12-10', status: 'Prepress',
      artwork: [{ id: uid(), name: 'holiday-postcard.png', size: 6_400_000, by: 'Maria Reyes', at: ago(5) }],
      proofs: [], comments: [],
      audit: [{ id: uid(), at: ago(5), by: 'Maria Reyes', text: 'Uploaded artwork holiday-postcard.png (6.4 MB, validated)' }],
    },
    {
      id: uid(), number: 'PF-2309', title: 'Menu boards', customer: 'Harbor Bistro', qty: 40, specs: '24 × 36 · 18 pt · UV coating', due: '2026-11-25', status: 'Press',
      artwork: [{ id: uid(), name: 'menus-final.pdf', size: 22_000_000, by: 'Jordan Ortiz', at: ago(70) }],
      proofs: [{ id: 'p2', version: 1, name: 'Proof v1', url: sampleProof('Harbor Bistro', 20), persisted: true, at: ago(50) }], comments: [],
      audit: [
        { id: uid(), at: ago(50), by: 'Jordan Ortiz', text: 'Sent Proof v1 to the customer (Prepress → Proof)' },
        { id: uid(), at: ago(26), by: 'Ana Park (Harbor Bistro)', text: 'Approved Proof v1 (Proof → Press)' },
      ],
    },
    {
      id: uid(), number: 'PF-2297', title: 'Annual report', customer: 'Coreway Bank', qty: 800, specs: '48 pp · perfect bound', due: '2026-11-18', status: 'Finishing',
      artwork: [], proofs: [], comments: [],
      audit: [{ id: uid(), at: ago(10), by: 'Sam Lee', text: 'Press run complete (Press → Finishing)' }],
    },
  ]
}

export default function App() {
  const [jobs, setJobs] = usePersistentState<Job[]>('printflow.jobs', seedJobs)
  const [emails, setEmails] = usePersistentState<Email[]>('printflow.emails', [])
  const [role, setRole] = useState<Role>('customer')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null)
  const [pinText, setPinText] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const proofRef = useRef<HTMLInputElement>(null)
  const user = USERS[role]
  const actor = role === 'customer' ? `${user.name} (${CUSTOMER})` : `${user.name} (${user.label})`

  const visible = useMemo(() => jobs.filter((j) => canView(role, j, CUSTOMER)), [jobs, role])
  const job = visible.find((j) => j.id === selectedId) ?? visible[0]
  const proof = job?.proofs.at(-1)
  const openComments = job ? job.comments.filter((c) => !c.resolved && c.proofId === proof?.id).length : 0

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const mutate = (id: string, fn: (j: Job) => Job) => setJobs((all) => all.map((j) => (j.id === id ? fn(j) : j)))
  const log = (j: Job, text: string): Job => ({ ...j, audit: [...j.audit, { id: uid(), at: new Date().toISOString(), by: actor, text }] })

  /** Simulated email delivery: the first attempt sometimes fails, so the retry logic is visible. */
  const sendEmail = (to: string, subject: string) => {
    const id = uid()
    const email: Email = { id, to, subject, status: 'sending', attempts: 0, at: new Date().toISOString() }
    setEmails((all) => [email, ...all].slice(0, 30))
    let attempts = 0
    withRetry(async () => {
      attempts++
      setEmails((all) => all.map((e) => (e.id === id ? { ...e, attempts } : e)))
      await new Promise((r) => setTimeout(r, 350))
      if (attempts === 1 && Math.random() < 0.5) throw new Error('SMTP timeout')
    })
      .then(() => setEmails((all) => all.map((e) => (e.id === id ? { ...e, status: 'sent' as const, attempts } : e))))
      .catch(() => setEmails((all) => all.map((e) => (e.id === id ? { ...e, status: 'failed' as const, attempts } : e))))
  }

  const perform = (action: Action) => {
    if (!job) return
    const check = canPerform({ ...job, openComments }, action, role)
    if (!check.ok) return notify(check.reason)
    const a = ACTIONS[action]
    mutate(job.id, (j) => {
      let next = { ...j, status: a.to }
      if (action === 'approve') next = { ...next, comments: next.comments.map((c) => ({ ...c, resolved: true })) }
      return log(next, `${a.label} (${a.from} → ${a.to})`)
    })
    const emailTo = action === 'send_proof' || action === 'ship' ? `${job.customer} contact` : 'Prepress team'
    sendEmail(emailTo, `${job.number}: ${a.label.toLowerCase()}`)
    notify(`${job.number} moved to ${a.to}`)
  }

  const onArtwork = (files: FileList | null) => {
    if (!job || !files?.length) return
    setUploadError(null)
    const accepted: FileMeta[] = []
    for (const f of Array.from(files)) {
      const err = validateUpload(f)
      if (err) {
        setUploadError(err)
        continue
      }
      accepted.push({ id: uid(), name: f.name, size: f.size, by: actor, at: new Date().toISOString() })
    }
    if (accepted.length)
      mutate(job.id, (j) => accepted.reduce((acc, f) => log({ ...acc, artwork: [...acc.artwork, f] }, `Uploaded artwork ${f.name} (${formatBytes(f.size)}, validated)`), j))
    if (fileRef.current) fileRef.current.value = ''
  }

  const onProof = (files: FileList | null) => {
    const f = files?.[0]
    if (!job || !f) return
    const err = validateUpload(f)
    if (err) return setUploadError(err)
    const add = (url: string, persisted: boolean) =>
      mutate(job.id, (j) => {
        const version = (j.proofs.at(-1)?.version ?? 0) + 1
        return log({ ...j, proofs: [...j.proofs, { id: uid(), version, name: `Proof v${version}`, url, persisted, at: new Date().toISOString() }] }, `Uploaded Proof v${version} (${f.name})`)
      })
    if (/\.(png|jpe?g)$/i.test(f.name) && f.size < 2_500_000) {
      const reader = new FileReader()
      reader.onload = () => add(String(reader.result), true)
      reader.readAsDataURL(f)
    } else if (/\.(png|jpe?g)$/i.test(f.name)) add(URL.createObjectURL(f), false)
    else add(sampleProof(job.title, 260), true)
    if (proofRef.current) proofRef.current.value = ''
  }

  const onProofClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!job || !permissions.comment(role, job.status)) return
    const r = e.currentTarget.getBoundingClientRect()
    setDraftPin({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
    setPinText('')
  }

  const savePin = () => {
    if (!job || !proof || !draftPin || !pinText.trim()) return
    mutate(job.id, (j) => log({ ...j, comments: [...j.comments, { id: uid(), proofId: proof.id, ...draftPin, text: pinText.trim(), by: actor, at: new Date().toISOString(), resolved: false }] }, `Commented on ${proof.name}`))
    setDraftPin(null)
  }

  const createJob = (data: { title: string; customer: string; qty: number; specs: string; due: string }) => {
    const number = `PF-${2322 + jobs.length}`
    const j: Job = { id: uid(), number, ...data, status: 'Prepress', artwork: [], proofs: [], comments: [], audit: [] }
    setJobs((all) => [log(j, 'Created job'), ...all])
    setSelectedId(j.id)
    setShowNew(false)
    notify(`${number} created`)
  }

  return (
    <>
      <DemoBar
        id="printflow"
        name="PrintFlow"
        tagline="Print job & proof portal"
        accent="#2f5bff"
        note={
          <>
            <p>Switch roles at the top left to see what customers, CSRs and production staff can each do. Status changes, permissions and upload checks come from <code>workflow.ts</code> (10 unit tests).</p>
            <p>Data is saved in this browser so it works without a server. The production design runs the same rules in an Express API with PostgreSQL, S3 file storage and JWT auth.</p>
          </>
        }
      />
      <div className="pf">
        <aside className="pf-side">
          <div className="roles" role="radiogroup" aria-label="Signed in as">
            {(Object.keys(USERS) as Role[]).map((r) => (
              <button key={r} role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => { setRole(r); setDraftPin(null); setUploadError(null) }}>
                {USERS[r].label}
              </button>
            ))}
          </div>
          <p className="who">
            Signed in as <b>{user.name}</b>
            {role === 'customer' ? ` · ${CUSTOMER}` : ''}
          </p>
          {permissions.createJob(role) && (
            <button className="btn btn-dark new-job" onClick={() => setShowNew(true)}>
              + New job
            </button>
          )}
          <ul className="job-list">
            {visible.map((j) => (
              <li key={j.id}>
                <button className={j.id === job?.id ? 'on' : ''} onClick={() => { setSelectedId(j.id); setDraftPin(null); setUploadError(null) }}>
                  <span className="mono muted">{j.number}</span>
                  <b>{j.title}</b>
                  <span className="muted">{j.customer}</span>
                  <span className={`pill status-${j.status}`}>{j.status}</span>
                </button>
              </li>
            ))}
          </ul>
          {role === 'customer' && <p className="muted tiny">Customers only see their own company's jobs.</p>}
          <button className="btn btn-ghost btn-sm reset" onClick={() => { setJobs(seedJobs()); setEmails([]); setSelectedId(null) }}>
            Reset sample data
          </button>
        </aside>

        {job ? (
          <main className="pf-main">
            <section className="panel job-head">
              <div>
                <span className="mono muted">{job.number}</span>
                <h1>{job.title}</h1>
                <p className="muted">
                  {job.customer} · {job.qty.toLocaleString()} qty · {job.specs} · due {job.due}
                </p>
              </div>
              <ol className="stepper">
                {STATUSES.map((s, i) => {
                  const idx = STATUSES.indexOf(job.status)
                  return (
                    <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''}>
                      <span>{i < idx ? '✓' : i + 1}</span>
                      {s}
                    </li>
                  )
                })}
              </ol>
              <div className="actions">
                {(Object.keys(ACTIONS) as Action[])
                  .filter((a) => ACTIONS[a].from === job.status)
                  .map((a) => {
                    const check = canPerform({ ...job, openComments }, a, role)
                    return (
                      <button key={a} className={`btn ${a === 'request_changes' ? 'btn-ghost' : a === 'approve' ? 'btn-green' : ''}`} disabled={!check.ok} title={check.ok ? '' : check.reason} onClick={() => perform(a)}>
                        {ACTIONS[a].label}
                      </button>
                    )
                  })}
                {(Object.keys(ACTIONS) as Action[])
                  .filter((a) => ACTIONS[a].from === job.status)
                  .map((a) => canPerform({ ...job, openComments }, a, role))
                  .filter((c): c is { ok: false; reason: string } => !c.ok)
                  .slice(0, 1)
                  .map((c) => (
                    <span key="why" className="muted tiny">
                      {c.reason}
                    </span>
                  ))}
                {job.status === 'Shipped' && <span className="pill pill-green">Delivered to carrier</span>}
              </div>
            </section>

            <div className="pf-grid">
              <section className="panel proof">
                <div className="row">
                  <h2 className="panel-title">{proof ? proof.name : 'Proof'}</h2>
                  {permissions.comment(role, job.status) && proof && <span className="muted tiny">Click the proof to add a comment</span>}
                  {permissions.uploadProof(role, job.status) && (
                    <label className="btn btn-sm btn-ghost">
                      Upload proof
                      <input ref={proofRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => onProof(e.target.files)} />
                    </label>
                  )}
                </div>
                {proof ? (
                  <div className={`sheet ${permissions.comment(role, job.status) ? 'can-comment' : ''}`} onClick={onProofClick}>
                    <img src={proof.url} alt={`${proof.name} for ${job.title}`} />
                    {job.comments
                      .filter((c) => c.proofId === proof.id)
                      .map((c, i) => (
                        <span key={c.id} className={`pin ${c.resolved ? 'resolved' : ''}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} title={c.text}>
                          {i + 1}
                        </span>
                      ))}
                    {draftPin && <span className="pin draft" style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }}>+</span>}
                  </div>
                ) : (
                  <p className="muted empty">No proof yet. {role === 'csr' ? 'Upload one to send it to the customer.' : 'Prepress will upload a proof here.'}</p>
                )}
                {!proof?.persisted && proof && <p className="muted tiny">Large image proofs are kept for this session only.</p>}
                {draftPin && (
                  <div className="pin-form">
                    <input className="input" autoFocus placeholder="Describe the change…" value={pinText} onChange={(e) => setPinText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && savePin()} />
                    <button className="btn btn-sm" onClick={savePin} disabled={!pinText.trim()}>
                      Add comment
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setDraftPin(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {proof && job.comments.some((c) => c.proofId === proof.id) && (
                  <ol className="comments">
                    {job.comments
                      .filter((c) => c.proofId === proof.id)
                      .map((c) => (
                        <li key={c.id} className={c.resolved ? 'resolved' : ''}>
                          <b>{c.text}</b>
                          <span className="muted tiny">
                            {c.by} · {fmtDate(c.at)} {c.resolved && '· resolved'}
                          </span>
                          {!c.resolved && permissions.comment(role, job.status) && (
                            <button
                              className="btn btn-sm btn-ghost resolve"
                              onClick={() => mutate(job.id, (j) => log({ ...j, comments: j.comments.map((x) => (x.id === c.id ? { ...x, resolved: true } : x)) }, `Resolved comment “${c.text}”`))}
                            >
                              Resolve
                            </button>
                          )}
                        </li>
                      ))}
                  </ol>
                )}
              </section>

              <div className="pf-col">
                <section className="panel">
                  <div className="row">
                    <h2 className="panel-title">Artwork files</h2>
                    {permissions.uploadArtwork(role, job.status) && (
                      <label className="btn btn-sm">
                        Upload artwork
                        <input ref={fileRef} type="file" hidden multiple onChange={(e) => onArtwork(e.target.files)} />
                      </label>
                    )}
                  </div>
                  {uploadError && <p className="error upload-error">{uploadError}</p>}
                  {job.artwork.length ? (
                    <ul className="files">
                      {job.artwork.map((f) => (
                        <li key={f.id}>
                          <span className="file-ext">{f.name.split('.').pop()?.toUpperCase()}</span>
                          <span>
                            <b>{f.name}</b>
                            <span className="muted tiny">
                              {formatBytes(f.size)} · {f.by} · {fmtDate(f.at)}
                            </span>
                          </span>
                          <span className="pill pill-green">Validated</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted tiny">No artwork uploaded.</p>
                  )}
                  <p className="muted tiny">PDF, PNG, JPG or TIFF up to 50 MB. Try uploading a .exe or .txt to see validation.</p>
                </section>

                <section className="panel">
                  <h2 className="panel-title">Audit history</h2>
                  <ol className="audit">
                    {[...job.audit].reverse().map((a) => (
                      <li key={a.id}>
                        <span>{a.text}</span>
                        <span className="muted tiny">
                          {a.by} · {fmtDate(a.at)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="panel">
                  <h2 className="panel-title">Email alerts</h2>
                  {emails.length ? (
                    <ul className="emails">
                      {emails.slice(0, 5).map((e) => (
                        <li key={e.id}>
                          <span>
                            {e.subject}
                            <span className="muted tiny"> → {e.to}</span>
                          </span>
                          <span className={`pill ${e.status === 'sent' ? 'pill-green' : e.status === 'failed' ? 'pill-red' : 'pill-amber'}`}>
                            {e.status === 'sending' ? `sending (try ${e.attempts})` : `${e.status}${e.attempts > 1 ? ` after ${e.attempts} tries` : ''}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted tiny">Status changes send email alerts, with automatic retries.</p>
                  )}
                </section>
              </div>
            </div>
          </main>
        ) : (
          <main className="pf-main">
            <p className="muted empty">No jobs visible for this role.</p>
          </main>
        )}
      </div>
      {showNew && <NewJob onCancel={() => setShowNew(false)} onCreate={createJob} />}
      {toast && (
        <div className="toast-stack">
          <div className="toast">{toast}</div>
        </div>
      )}
    </>
  )
}

function NewJob({ onCancel, onCreate }: { onCancel: () => void; onCreate: (d: { title: string; customer: string; qty: number; specs: string; due: string }) => void }) {
  const [f, setF] = useState({ title: '', customer: CUSTOMER, qty: '', specs: '', due: '' })
  const [touched, setTouched] = useState(false)
  const errors = {
    title: f.title.trim().length < 3 ? 'At least 3 characters' : '',
    customer: f.customer.trim() ? '' : 'Required',
    qty: /^\d+$/.test(f.qty) && +f.qty > 0 ? '' : 'Whole number above 0',
    specs: f.specs.trim() ? '' : 'Required',
    due: f.due ? '' : 'Pick a date',
  }
  const valid = Object.values(errors).every((e) => !e)
  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input className={`input ${touched && errors[k] ? 'is-invalid' : ''}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {touched && errors[k] && <span className="error">{errors[k]}</span>}
    </label>
  )
  return (
    <div className="modal-back" onClick={onCancel}>
      <form
        className="panel modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (valid) onCreate({ title: f.title.trim(), customer: f.customer.trim(), qty: +f.qty, specs: f.specs.trim(), due: f.due })
        }}
      >
        <h2 className="panel-title">New print job</h2>
        {field('title', 'Job title')}
        {field('customer', 'Customer')}
        <div className="two">
          {field('qty', 'Quantity')}
          {field('due', 'Due date', 'date')}
        </div>
        {field('specs', 'Specs (size, stock, finishing)')}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn">Create job</button>
        </div>
      </form>
    </div>
  )
}
