// Small motion toolkit: masked text reveals, scroll-triggered entrances,
// counters, rotating words, scroll progress and pointer parallax.
// Everything degrades to static content under prefers-reduced-motion.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ElementType, ReactNode } from 'react'

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Adds `.in` to every [data-reveal] element when it scrolls into view. */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)'))
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, deps)
}

/** Splits text into masked words whose letters rise in one after another. */
export function SplitText({
  text,
  as: Tag = 'span',
  className = '',
  delay = 0,
  step = 0.028,
  reveal = true,
}: {
  text: string
  as?: ElementType
  className?: string
  delay?: number
  step?: number
  reveal?: boolean
}) {
  let i = 0
  const words = text.split(' ')
  return (
    <Tag className={`split ${className}`} aria-label={text} {...(reveal ? { 'data-reveal': '' } : {})}>
      {words.map((w, wi) => (
        <span className="split-word" aria-hidden="true" key={wi}>
          {Array.from(w).map((ch) => {
            const d = delay + i++ * step
            return (
              <span className="split-char" style={{ '--d': `${d}s` } as CSSProperties} key={`${wi}-${i}`}>
                {ch}
              </span>
            )
          })}
        </span>
      )).flatMap((el, wi) => (wi < words.length - 1 ? [el, ' '] : [el]))}
    </Tag>
  )
}

/** Counts up from 0 to `to` when scrolled into view. */
export function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reducedMotion()) {
      setValue(to)
      return
    }
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1400)
        setValue(Math.round(to * (1 - Math.pow(1 - p, 4))))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to])
  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}

/** Cycles through words with a masked slide-up transition. */
export function RotatingWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reducedMotion()) return
    const id = window.setInterval(() => setI((n) => (n + 1) % words.length), interval)
    return () => window.clearInterval(id)
  }, [words.length, interval])
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '')
  return (
    <span className="rotator" aria-live="polite">
      <span className="rotator-sizer" aria-hidden="true">
        {longest}
      </span>
      {words.map((w, n) => (
        <span key={w} className={`rotator-word ${n === i ? 'is-on' : ''}`} aria-hidden={n !== i}>
          {w}
        </span>
      ))}
    </span>
  )
}

/** Thin bar at the top of the page showing scroll progress. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const h = document.documentElement.scrollHeight - window.innerHeight
      ref.current?.style.setProperty('--p', String(h > 0 ? window.scrollY / h : 0))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return <div className="progress" ref={ref} aria-hidden="true" />
}

/** Sets --mx / --my (-1..1) on the element as the pointer moves over it. */
export function Parallax({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    let mx = 0
    let my = 0
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      mx = ((e.clientX - r.left) / r.width) * 2 - 1
      my = ((e.clientY - r.top) / r.height) * 2 - 1
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          el.style.setProperty('--mx', mx.toFixed(3))
          el.style.setProperty('--my', my.toFixed(3))
        })
    }
    el.addEventListener('pointermove', onMove)
    return () => {
      el.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
