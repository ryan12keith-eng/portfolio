import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { contact, flagship, gallery, photosFor, profile, projects, questions, roleTracks, rolesFit, steps, tagLabels, values } from './data'
import type { Project, Tag } from './data'
import { Icon } from './Icon'
import { Counter, Parallax, RotatingWord, ScrollProgress, SplitText, useScrollReveal } from './motion'

const navLinks = [
  ['role', 'Role'],
  ['flagship', 'Flagship'],
  ['projects', 'Projects'],
  ['approach', 'Approach'],
  ['contact', 'Contact'],
]

const byId = Object.fromEntries(projects.map((p) => [p.id, p])) as Record<string, Project>
const allTech = Array.from(new Set(projects.flatMap((p) => p.stack).concat(roleTracks.flatMap((r) => r.skills))))
const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties

function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={`nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="wrap nav-inner">
        <a href="#top" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">RK</span>
          <span className="brand-name">Ryan Keith</span>
        </a>
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Main">
          {navLinks.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <a href={contact.resumePage} onClick={() => setOpen(false)}>
            Resume
          </a>
          <a className="nav-cta" href={`mailto:${contact.email}`}>
            Hire me <Icon name="arrow" />
          </a>
        </nav>
        <button className="nav-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
    </header>
  )
}

function Hero() {
  const stack = ['geomind', 'earthwatch', 'landscope'].map((id) => byId[id])
  return (
    <Parallax className="hero">
      <section id="top" aria-labelledby="hero-title">
        <div className="shapes" aria-hidden="true">
          <span className="shape s-circle" />
          <span className="shape s-ring" />
          <span className="shape s-pill" />
          <span className="shape s-square" />
          <span className="shape s-dots" />
          <svg className="shape s-squiggle" viewBox="0 0 300 80">
            <path d="M5 40 C 40 0, 70 80, 105 40 S 170 0, 205 40 S 270 80, 295 40" pathLength={1} />
          </svg>
          <svg className="shape s-tri" viewBox="0 0 100 100">
            <path d="M50 8 L92 88 H8 Z" />
          </svg>
        </div>

        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow" data-reveal="up" style={d(0)}>
              <span className="live-dot" /> Open to software engineering roles · {profile.location}
            </p>
            <h1 id="hero-title" className="hero-title">
              <SplitText text="Software" className="ht-1" delay={0.1} />
              <SplitText text="Engineer." className="ht-2" delay={0.35} />
            </h1>
            <p className="hero-sub" data-reveal="up" style={d(0.7)}>
              Building <RotatingWord words={profile.focus} /> systems
            </p>
            <p className="hero-intro" data-reveal="up" style={d(0.85)}>
              {profile.intro}
            </p>
            <div className="hero-cta" data-reveal="up" style={d(1)}>
              <a className="btn btn-dark" href="#flagship">
                See the flagship <Icon name="arrow" />
              </a>
              <a className="btn btn-line" href={contact.resumePdf} download>
                <Icon name="file" /> Download CV
              </a>
            </div>
          </div>

          <div className="hero-stack" aria-label="Featured projects">
            {stack.map((p, i) => (
              <a href={i === 0 ? '#flagship' : `#${p.id}`} className={`stack-card sc-${i}`} key={p.id} data-reveal="pop" style={d(0.4 + i * 0.15)}>
                <img src={p.image} alt={p.imageAlt} width={1600} height={1000} />
                <span className="stack-label">
                  <b>{p.name}</b>
                  <small>{p.subtitle}</small>
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="wrap stats">
          {[
            [projects.length, '', 'Projects across web, GIS and AI'],
            [allTech.length, '+', 'Technologies in the stack'],
            [3, '', 'Domains: full-stack, GIS, AI'],
            [4, '', 'Engineering tracks'],
          ].map(([n, s, label], i) => (
            <div className="stat" key={label as string} data-reveal="up" style={d(0.1 * i)}>
              <span className="stat-num">
                <Counter to={n as number} suffix={s as string} />
              </span>
              <span className="stat-label">{label}</span>
            </div>
          ))}
        </div>
      </section>
    </Parallax>
  )
}

function Marquee() {
  const row = allTech.slice(0, 18)
  return (
    <div className="marquee" aria-label="Technologies">
      <div className="marquee-track">
        {[0, 1].map((k) => (
          <div className="marquee-group" key={k} aria-hidden={k === 1}>
            {row.map((t) => (
              <span key={t} className="marquee-item">
                {t} <i>✦</i>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="marquee-track reverse" aria-hidden="true">
        {[0, 1].map((k) => (
          <div className="marquee-group" key={k}>
            {['FULL-STACK', 'WEBGIS', 'SPATIAL DATA', 'MACHINE LEARNING', 'APIs', 'COMPUTER VISION'].map((t) => (
              <span key={t} className="marquee-big">
                {t} <i>●</i>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Heading({ kicker, title, lede }: { kicker: string; title: string; lede?: string }) {
  return (
    <div className="heading">
      <p className="kicker" data-reveal="up">
        <span className="kicker-line" />
        {kicker}
      </p>
      <SplitText as="h2" text={title} className="h2" step={0.018} />
      {lede && (
        <p className="lede" data-reveal="up" style={d(0.25)}>
          {lede}
        </p>
      )}
    </div>
  )
}

function Role() {
  return (
    <section className="section" id="role">
      <div className="wrap">
        <div className="head-row">
          <Heading kicker="The role" title="Software Engineer, built from the work" />
          <p className="lede head-aside" data-reveal="up" style={d(0.2)}>
            I looked at what all six projects actually need to ship. They come down to four engineering tracks, and together they
            make one role: a software engineer who can take a product from database to map to model.
          </p>
        </div>
        <div className="tracks">
          {roleTracks.map((t, i) => (
            <article className={`track track-${t.color}`} key={t.id} data-reveal="rise" style={d(i * 0.1)}>
              <span className="track-num">0{i + 1}</span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <ul className="track-skills">
                {t.skills.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div className="track-proof">
                <span>Shown in</span>
                {t.projects.map((id) => (
                  <a key={id} href={id === 'geomind' ? '#flagship' : `#${id}`}>
                    {byId[id].name}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
        <div className="fit" data-reveal="up">
          <span className="fit-label">Roles I'm ready for</span>
          <ul>
            {rolesFit.map((r, i) => (
              <li key={r} className={i === 0 ? 'is-main' : ''}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Flagship() {
  const p = byId.geomind
  const a = flagship.architecture
  return (
    <section className="section flagship" id="flagship">
      <div className="wrap">
        <div className="flag-hero" data-reveal="wipe">
          <img src={p.image} alt={p.imageAlt} width={1600} height={1000} />
          <div className="flag-overlay">
            <span className="badge badge-lime">★ Flagship project</span>
            <SplitText as="h2" text={p.name} className="flag-title" step={0.04} />
            <p className="flag-sub" data-reveal="up" style={d(0.3)}>
              {p.subtitle}
            </p>
          </div>
          <span className="flag-coords" aria-hidden="true">
            38.58°N 121.49°W
          </span>
        </div>

        <div className="flag-intro">
          <div className="flag-left">
            <p className="flag-summary" data-reveal="up">
              {p.summary}
            </p>
            <ul className="chips" data-reveal="up" style={d(0.1)}>
              {p.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <ProjectLinks p={p} big />
            <div className="flag-objectives" data-reveal="up" style={d(0.15)}>
              <h3 className="panel-title">Main objectives</h3>
              <ol className="objectives">
                {flagship.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
            </div>
          </div>
          <div className="flag-gallery">
            {gallery.geomind.map((ph, i) => (
              <figure key={ph.src} className="shot" data-reveal="wipe" style={d(i * 0.15)}>
                <img src={ph.src} alt={ph.alt} width={1200} height={750} loading="lazy" />
                <figcaption>{ph.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="panel panel-tint stack-panel" data-reveal="up">
          <h3 className="panel-title">Technology stack</h3>
          <dl className="stack-table">
            {flagship.stack.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="caps">
          {flagship.capabilities.map((c, i) => (
            <article className="cap" key={c.key} data-reveal="rise" style={d(i * 0.1)}>
              <span className="cap-key">{c.key}</span>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
              <ul>
                {c.examples.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="arch" data-reveal="up">
          <h3 className="panel-title">System architecture</h3>
          <div className="arch-flow">
            <div className="arch-node arch-client">
              <Icon name="layers" />
              <b>{a.client.title}</b>
              <small>{a.client.text}</small>
            </div>
            <span className="arch-link" />
            <div className="arch-node arch-api">
              <Icon name="code" />
              <b>{a.api.title}</b>
              <small>{a.api.text}</small>
            </div>
            <span className="arch-link" />
            <div className="arch-services">
              {a.services.map((s) => (
                <div className="arch-node" key={s.title}>
                  <Icon name={s.icon} />
                  <b>{s.title}</b>
                  <small>{s.text}</small>
                </div>
              ))}
            </div>
          </div>
          <p className="arch-principle">
            <Icon name="check" /> {a.principle}
          </p>
        </div>

        <div className="roadmap" data-reveal="draw">
          <div className="roadmap-head">
            <h3 className="panel-title">8-week build plan</h3>
            <p className="muted">Core GIS platform first, AI capabilities layered on after.</p>
          </div>
          <ol className="weeks">
            {flagship.roadmap.map(([t, x], i) => (
              <li key={t} style={d(0.15 + i * 0.09)}>
                <span className="week-n">W{i + 1}</span>
                <b>{t}</b>
                <small>{x}</small>
              </li>
            ))}
          </ol>
        </div>

        <div className="sources" data-reveal="up">
          <span className="fit-label">Open data sources</span>
          <ul>
            {flagship.dataSources.map(([name, what, url]) => (
              <li key={name}>
                <a href={url} target="_blank" rel="noreferrer">
                  <b>{name}</b> <span>{what}</span> <Icon name="external" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

const filters: ('all' | Tag)[] = ['all', 'gis', 'ai', 'web']

function ProjectLinks({ p, big = false }: { p: Project; big?: boolean }) {
  return (
    <div className={`project-links ${big ? 'big' : ''}`}>
      <a className="btn btn-dark" href={p.demo}>
        Live demo <Icon name="arrow" />
      </a>
      <a className="btn btn-line" href={p.source} target="_blank" rel="noreferrer">
        <Icon name="github" /> Source code
      </a>
    </div>
  )
}

function ProjectCard({ p, index }: { p: Project; index: number }) {
  const photos = photosFor(p)
  const [active, setActive] = useState(0)
  return (
    <article className="card" id={p.id} data-reveal="rise" style={d((index % 2) * 0.12)}>
      <div className="card-gallery">
        <figure className="card-media" data-reveal="wipe">
          {photos.map((ph, i) => (
            <img
              key={ph.src}
              src={ph.src}
              alt={i === active ? ph.alt : ''}
              width={1600}
              height={1000}
              loading="lazy"
              className={i === active ? 'is-on' : ''}
              aria-hidden={i !== active}
            />
          ))}
          <span className="card-level">{p.level}</span>
          <figcaption>{photos[active].caption}</figcaption>
        </figure>
        <div className="thumbs" role="group" aria-label={`${p.name} photos`}>
          {photos.map((ph, i) => (
            <button
              key={ph.src}
              className={i === active ? 'is-on' : ''}
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}: ${ph.caption}`}
              aria-pressed={i === active}
            >
              <img src={ph.src} alt="" width={160} height={100} loading="lazy" />
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        <ul className="card-tags">
          {p.tags.map((t) => (
            <li key={t} className={`tag tag-${t}`}>
              {tagLabels[t]}
            </li>
          ))}
        </ul>
        <h3>{p.name}</h3>
        <p className="card-sub">{p.subtitle}</p>
        <p className="card-summary">{p.summary}</p>
        <ul className="card-highlights">
          {p.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <ul className="chips chips-sm">
          {p.stack.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <ProjectLinks p={p} />
      </div>
    </article>
  )
}

function Projects() {
  const [filter, setFilter] = useState<'all' | Tag>('all')
  const list = useMemo(() => projects.filter((p) => p.id !== 'geomind' && (filter === 'all' || p.tags.includes(filter))), [filter])
  useScrollReveal([filter])
  const count = (f: 'all' | Tag) => projects.filter((p) => p.id !== 'geomind' && (f === 'all' || p.tags.includes(f))).length
  return (
    <section className="section section-tint" id="projects">
      <div className="wrap">
        <div className="head-row">
          <Heading kicker="More projects" title="GIS platforms and production web apps" />
          <div className="filters" role="tablist" aria-label="Filter projects">
            {filters.map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'is-on' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : tagLabels[f]} <sup>{count(f)}</sup>
              </button>
            ))}
          </div>
        </div>
        <div className="cards" key={filter}>
          {list.map((p, i) => (
            <ProjectCard p={p} index={i} key={p.id} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Approach() {
  return (
    <section className="section" id="approach">
      <div className="wrap">
        <div className="head-row">
          <Heading kicker="How I work" title="Understand first, then build in small steps" />
          <p className="lede head-aside" data-reveal="up" style={d(0.2)}>
            Testing, debugging, documentation, security and maintainability are part of the work, not extras added at the end.
          </p>
        </div>
        <ol className="steps" data-reveal="draw">
          {steps.map((s, i) => (
            <li key={s.title} style={d(0.15 + i * 0.12)}>
              <span className="step-dot">{i + 1}</span>
              <b>{s.title}</b>
              <small>{s.text}</small>
            </li>
          ))}
        </ol>
        <h3 className="panel-title qa-title" data-reveal="up">
          Engineering questions, short answers
        </h3>
        <div className="qa-list">
          {questions.map((item, i) => (
            <details key={item.q} className="qa" open={i < 2} data-reveal="up" style={d((i % 2) * 0.08)}>
              <summary>
                <span className="qa-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="qa-q">{item.q}</span>
                <Icon name="down" className="icon qa-caret" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Contact() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.location.href = `mailto:${contact.email}`
    }
  }
  const methods = [
    { icon: 'phone', label: 'Phone', value: contact.phone, href: contact.phoneHref },
    { icon: 'send', label: 'Telegram', value: contact.telegram, href: contact.telegramHref },
    { icon: 'linkedin', label: 'LinkedIn', value: 'ryan-keith', href: contact.linkedin },
    { icon: 'github', label: 'GitHub', value: 'ryan12keith-eng', href: contact.github },
    { icon: 'file', label: 'Resume', value: 'View or download CV', href: contact.resumePage },
  ]
  return (
    <section className="contact" id="contact">
      <div className="contact-shapes" aria-hidden="true">
        <span className="cs-1" />
        <span className="cs-2" />
        <span className="cs-3" />
      </div>
      <div className="wrap contact-inner">
        <div className="contact-copy">
          <p className="kicker kicker-light" data-reveal="up">
            <span className="kicker-line" />
            Contact
          </p>
          <SplitText as="h2" text="Let's build something real." className="contact-title" step={0.025} />
          <p className="contact-lede" data-reveal="up" style={d(0.3)}>
            Open to software engineer, full-stack and WebGIS roles. The fastest way to reach me is email or Telegram.
          </p>
          <div className="contact-main" data-reveal="up" style={d(0.4)}>
            <a className="btn btn-lime" href={`mailto:${contact.email}`}>
              <Icon name="mail" /> {contact.email}
            </a>
            <button className="btn btn-ghost-light" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy email'}
            </button>
          </div>
          <ul className="values" data-reveal="up">
            {values.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
        <ul className="methods">
          {methods.map((m, i) => (
            <li key={m.label} data-reveal="rise" style={d(0.1 * i)}>
              <a href={m.href} target={m.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                <Icon name={m.icon} />
                <span>
                  <small>{m.label}</small>
                  <b>{m.value}</b>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <span>
            © {new Date().getFullYear()} {profile.name} · {profile.role}
          </span>
          <span className="footer-links">
            <a href="credits.html">Image credits</a>
            <a href="#top">Back to top ↑</a>
          </span>
        </div>
      </div>
    </footer>
  )
}

export default function App() {
  useScrollReveal()
  return (
    <>
      <a className="skip" href="#role">
        Skip to content
      </a>
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Role />
        <Flagship />
        <Projects />
        <Approach />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
