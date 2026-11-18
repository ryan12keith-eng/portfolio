// PrintFlow business rules: job status machine, role permissions, upload validation
// and email retry. Pure functions so they are unit-tested and shared by UI and API.

export type Role = 'customer' | 'csr' | 'production'
export const STATUSES = ['Prepress', 'Proof', 'Press', 'Finishing', 'Shipped'] as const
export type Status = (typeof STATUSES)[number]

export type Action = 'send_proof' | 'approve' | 'request_changes' | 'start_finishing' | 'ship'

export const ACTIONS: Record<Action, { label: string; from: Status; to: Status; roles: Role[] }> = {
  send_proof: { label: 'Send proof to customer', from: 'Prepress', to: 'Proof', roles: ['csr'] },
  approve: { label: 'Approve proof', from: 'Proof', to: 'Press', roles: ['customer'] },
  request_changes: { label: 'Request changes', from: 'Proof', to: 'Prepress', roles: ['customer'] },
  start_finishing: { label: 'Move to finishing', from: 'Press', to: 'Finishing', roles: ['production'] },
  ship: { label: 'Mark shipped', from: 'Finishing', to: 'Shipped', roles: ['production'] },
}

export type JobLike = { status: Status; customer: string; proofs: unknown[]; openComments: number }

export type Check = { ok: true } | { ok: false; reason: string }

/** Whether `role` may perform `action` on `job`. Enforced the same way on the server. */
export function canPerform(job: JobLike, action: Action, role: Role): Check {
  const a = ACTIONS[action]
  if (job.status !== a.from) return { ok: false, reason: `Only possible while the job is in ${a.from}` }
  if (!a.roles.includes(role)) return { ok: false, reason: `Only ${a.roles.map(roleName).join(' or ')} can do this` }
  if (action === 'send_proof' && job.proofs.length === 0) return { ok: false, reason: 'Upload a proof first' }
  if (action === 'approve' && job.openComments > 0) return { ok: false, reason: 'Resolve open comments or request changes' }
  if (action === 'request_changes' && job.openComments === 0) return { ok: false, reason: 'Add at least one comment on the proof' }
  return { ok: true }
}

/** Valid next statuses from a given status (used to reject jumps such as Prepress → Shipped). */
export function nextStatuses(from: Status): Status[] {
  return Object.values(ACTIONS)
    .filter((a) => a.from === from)
    .map((a) => a.to)
}

export function isValidTransition(from: Status, to: Status) {
  return nextStatuses(from).includes(to)
}

export const roleName = (r: Role) => ({ customer: 'the customer', csr: 'a CSR', production: 'production staff' })[r]

/** Customers only see their own jobs; staff see all. */
export function canView(role: Role, job: { customer: string }, currentCustomer: string) {
  return role !== 'customer' || job.customer === currentCustomer
}

export const permissions = {
  uploadArtwork: (role: Role, status: Status) => (role === 'customer' || role === 'csr') && status === 'Prepress',
  uploadProof: (role: Role, status: Status) => role === 'csr' && status === 'Prepress',
  comment: (role: Role, status: Status) => (role === 'customer' || role === 'csr') && status === 'Proof',
  createJob: (role: Role) => role === 'csr',
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff']

/** Returns an error message, or null when the file is acceptable. */
export function validateUpload(file: { name: string; size: number }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!file.name.includes('.') || !ALLOWED_EXTENSIONS.includes(ext)) return `“${file.name}” is not an accepted file type (PDF, PNG, JPG or TIFF)`
  if (file.size === 0) return `“${file.name}” is empty`
  if (file.size > MAX_UPLOAD_BYTES) return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 50 MB`
  return null
}

/** Calls `send` until it succeeds, waiting longer each time. Returns the number of attempts used. */
export async function withRetry(send: () => Promise<void>, attempts = 3, baseDelayMs = 400, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  let lastError: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      await send()
      return i
    } catch (e) {
      lastError = e
      if (i < attempts) await wait(baseDelayMs * 2 ** (i - 1))
    }
  }
  throw lastError
}

export const formatBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
