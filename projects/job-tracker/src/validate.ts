export type AppForm = { company: string; role: string; deadline: string; url: string }

/** Same rules run on the client form and (in production) on the API before saving. */
export function validateApplication(f: AppForm): Partial<Record<keyof AppForm, string>> {
  const e: Partial<Record<keyof AppForm, string>> = {}
  if (!f.company.trim()) e.company = 'Company is required'
  else if (f.company.trim().length > 80) e.company = 'Keep it under 80 characters'
  if (!f.role.trim()) e.role = 'Role is required'
  if (f.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(f.deadline)) e.deadline = 'Use a valid date'
  if (f.url) {
    try {
      const u = new URL(f.url)
      if (!/^https?:$/.test(u.protocol)) e.url = 'Link must start with http(s)://'
    } catch {
      e.url = 'Enter a full link, like https://company.com/jobs/123'
    }
  }
  return e
}
