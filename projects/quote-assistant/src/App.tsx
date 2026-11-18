import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DemoBar, fmtDate, uid, usePersistentState } from '../../shared/DemoBar'
import { parseRequest } from './parser'
import type { Confidence, Specs } from './parser'
import { priceQuote } from './pricing'

const SAMPLES = [
  {
    label: 'Tri-fold brochures',
    text: `Hi team,

Could you quote 2,500 tri-fold brochures, 8.5 x 11, 100# gloss text, full color both sides.
Need them by Nov 20. Aqueous coat? if it's not too much extra. Thanks!

Maria Reyes
Northwind Coffee`,
  },
  {
    label: 'Rush postcards',
    text: `Hello - we need 5k postcards 4x6 on 14pt cover, 4/4, round corners please.
This is urgent, ASAP for an event. Can you send pricing today?`,
  },
  {
    label: 'Vague flyer request',
    text: `hey can I get a price for some flyers for our open house, black and white is fine. not sure on the quantity yet, maybe 500?`,
  },
]

type Form = { quantity: string; product: string; size: string; stock: string; colors: string; finishing: string[]; dueDate: string }
type Saved = { id: string; number: string; customer: string; form: Form; total: number; approvedAt: string }

const FINISH_OPTIONS = ['Aqueous coating', 'UV coating', 'Matte lamination', 'Gloss lamination', 'Folding (tri-fold)', 'Folding (bi-fold)', 'Saddle stitch', 'Perfect binding', 'Die cut', 'Round corners']
const LABELS: Record<keyof Form, string> = { quantity: 'Quantity', product: 'Product', size: 'Flat size', stock: 'Stock', colors: 'Colors', finishing: 'Finishing', dueDate: 'Due date' }
const HL: Record<string, string> = { quantity: '#c6f432', product: '#bcd0ff', size: '#ffd7a8', stock: '#e2d4ff', colors: '#b8f0dc', finishing: '#ffc8bb', dueDate: '#ffe58a' }

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function toForm(s: Specs): Form {
  return {
    quantity: s.quantity.value?.toString() ?? '',
    product: s.product.value ?? '',
    size: s.size.value ?? '',
    stock: s.stock.value ?? '',
    colors: s.colors.value ?? '',
    finishing: s.finishing.value ?? [],
    dueDate: s.dueDate.value ?? '',
  }
}

/** Renders the email with the parts the parser used highlighted. */
function Highlighted({ text, specs }: { text: string; specs: Specs }) {
  const spans = (Object.entries(specs) as [string, { span?: [number, number] }][])
    .filter(([, f]) => f.span)
    .map(([k, f]) => ({ key: k, from: f.span![0], to: f.span![1] }))
    .sort((a, b) => a.from - b.from)
  const out: ReactNode[] = []
  let at = 0
  for (const s of spans) {
    if (s.from < at) continue
    out.push(text.slice(at, s.from))
    out.push(
      <mark key={s.key} style={{ background: HL[s.key] }} title={LABELS[s.key as keyof Form]}>
        {text.slice(s.from, s.to)}
      </mark>,
    )
    at = s.to
  }
  out.push(text.slice(at))
  return <pre className="email-preview">{out}</pre>
}

const confPill = (c: Confidence) =>
  c === 'high' ? <span className="pill pill-green">Extracted</span> : c === 'low' ? <span className="pill pill-amber">Check</span> : <span className="pill pill-red">Missing</span>

export default function App() {
  const [text, setText] = useState(SAMPLES[0].text)
  const [specs, setSpecs] = useState<Specs | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = usePersistentState<Saved[]>('quote-assistant.saved', [])
  const [toast, setToast] = useState<string | null>(null)

  const extract = () => {
    const s = parseRequest(text)
    setSpecs(s)
    setForm(toForm(s))
    setReviewed({})
  }

  const errors = useMemo(() => {
    if (!form) return {}
    const e: Partial<Record<keyof Form, string>> = {}
    const q = Number(form.quantity.replace(/,/g, ''))
    if (!Number.isInteger(q) || q <= 0) e.quantity = 'Enter a whole number above 0'
    if (!form.product) e.product = 'Required'
    if (!/^\d+(\.\d+)?\s*[×x]\s*\d+(\.\d+)?/.test(form.size)) e.size = 'Use the form 8.5 × 11 in'
    if (!form.stock) e.stock = 'Required'
    if (!['4/4', '4/0', '1/1', '1/0'].includes(form.colors)) e.colors = 'Pick a color setup'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) e.dueDate = 'Pick a date'
    return e
  }, [form])

  const quote = useMemo(() => {
    if (!form || Object.keys(errors).length) return null
    try {
      return priceQuote({ ...form, quantity: Number(form.quantity.replace(/,/g, '')), dueDate: form.dueDate })
    } catch {
      return null
    }
  }, [form, errors])

  const needsReview = specs ? (Object.entries(specs) as [keyof Form, { confidence: Confidence }][]).filter(([k, f]) => f.confidence !== 'high' && !reviewed[k]) : []
  const canApprove = !!quote && needsReview.length === 0

  const update = (k: keyof Form, v: string | string[]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f))
    setReviewed((r) => ({ ...r, [k]: true }))
  }

  const approve = () => {
    if (!form || !quote) return
    const customer = /^\s*([A-Z][\w&' ]+)\s*$/m.exec(text.split('\n').slice(-1)[0] ?? '')?.[1] ?? 'Walk-in customer'
    const entry: Saved = { id: uid(), number: `Q-${String(1040 + saved.length + 1)}`, customer, form, total: quote.total, approvedAt: new Date().toISOString() }
    setSaved([entry, ...saved])
    setToast(`${entry.number} approved and saved`)
    window.setTimeout(() => setToast(null), 2500)
  }

  return (
    <>
      <DemoBar
        id="quote-assistant"
        name="Smart Quote Assistant"
        tagline="From a messy quote email to reviewed specs and a rules-based price"
        accent="#ff5a36"
        note={
          <>
            <p>Paste a quote request, extract the specs, review anything flagged, then approve.</p>
            <p>
              To run offline, this version extracts specs with a rule-based parser. The production design sends the email to an LLM that returns the same schema,
              then runs the same validation. Prices always come from the tested pricing rules, never from the model.
            </p>
          </>
        }
      />
      <main className="qa-layout">
        <section className="panel qa-input">
          <div className="row-between">
            <h2 className="panel-title">1 · Quote request</h2>
            <div className="samples">
              {SAMPLES.map((s) => (
                <button key={s.label} className="btn btn-ghost btn-sm" onClick={() => { setText(s.text); setSpecs(null); setForm(null) }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {specs ? <Highlighted text={text} specs={specs} /> : <textarea className="textarea email" value={text} onChange={(e) => setText(e.target.value)} aria-label="Quote request email" />}
          <div className="row-between">
            {specs ? (
              <button className="btn btn-ghost" onClick={() => { setSpecs(null); setForm(null) }}>
                Edit email
              </button>
            ) : (
              <span className="muted small">Paste any email, or try a sample.</span>
            )}
            <button className="btn" onClick={extract} disabled={!text.trim()}>
              Extract specs →
            </button>
          </div>
        </section>

        <section className="panel qa-specs">
          <h2 className="panel-title">2 · Review specs</h2>
          {!form || !specs ? (
            <p className="muted empty">Extracted fields appear here, each marked Extracted, Check or Missing.</p>
          ) : (
            <div className="spec-grid">
              {(['quantity', 'product', 'size', 'stock'] as const).map((k) => (
                <label className="field" key={k}>
                  <span>
                    {LABELS[k]} {reviewed[k] ? <span className="pill pill-gray">Edited</span> : confPill(specs[k].confidence)}
                  </span>
                  <input className={`input ${errors[k] ? 'is-invalid' : ''}`} value={form[k]} onChange={(e) => update(k, e.target.value)} style={{ borderLeft: `4px solid ${HL[k]}` }} />
                  {errors[k] && <span className="error">{errors[k]}</span>}
                </label>
              ))}
              <label className="field">
                <span>
                  Colors {reviewed.colors ? <span className="pill pill-gray">Edited</span> : confPill(specs.colors.confidence)}
                </span>
                <select className={`select ${errors.colors ? 'is-invalid' : ''}`} value={form.colors} onChange={(e) => update('colors', e.target.value)} style={{ borderLeft: `4px solid ${HL.colors}` }}>
                  <option value="">Choose…</option>
                  <option value="4/4">4/4 · full color both sides</option>
                  <option value="4/0">4/0 · full color one side</option>
                  <option value="1/1">1/1 · black both sides</option>
                  <option value="1/0">1/0 · black one side</option>
                </select>
                {errors.colors && <span className="error">{errors.colors}</span>}
              </label>
              <label className="field">
                <span>
                  Due date {reviewed.dueDate ? <span className="pill pill-gray">Edited</span> : confPill(specs.dueDate.confidence)}
                </span>
                <input type="date" className={`input ${errors.dueDate ? 'is-invalid' : ''}`} value={form.dueDate} onChange={(e) => update('dueDate', e.target.value)} style={{ borderLeft: `4px solid ${HL.dueDate}` }} />
                {errors.dueDate && <span className="error">{errors.dueDate}</span>}
              </label>
              <fieldset className="field finishing">
                <span>
                  Finishing {reviewed.finishing ? <span className="pill pill-gray">Edited</span> : confPill(specs.finishing.confidence)}
                </span>
                <div className="checks">
                  {FINISH_OPTIONS.map((f) => (
                    <label key={f} className={`check ${form.finishing.includes(f) ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.finishing.includes(f)}
                        onChange={(e) => update('finishing', e.target.checked ? [...form.finishing, f] : form.finishing.filter((x) => x !== f))}
                      />
                      {f}
                    </label>
                  ))}
                </div>
              </fieldset>
              {needsReview.length > 0 && (
                <div className="review-box">
                  <b>{needsReview.length} field{needsReview.length > 1 ? 's' : ''} need a human check:</b>{' '}
                  {needsReview.map(([k]) => LABELS[k]).join(', ')}
                  <button className="btn btn-sm btn-ghost" onClick={() => setReviewed(Object.fromEntries(needsReview.map(([k]) => [k, true])))}>
                    I've checked these
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel qa-price">
          <h2 className="panel-title">3 · Price & approve</h2>
          {!quote ? (
            <p className="muted empty">{form ? 'Fix the highlighted fields to see a price.' : 'The price is calculated from tested rules once the specs are valid.'}</p>
          ) : (
            <>
              <div className="total">
                <span className="muted small">Total</span>
                <b>{money(quote.total)}</b>
                <span className="muted small">
                  {money(quote.unitPrice)} each · {quote.up} up on {quote.sheets} press sheets
                </span>
              </div>
              {quote.rush && <p className="pill pill-amber rush">Rush: due in {quote.businessDays} business days</p>}
              <table className="lines">
                <tbody>
                  {quote.lines.map((l) => (
                    <tr key={l.label}>
                      <td>{l.label}</td>
                      <td className={l.amount < 0 ? 'neg' : ''}>{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Calculated by <code>pricing.ts</code> (11 unit tests). No model output is used for numbers.</p>
              <button className="btn btn-green approve" onClick={approve} disabled={!canApprove}>
                {canApprove ? 'Approve quote' : 'Review flagged fields first'}
              </button>
            </>
          )}
          <div className="saved">
            <h3 className="label">Approved quotes</h3>
            {saved.length === 0 ? (
              <p className="muted small">None yet.</p>
            ) : (
              <ul>
                {saved.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <b>{s.number}</b> · {s.customer} · {s.form.quantity} {s.form.product}
                    <span>
                      {money(s.total)} · {fmtDate(s.approvedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {saved.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSaved([])}>
                Clear
              </button>
            )}
          </div>
        </section>
      </main>
      {toast && (
        <div className="toast-stack">
          <div className="toast">{toast}</div>
        </div>
      )}
    </>
  )
}
