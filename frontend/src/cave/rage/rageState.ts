import { useSyncExternalStore } from 'react'
import RAGE from '../../shared/rage-room.json'
import { SLOTS } from './geometry'

export const NICKNAMES = RAGE.nicknames
export const ITEMS = ['🍅 Cà chua', '🩴 Dép tổ ong', '🎂 Bánh kem', '📄 Giấy vo'] as const
export const ITEM_ICONS = ['🍅', '🩴', '🎂', '📄'] as const
export const ITEM_NAMES = ['Cà chua', 'Dép tổ ong', 'Bánh kem', 'Giấy vo'] as const

export type ThrowEvent = {
  by: number
  slot: number
  item: number
  u: number
  v: number
  to?: { x: number; y: number; z: number }
}

export type RageSnapshot = {
  active: boolean
  near: boolean
  labels: readonly number[]
  today: number
  item: number
  slot: number
}

class RageState {
  private snap: RageSnapshot = {
    active: false,
    near: false,
    labels: RAGE.defaultLabels,
    today: 0,
    item: 0,
    slot: Math.floor(SLOTS / 2),
  }
  private listeners = new Set<() => void>()
  readonly throws: ThrowEvent[] = []
  request: { ndcX: number; ndcY: number; power: number } | null = null

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.snap

  get active() {
    return this.snap.active
  }

  private set(patch: Partial<RageSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l())
  }

  private nearSlot = Math.floor(SLOTS / 2)

  enter() {
    if (!this.snap.active) this.set({ active: true, slot: this.nearSlot })
  }

  cycle(step: number) {
    this.set({ slot: (this.snap.slot + step + SLOTS) % SLOTS })
  }

  exit() {
    if (this.snap.active) this.set({ active: false })
    this.request = null
  }

  setNear(near: boolean, slot: number) {
    this.nearSlot = slot
    if (near !== this.snap.near) this.set({ near })
  }

  setItem(item: number) {
    if (item >= 0 && item < ITEMS.length && item !== this.snap.item) this.set({ item })
  }

  setSlot(slot: number) {
    if (slot >= 0 && slot < SLOTS && slot !== this.snap.slot) this.set({ slot })
  }

  applyServer(labels: unknown, today: unknown) {
    const ok =
      Array.isArray(labels) &&
      labels.length === SLOTS &&
      labels.every((n) => Number.isInteger(n) && n >= 0 && n < NICKNAMES.length)
    this.set({
      labels: ok ? (labels as number[]) : this.snap.labels,
      today: typeof today === 'number' && today >= 0 ? today : this.snap.today,
    })
  }

  addOwn(e: ThrowEvent, counted: boolean) {
    this.throws.push(e)
    if (counted) this.set({ today: this.snap.today + 1 })
  }

  reset() {
    this.throws.length = 0
    this.request = null
    this.snap = { ...this.snap, active: false, near: false, today: 0, labels: RAGE.defaultLabels }
    this.listeners.forEach((l) => l())
  }
}

export const rage = new RageState()

export const useRage = () => useSyncExternalStore(rage.subscribe, rage.getSnapshot)
