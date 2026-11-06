import { api } from './client'

export type Me = { name: string; number: number | null }

const parse = (v: unknown): Me | null => {
  if (!v || typeof v !== 'object') return null
  const o = v as { name?: unknown; number?: unknown }
  if (typeof o.name !== 'string' || !o.name) return null
  const n = o.number
  return {
    name: o.name,
    number: typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null,
  }
}

const ME_TIMEOUT_MS = 4000

export const getMe = (signal?: AbortSignal) =>
  api<unknown>('/me', { signal, timeoutMs: ME_TIMEOUT_MS }).then(parse, () => null)

export const saveMe = (name: string, number: number | null, signal?: AbortSignal) =>
  api<unknown>('/me', { method: 'POST', body: { name, number }, signal }).then(parse)
