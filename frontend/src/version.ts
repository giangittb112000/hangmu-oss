import { useSyncExternalStore } from 'react'
import { net } from './net/NetClient'
import { loadSession, saveSession } from './storage'

const CHECK_MS = 5 * 60_000
const RELOAD_GUARD_KEY = 'hangmu.reloadAt'
const RELOAD_GUARD_MS = 30_000

let ready = false
const listeners = new Set<() => void>()

const idle = () => net.state.phase === 'idle' || net.state.phase === 'closed'

export function reloadForUpdate() {
  const last = Number(loadSession(RELOAD_GUARD_KEY) ?? 0)
  if (Date.now() - last < RELOAD_GUARD_MS) return false
  saveSession(RELOAD_GUARD_KEY, String(Date.now()))
  window.location.reload()
  return true
}

function markReady() {
  if (idle() && reloadForUpdate()) return
  if (ready) return
  ready = true
  listeners.forEach((l) => l())
}

async function check() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const { id } = (await res.json()) as { id?: unknown }
    if (typeof id === 'string' && id !== __BUILD_ID__) markReady()
  } catch {}
}

export function startVersionWatch() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForUpdate()) e.preventDefault()
  })
  if (__BUILD_ID__ === 'dev') return
  setInterval(() => void check(), CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check()
  })
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void check()
  })
  net.subscribe(() => {
    if (ready && idle()) reloadForUpdate()
  })
}

export function useUpdateReady() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => ready,
  )
}
