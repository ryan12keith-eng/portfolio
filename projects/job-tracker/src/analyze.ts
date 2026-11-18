// Summarizes a job posting and suggests resume skills.
// Keyword- and sentence-scoring based so the demo runs offline; the production
// design asks an LLM for this same `Analysis` shape and validates it with a schema.

export type Analysis = {
  title: string | null
  seniority: 'Intern' | 'Junior' | 'Mid-level' | 'Senior' | 'Lead' | null
  years: string | null
  workplace: 'Remote' | 'Hybrid' | 'On-site' | null
  salary: string | null
  skills: string[]
  summary: string[]
}

const SKILLS: [string, RegExp][] = [
  ['JavaScript', /\bjavascript\b|\bjs\b|\bes6\b/i],
  ['TypeScript', /\btypescript\b|\bts\b/i],
  ['React', /\breact(?:\.js|js)?\b/i],
  ['Next.js', /\bnext\.?js\b/i],
  ['Vue', /\bvue(?:\.js)?\b/i],
  ['Angular', /\bangular\b/i],
  ['HTML/CSS', /\bhtml5?\b|\bcss3?\b|\bsass\b|\btailwind\b/i],
  ['Node.js', /\bnode(?:\.js|js)?\b/i],
  ['Express', /\bexpress(?:\.js)?\b/i],
  ['Python', /\bpython\b/i],
  ['FastAPI', /\bfastapi\b/i],
  ['Django', /\bdjango\b/i],
  ['Java', /\bjava\b(?!script)/i],
  ['C#/.NET', /\bc#|\.net\b/i],
  ['Go', /\bgolang\b|\bgo\b(?= developer| services| microservices|,)/i],
  ['SQL', /\bsql\b/i],
  ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
  ['MySQL', /\bmysql\b/i],
  ['MongoDB', /\bmongo(?:db)?\b/i],
  ['Redis', /\bredis\b/i],
  ['PostGIS', /\bpostgis\b/i],
  ['GIS', /\bgis\b|\bgeospatial\b|\barcgis\b|\bqgis\b/i],
  ['REST APIs', /\brest(?:ful)?\b(?:\s+apis?)?|\bapis?\b/i],
  ['GraphQL', /\bgraphql\b/i],
  ['AWS', /\baws\b|amazon web services/i],
  ['Azure', /\bazure\b/i],
  ['GCP', /\bgcp\b|google cloud/i],
  ['Docker', /\bdocker\b|\bcontainers?\b/i],
  ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['CI/CD', /\bci\s*\/\s*cd\b|github actions|continuous (?:integration|delivery)/i],
  ['Git', /\bgit\b|\bgithub\b|\bgitlab\b/i],
  ['Testing', /\bunit test|\btesting\b|\bjest\b|\bvitest\b|\bpytest\b|\bcypress\b|\bplaywright\b|\btdd\b/i],
  ['Accessibility', /\baccessib|\bwcag\b|\ba11y\b/i],
  ['Machine learning', /machine learning|\bml\b|pytorch|tensorflow|scikit/i],
  ['LLMs / AI', /\bllms?\b|large language|generative ai|\bgenai\b|\bopenai\b|\brag\b|prompt engineering/i],
  ['Data analysis', /data analy|\bpandas\b|\bnumpy\b/i],
  ['Agile', /\bagile\b|\bscrum\b|\bkanban\b/i],
  ['Security', /\bsecurity\b|\boauth\b|\bauthentication\b|\bowasp\b/i],
]

const REQ = /\b(required|must|experience (?:with|in)|proficien|strong|familiar|knowledge of|you will|you'll|responsib|build|design|own|lead|develop|maintain)\b/i

const TITLE = /\b((?:senior|sr\.?|junior|jr\.?|lead|staff|principal|mid[- ]level)?\s*(?:full[- ]?stack|front[- ]?end|back[- ]?end|software|web|gis|data|machine learning|ml|ai|platform|devops)\s+(?:engineer|developer|analyst|scientist)(?:\s+(?:i{1,3}|iv))?)\b/i

export function analyzePosting(text: string): Analysis {
  const clean = text.replace(/\r/g, '').trim()
  const titleM = TITLE.exec(clean)
  const title = titleM ? titleM[1].replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) : null

  const yearsM = /(\d+)\s*(?:\+|-\s*\d+)?\s*(?:\+\s*)?years?/i.exec(clean)
  const years = yearsM ? yearsM[0].replace(/\s+/g, ' ') : null
  const y = yearsM ? parseInt(yearsM[1], 10) : null

  const seniority: Analysis['seniority'] = /\bintern(ship)?\b/i.test(clean)
    ? 'Intern'
    : /\b(lead|principal|staff)\b/i.test(title ?? clean.slice(0, 200))
      ? 'Lead'
      : /\bsenior|\bsr\.?\b/i.test(title ?? clean.slice(0, 200)) || (y !== null && y >= 5)
        ? 'Senior'
        : /\bjunior|\bjr\.?\b|entry[- ]level|new grad/i.test(clean) || (y !== null && y <= 1)
          ? 'Junior'
          : y !== null
            ? 'Mid-level'
            : null

  const workplace: Analysis['workplace'] = /\bhybrid\b/i.test(clean) ? 'Hybrid' : /\bremote\b/i.test(clean) ? 'Remote' : /on[- ]?site|in[- ]office|in person/i.test(clean) ? 'On-site' : null

  const salaryM = /\$\s?\d{2,3}(?:,\d{3}|k)\s*(?:-|–|to)\s*\$?\s?\d{2,3}(?:,\d{3}|k)(?:\s*(?:per year|\/yr|a year|annually))?/i.exec(clean)
  const salary = salaryM ? salaryM[0].replace(/\s+/g, ' ') : null

  const skills = SKILLS.filter(([, re]) => re.test(clean)).map(([name]) => name)

  // Summary: the most informative sentences (role + requirements), in original order.
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-•*\s]+/, '').trim())
    .filter((s) => s.length > 25 && s.length < 260)
  const scored = sentences.map((s, i) => {
    const skillHits = SKILLS.filter(([, re]) => re.test(s)).length
    const score = skillHits * 2 + (REQ.test(s) ? 2 : 0) + (i < 3 ? 1 : 0) - (/benefits|equal opportunity|401k|pto|apply/i.test(s) ? 4 : 0)
    return { s, i, score }
  })
  const summary = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((x) => (x.s.endsWith('.') ? x.s : x.s + '.'))

  return { title, seniority, years, workplace, salary, skills, summary }
}

/** Splits posting skills into ones the candidate already lists and ones worth adding. */
export function suggestSkills(postingSkills: string[], mySkills: string[]) {
  const mine = new Set(mySkills.map((s) => s.toLowerCase()))
  return {
    have: postingSkills.filter((s) => mine.has(s.toLowerCase())),
    add: postingSkills.filter((s) => !mine.has(s.toLowerCase())),
  }
}
