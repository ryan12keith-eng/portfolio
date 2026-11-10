import { describe, expect, it } from 'vitest'
import { analyzePosting, suggestSkills } from './analyze'
import { validateApplication } from './validate'

const posting = `Senior Full Stack Engineer - Brightline (Hybrid, Kansas City)

You will build and maintain customer-facing web apps with React and TypeScript.
Design REST APIs in Node.js and Express backed by PostgreSQL.
Required: 5+ years of professional experience and strong testing habits (Jest or Playwright).
Experience with Docker and AWS is a plus. Familiarity with accessibility (WCAG) is required.
Salary: $120,000 - $145,000 per year. We offer great benefits and 401k matching.`

describe('analyzePosting', () => {
  const a = analyzePosting(posting)

  it('finds title, seniority, workplace and salary', () => {
    expect(a.title).toBe('Senior Full Stack Engineer')
    expect(a.seniority).toBe('Senior')
    expect(a.workplace).toBe('Hybrid')
    expect(a.years).toBe('5+ years')
    expect(a.salary).toBe('$120,000 - $145,000 per year')
  })

  it('extracts skills from the dictionary', () => {
    for (const s of ['React', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL', 'REST APIs', 'Testing', 'Docker', 'AWS', 'Accessibility']) {
      expect(a.skills).toContain(s)
    }
    expect(a.skills).not.toContain('Java')
  })

  it('summarizes with requirement sentences and skips boilerplate', () => {
    expect(a.summary).toHaveLength(3)
    expect(a.summary.join(' ')).not.toMatch(/401k/)
  })

  it('returns nulls rather than guessing', () => {
    const b = analyzePosting('We are hiring. Join our friendly team today and grow with us.')
    expect(b.title).toBeNull()
    expect(b.salary).toBeNull()
    expect(b.skills).toEqual([])
  })
})

describe('suggestSkills', () => {
  it('splits skills into have / add, case-insensitively', () => {
    expect(suggestSkills(['React', 'Docker', 'AWS'], ['react', 'Python'])).toEqual({ have: ['React'], add: ['Docker', 'AWS'] })
  })
})

describe('validateApplication', () => {
  it('requires company, role and a valid optional URL', () => {
    expect(validateApplication({ company: '', role: 'Dev', deadline: '', url: '' })).toMatchObject({ company: expect.any(String) })
    expect(validateApplication({ company: 'Acme', role: 'Dev', deadline: '', url: 'not a url' })).toMatchObject({ url: expect.any(String) })
    expect(validateApplication({ company: 'Acme', role: 'Dev', deadline: '2026-12-01', url: 'https://acme.com/jobs/1' })).toEqual({})
  })
})
