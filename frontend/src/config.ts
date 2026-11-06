declare global {
  interface Window {
    __ENV__?: {
      apiTimeoutMs?: number
      apiUrl?: string
      telegramUrl?: string
      gtmId?: string
    }
    dataLayer?: unknown[]
  }
}

const DEFAULT_API_TIMEOUT_MS = 10_000

const apiUrl = (window.__ENV__?.apiUrl ?? '').trim().replace(/\/+$/, '')

const telegramUrl = (() => {
  const raw = (window.__ENV__?.telegramUrl ?? '').trim()
  return /^https:\/\/t\.me\/[A-Za-z0-9_+/-]+$/.test(raw) ? raw : ''
})()

export const config = {
  apiTimeoutMs: Number(window.__ENV__?.apiTimeoutMs) || DEFAULT_API_TIMEOUT_MS,
  apiUrl,
  telegramUrl,
  wsUrl: apiUrl
    ? `${apiUrl.replace(/^http/, 'ws')}/ws`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
} as const
