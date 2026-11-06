import { useSyncExternalStore } from 'react'
import { loadLocal, saveLocal } from '../storage'

const CONSENT_KEY = 'hangmu.analytics'
type Consent = 'yes' | 'no' | null

declare global {
  interface Window {
    __hangmuLoadGtm?: () => void
    __hangmuGtmLoaded?: boolean
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

function denyAnalytics() {
  gtag('consent', 'update', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0]!.trim())
    .filter((n) => /^(_ga|_gid|_gat|_gcl)/.test(n))
  const host = location.hostname
  const parts = host.split('.')
  const domains = new Set(['', host, `.${host}`, `.${parts.slice(-2).join('.')}`])
  for (const n of names) {
    for (const d of domains) {
      document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`
    }
  }
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

let legalOpen = false
let consent: Consent = (() => {
  const v = loadLocal(CONSENT_KEY)
  return v === 'yes' || v === 'no' ? v : null
})()

export const openLegal = () => {
  legalOpen = true
  emit()
}
export const closeLegal = () => {
  legalOpen = false
  emit()
}
export const useLegalOpen = () => useSyncExternalStore(subscribe, () => legalOpen)

export function setConsent(v: 'yes' | 'no') {
  consent = v
  saveLocal(CONSENT_KEY, v)
  if (v === 'yes') window.__hangmuLoadGtm?.()
  else if (window.__hangmuGtmLoaded) denyAnalytics()
  emit()
}
export const useConsent = () => useSyncExternalStore(subscribe, () => consent)

export const analyticsConfigured = () => /^GTM-[A-Z0-9]+$/.test(window.__ENV__?.gtmId ?? '')
