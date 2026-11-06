import { useSyncExternalStore } from 'react'
import { loadLocal, saveLocal } from '../storage'

export type InstallMode =
  'installed' | 'prompt' | 'ios' | 'android' | 'mac-safari' | 'inapp' | 'none'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALLED_KEY = 'hangmu.pwa.installed'

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
const isIOS =
  /iPhone|iPad|iPod/.test(ua) ||
  (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
const isAndroid = /Android/.test(ua)
const isInApp =
  /FBAN|FBAV|FB_IAB|Instagram|Zalo|Line\/|Messenger|TikTok|musical_ly|BytedanceWebview/i.test(ua)
const isMacSafari =
  !isIOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

function forcedMode(): InstallMode | null {
  const f = new URLSearchParams(window.location.search).get('pwa')
  return f && ['ios', 'android', 'inapp', 'mac-safari'].includes(f) ? (f as InstallMode) : null
}

class Pwa {
  private deferred: BeforeInstallPromptEvent | null = null
  private mode: InstallMode = 'none'
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.mode

  start() {
    if (typeof window === 'undefined') return
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferred = e as BeforeInstallPromptEvent
      this.update()
    })
    window.addEventListener('appinstalled', () => {
      saveLocal(INSTALLED_KEY, '1')
      this.deferred = null
      this.update()
    })
    this.update()
    if ('serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined)
      }
      if (document.readyState === 'complete') register()
      else window.addEventListener('load', register, { once: true })
    }
  }

  private update() {
    const next = this.compute()
    if (next !== this.mode) {
      this.mode = next
      this.listeners.forEach((l) => l())
    }
  }

  private compute(): InstallMode {
    const forced = forcedMode()
    if (forced) return forced
    if (isStandalone()) return 'installed'
    if (this.deferred) return 'prompt'
    if (isInApp) return 'inapp'
    if (isIOS) return 'ios'
    if (loadLocal(INSTALLED_KEY) === '1') return 'installed'
    if (isAndroid) return 'android'
    if (isMacSafari) return 'mac-safari'
    return 'none'
  }

  async install(): Promise<boolean> {
    const e = this.deferred
    if (!e || forcedMode()) return false
    this.deferred = null
    try {
      await e.prompt()
      const { outcome } = await e.userChoice
      if (outcome === 'accepted') saveLocal(INSTALLED_KEY, '1')
    } catch {}
    this.update()
    return true
  }
}

export const pwa = new Pwa()

export const useInstallMode = () => useSyncExternalStore(pwa.subscribe, pwa.getSnapshot)

export const installLabel = (m: InstallMode) =>
  m === 'mac-safari'
    ? 'Thêm Hang MU vào Dock'
    : isIOS || isAndroid || m === 'ios' || m === 'android' || m === 'inapp'
      ? 'Thêm vào màn hình chính'
      : 'Cài Hang MU như app'

export const canOfferInstall = (m: InstallMode) => m !== 'installed' && m !== 'none'
