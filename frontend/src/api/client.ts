import { config } from '../config'

export class ApiError extends Error {
  readonly status: number
  readonly isTimeout: boolean

  constructor(message: string, status: number, isTimeout = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.isTimeout = isTimeout
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  timeoutMs?: number
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, timeoutMs = config.apiTimeoutMs, signal, headers, ...init } = opts

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  let res: Response
  try {
    res = await fetch(`${config.apiUrl}/api${path}`, {
      ...init,
      credentials: 'include',
      signal: combined,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (timeoutSignal.aborted) {
      throw new ApiError(`Hết thời gian chờ (${timeoutMs}ms)`, 0, true)
    }
    throw new ApiError(err instanceof Error ? err.message : 'Lỗi mạng', 0)
  }

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `HTTP ${res.status} ${res.statusText}`
    throw new ApiError(message, res.status, res.status === 408 || res.status === 504)
  }
  return data as T
}
