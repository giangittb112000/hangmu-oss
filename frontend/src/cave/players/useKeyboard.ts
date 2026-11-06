import { useEffect, useSyncExternalStore } from 'react'

export type KeyInput = { forward: number; right: number }

const DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}
const LETTERS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

const IME_WATCHDOG_MS = 1200

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

const viaIme = (e: KeyboardEvent) => e.isComposing || e.key === 'Process' || e.keyCode === 229

export class KeyboardInput {
  private held = new Map<string, number>()
  private out: KeyInput = { forward: 0, right: 0 }
  private listeners = new Set<() => void>()
  imeDetected = false

  private clear = () => this.held.clear()

  private down = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return this.clear()
    if (viaIme(e) && !this.imeDetected) {
      this.imeDetected = true
      this.listeners.forEach((l) => l())
    }
    if (e.code in DIR) {
      this.held.set(e.code, performance.now())
      e.preventDefault()
    }
  }

  private up = (e: KeyboardEvent) => {
    if (!e.code || viaIme(e) || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') {
      return this.clear()
    }
    this.held.delete(e.code)
  }

  private onVisibility = () => {
    if (document.hidden) this.clear()
  }

  attach() {
    window.addEventListener('keydown', this.down)
    window.addEventListener('keyup', this.up)
    window.addEventListener('blur', this.clear)
    document.addEventListener('visibilitychange', this.onVisibility)
    document.documentElement.addEventListener('mouseleave', this.clear)
    return () => {
      window.removeEventListener('keydown', this.down)
      window.removeEventListener('keyup', this.up)
      window.removeEventListener('blur', this.clear)
      document.removeEventListener('visibilitychange', this.onVisibility)
      document.documentElement.removeEventListener('mouseleave', this.clear)
      this.clear()
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  read(): KeyInput {
    const k = this.held
    if (this.imeDetected) {
      const now = performance.now()
      for (const [code, at] of k)
        if (LETTERS.has(code) && now - at > IME_WATCHDOG_MS) k.delete(code)
    }
    let up = 0
    let down = 0
    let left = 0
    let right = 0
    for (const code of k.keys()) {
      const d = DIR[code]
      if (d === 'up') up = 1
      else if (d === 'down') down = 1
      else if (d === 'left') left = 1
      else if (d === 'right') right = 1
    }
    this.out.forward = up - down
    this.out.right = right - left
    return this.out
  }
}

export function useKeyboardBinding(kb: KeyboardInput) {
  useEffect(() => kb.attach(), [kb])
  return useSyncExternalStore(kb.subscribe, () => kb.imeDetected)
}
