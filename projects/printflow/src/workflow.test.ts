import { describe, expect, it, vi } from 'vitest'
import { canPerform, canView, isValidTransition, permissions, validateUpload, withRetry } from './workflow'
import type { JobLike } from './workflow'

const job = (over: Partial<JobLike> = {}): JobLike => ({ status: 'Prepress', customer: 'Northwind Coffee', proofs: [], openComments: 0, ...over })

describe('status transitions', () => {
  it('only allows the next stage, never jumps', () => {
    expect(isValidTransition('Prepress', 'Proof')).toBe(true)
    expect(isValidTransition('Proof', 'Press')).toBe(true)
    expect(isValidTransition('Proof', 'Prepress')).toBe(true)
    expect(isValidTransition('Prepress', 'Shipped')).toBe(false)
    expect(isValidTransition('Shipped', 'Prepress')).toBe(false)
  })

  it('requires a proof before sending it', () => {
    expect(canPerform(job(), 'send_proof', 'csr')).toEqual({ ok: false, reason: 'Upload a proof first' })
    expect(canPerform(job({ proofs: [1] }), 'send_proof', 'csr').ok).toBe(true)
  })

  it('enforces roles per action', () => {
    expect(canPerform(job({ status: 'Proof' }), 'approve', 'csr').ok).toBe(false)
    expect(canPerform(job({ status: 'Proof' }), 'approve', 'customer').ok).toBe(true)
    expect(canPerform(job({ status: 'Press' }), 'start_finishing', 'customer').ok).toBe(false)
    expect(canPerform(job({ status: 'Press' }), 'start_finishing', 'production').ok).toBe(true)
  })

  it('blocks approval while comments are open, and change requests without one', () => {
    expect(canPerform(job({ status: 'Proof', openComments: 2 }), 'approve', 'customer').ok).toBe(false)
    expect(canPerform(job({ status: 'Proof' }), 'request_changes', 'customer').ok).toBe(false)
    expect(canPerform(job({ status: 'Proof', openComments: 1 }), 'request_changes', 'customer').ok).toBe(true)
  })
})

describe('permissions', () => {
  it('limits customers to their own jobs', () => {
    expect(canView('customer', { customer: 'Northwind Coffee' }, 'Northwind Coffee')).toBe(true)
    expect(canView('customer', { customer: 'Acme' }, 'Northwind Coffee')).toBe(false)
    expect(canView('production', { customer: 'Acme' }, 'Northwind Coffee')).toBe(true)
  })

  it('only CSRs upload proofs and create jobs', () => {
    expect(permissions.uploadProof('csr', 'Prepress')).toBe(true)
    expect(permissions.uploadProof('customer', 'Prepress')).toBe(false)
    expect(permissions.createJob('production')).toBe(false)
  })
})

describe('upload validation', () => {
  it('accepts print-ready formats under 50 MB', () => {
    expect(validateUpload({ name: 'catalog.PDF', size: 5_000_000 })).toBeNull()
    expect(validateUpload({ name: 'logo.tiff', size: 10 })).toBeNull()
  })
  it('rejects bad types, empty files and oversized files', () => {
    expect(validateUpload({ name: 'virus.exe', size: 10 })).toMatch(/not an accepted file type/)
    expect(validateUpload({ name: 'noext', size: 10 })).toMatch(/not an accepted/)
    expect(validateUpload({ name: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(validateUpload({ name: 'big.pdf', size: 60 * 1024 * 1024 })).toMatch(/limit is 50 MB/)
  })
})

describe('email retry', () => {
  const noWait = () => Promise.resolve()
  it('retries until the send succeeds', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined)
    await expect(withRetry(send, 3, 0, noWait)).resolves.toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('gives up after the last attempt', async () => {
    const send = vi.fn().mockRejectedValue(new Error('smtp down'))
    await expect(withRetry(send, 3, 0, noWait)).rejects.toThrow('smtp down')
    expect(send).toHaveBeenCalledTimes(3)
  })
})
