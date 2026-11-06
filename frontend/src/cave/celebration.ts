import { useSyncExternalStore } from 'react'
import { matchTracker, type MatchSnapshot } from '../match'
import { TEAM_ID } from '../match/espn'
import { playCheer } from '../audio/cheer'

export type GoalInfo = {
  scorer: string
  minute: string
  scoreLine: string
}

export type CelebrationState = (GoalInfo & { id: number; startedAt: number }) | null

export const CELEBRATION_MS = 9000
const RISE_MS = 250
const HOLD_MS = 5500

class Celebration {
  state: CelebrationState = null
  private seq = 0
  private endTimer: ReturnType<typeof setTimeout> | undefined
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState = () => this.state

  trigger(info: GoalInfo) {
    clearTimeout(this.endTimer)
    this.state = { ...info, id: ++this.seq, startedAt: performance.now() }
    this.endTimer = setTimeout(() => this.stop(), CELEBRATION_MS)
    playCheer()
    this.emit()
  }

  stop() {
    clearTimeout(this.endTimer)
    if (!this.state) return
    this.state = null
    this.emit()
  }

  elapsed(now = performance.now()) {
    return this.state ? (now - this.state.startedAt) / 1000 : -1
  }

  level(now = performance.now()) {
    if (!this.state) return 0
    const t = now - this.state.startedAt
    if (t < RISE_MS) return t / RISE_MS
    if (t < HOLD_MS) return 1
    const k = 1 - (t - HOLD_MS) / (CELEBRATION_MS - HOLD_MS)
    return k > 0 ? k * k : 0
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}

export const celebration = new Celebration()

export const useCelebration = () =>
  useSyncExternalStore(celebration.subscribe, celebration.getState)

const muSide = (m: MatchSnapshot) => (m.home.id === TEAM_ID ? 'home' : 'away')

export function celebrateNow() {
  const m = matchTracker.getSnapshot()
  if (!m || m.state !== 'in') {
    celebration.trigger({ scorer: '', minute: '', scoreLine: '' })
    return
  }
  const g = m.goals.filter((x) => x.side === muSide(m)).at(-1)
  celebration.trigger({
    scorer: g?.player ?? '',
    minute: g?.minute ?? '',
    scoreLine: `${m.home.short} ${m.home.score ?? 0}–${m.away.score ?? 0} ${m.away.short}`,
  })
}
