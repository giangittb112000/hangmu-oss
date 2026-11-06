import { useSyncExternalStore } from 'react'
import GAME from '../../shared/game-constants.json'
import type { PlayerEntry, PlayerStore } from './store'

export const PUNCH_REACH = 1.8
export const PUNCH_NEAR = 0.9
export const PUNCH_HALF_ANGLE = Math.acos(0.34)
const ARC_COS = Math.cos(PUNCH_HALF_ANGLE)
export const PUNCH_COOLDOWN_MARGIN_MS = 150
export const PUNCH_COOLDOWN_MS = GAME.punchCooldownMs + PUNCH_COOLDOWN_MARGIN_MS

const NO_SKIP: ReadonlySet<number> = new Set()

export function findNearestInArc(
  store: PlayerStore,
  me: PlayerEntry,
  reach: number,
  near: number,
  arcCos: number,
  skip: ReadonlySet<number> = NO_SKIP,
): PlayerEntry | null {
  const fx = Math.sin(me.curr.heading)
  const fz = Math.cos(me.curr.heading)
  const mx = me.curr.x + me.blendX
  const mz = me.curr.z + me.blendZ
  const reach2 = reach * reach
  let best: PlayerEntry | null = null
  let bestD2 = Infinity
  for (const e of store.players.values()) {
    if (e.isLocal || !e.remote) continue
    const dx = e.curr.x + e.blendX - mx
    const dz = e.curr.z + e.blendZ - mz
    const d2 = dx * dx + dz * dz
    if (d2 > reach2 || d2 >= bestD2) continue
    const d = Math.sqrt(d2)
    if (d > near && (dx * fx + dz * fz) / d < arcCos) continue
    if (skip.size > 0 && skip.has(Number(e.id))) continue
    best = e
    bestD2 = d2
  }
  return best
}

export const findPunchTarget = (store: PlayerStore, me: PlayerEntry, skip?: ReadonlySet<number>) =>
  findNearestInArc(store, me, PUNCH_REACH, PUNCH_NEAR, ARC_COS, skip)

export type PunchAimState = { id: string; name: string } | null

export class PunchAim {
  private state: PunchAimState = null
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.state

  set(e: PlayerEntry | null) {
    const cur = this.state
    if (e ? cur?.id === e.id && cur.name === e.name : cur === null) return
    this.state = e ? { id: e.id, name: e.name } : null
    this.listeners.forEach((l) => l())
  }
}

export const punchAim = new PunchAim()

export const usePunchAim = () => useSyncExternalStore(punchAim.subscribe, punchAim.getSnapshot)
