import { fetchEspn, parseGoals, parseLastResult, parseTeam, TEAM_ID } from './espn'
import type { MatchChange, MatchSnapshot } from './types'

const SEC = 1000
const MIN = 60 * SEC

const LIVE_EVERY = 15 * SEC
const HALFTIME_EVERY = 30 * SEC
const PRE_EVERY = 60 * SEC
const PRE_WINDOW = 15 * MIN
const IDLE_MAX = 30 * MIN
const POST_EVERY = 10 * MIN
const RESULT_HOLD = 2 * 24 * 60 * MIN
const NEXT_TAKEOVER = 6 * 60 * MIN
const SCHEDULE_EVERY = 10 * MIN
const STALE_AFTER = 2 * MIN
const CLOCK_DRIFT_MIN = 2

const aligned = (period: number) => period - (Date.now() % period)

export function projectedMinute(s: MatchSnapshot, now = Date.now()): number | null {
  if (s.clock.minute == null) return null
  if (s.state !== 'in' || s.statusName.includes('HALFTIME')) return s.clock.minute
  return s.clock.minute + Math.floor((now - s.clock.at) / MIN)
}

const scoreLine = (s: MatchSnapshot) =>
  `${s.home.short} ${s.home.score ?? '-'}–${s.away.score ?? '-'} ${s.away.short}` +
  (s.home.pen != null || s.away.pen != null ? ` (pen ${s.home.pen}–${s.away.pen})` : '') +
  ` · ${s.state === 'in' ? `${projectedMinute(s)}'` : s.detail} · ${s.statusName}`

export class MatchTracker {
  private current: MatchSnapshot | null = null
  private listeners = new Set<() => void>()
  private running = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private ctrl: AbortController | undefined
  private failures = 0
  private failingSince: number | null = null
  private goalsKey = ''
  private lastResult: { at: number; snap: MatchSnapshot | null } | null = null
  private upcoming: MatchSnapshot | null = null

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.current

  start() {
    if (this.running) return
    this.running = true
    document.addEventListener('visibilitychange', this.onVisibility)
    if (!document.hidden) void this.poll()
  }

  stop() {
    this.running = false
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.cancel()
  }

  refresh() {
    if (this.running) void this.poll()
  }

  private cancel() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.ctrl?.abort()
    this.ctrl = undefined
  }

  private onVisibility = () => {
    if (document.hidden) this.cancel()
    else if (this.running) void this.poll()
  }

  private schedule(delay: number) {
    clearTimeout(this.timer)
    if (!this.running || document.hidden) return
    this.timer = setTimeout(() => void this.poll(), Math.max(1000, delay))
  }

  private async poll() {
    this.cancel()
    const ctrl = new AbortController()
    this.ctrl = ctrl
    let next: MatchSnapshot | null
    let upcoming: MatchSnapshot | null = null
    try {
      next = parseTeam(await fetchEspn(`all/teams/${TEAM_ID}`, ctrl.signal))
      if (next?.state !== 'in') {
        const last = await this.recentResult(ctrl.signal)
        if (last && last.id !== next?.id && this.holdResult(last, next)) {
          upcoming = next
          next = last
        }
      }
      if (next) await this.attachGoals(next, ctrl.signal)
    } catch (err) {
      if (ctrl.signal.aborted) return
      this.onError(err)
      return
    }
    if (ctrl !== this.ctrl) return
    this.ctrl = undefined
    this.failures = 0
    this.failingSince = null
    this.upcoming = upcoming
    this.apply(next)
    this.schedule(this.nextDelay(next))
  }

  private async recentResult(signal: AbortSignal): Promise<MatchSnapshot | null> {
    const now = Date.now()
    if (this.lastResult && now - this.lastResult.at < SCHEDULE_EVERY) return this.lastResult.snap
    try {
      const snap = parseLastResult(await fetchEspn(`all/teams/${TEAM_ID}/schedule`, signal))
      this.lastResult = { at: now, snap }
      return snap
    } catch (err) {
      if (signal.aborted) throw err
      console.warn('[match] không lấy được lịch thi đấu, dùng bản cũ', err)
      return this.lastResult?.snap ?? null
    }
  }

  private holdResult(last: MatchSnapshot, next: MatchSnapshot | null, now = Date.now()) {
    if (now - last.kickoffAt >= RESULT_HOLD) return false
    return !next || next.kickoffAt - now > NEXT_TAKEOVER
  }

  private async attachGoals(next: MatchSnapshot, signal: AbortSignal) {
    const prev = this.current
    const same = prev?.id === next.id
    if (same) next.goals = prev.goals
    const total = (next.home.score ?? 0) + (next.away.score ?? 0)
    if (next.state === 'pre' || total === 0) {
      next.goals = []
      return
    }
    const key = `${next.id}:${next.home.score ?? 0}-${next.away.score ?? 0}`
    if (key === this.goalsKey) return
    try {
      const summary = await fetchEspn(`all/summary?event=${next.id}`, signal)
      next.goals = parseGoals(summary, next.home.id, next.away.id)
      this.goalsKey = key
    } catch (err) {
      if (signal.aborted) throw err
      console.warn('[match] không lấy được danh sách bàn thắng, dùng bản cũ', err)
    }
  }

  private onError(err: unknown) {
    this.ctrl = undefined
    this.failures++
    this.failingSince ??= Date.now()
    console.warn(`[match] lỗi lấy dữ liệu (lần ${this.failures})`, err)
    const cur = this.current
    if (cur && !cur.stale && Date.now() - this.failingSince > STALE_AFTER) {
      this.current = { ...cur, stale: true }
      this.emit(['stale'])
    }
    this.schedule(Math.min(5 * SEC * 2 ** (this.failures - 1), 60 * SEC))
  }

  private apply(next: MatchSnapshot | null) {
    const prev = this.current
    const changes: MatchChange[] = []

    if (!next) {
      if (prev) changes.push('no-match')
    } else if (!prev || prev.id !== next.id) {
      changes.push('new-match')
    } else {
      if (
        prev.state !== next.state ||
        prev.statusName !== next.statusName ||
        prev.period !== next.period
      ) {
        changes.push('status')
      }
      if (
        prev.kickoffAt !== next.kickoffAt ||
        prev.competition !== next.competition ||
        prev.home.name !== next.home.name ||
        prev.home.short !== next.home.short ||
        prev.away.name !== next.away.name ||
        prev.away.short !== next.away.short ||
        (next.state !== 'in' && prev.detail !== next.detail)
      ) {
        changes.push('info')
      }
      const delta =
        (next.home.score ?? 0) +
        (next.away.score ?? 0) -
        (prev.home.score ?? 0) -
        (prev.away.score ?? 0)
      if (delta > 0) changes.push('goal')
      else if (delta < 0) changes.push('goal-disallowed')
      else if (prev.home.score !== next.home.score || prev.away.score !== next.away.score) {
        changes.push('score')
      }
      if (prev.home.pen !== next.home.pen || prev.away.pen !== next.away.pen) changes.push('score')
      if (prev.goals.map((g) => g.id).join() !== next.goals.map((g) => g.id).join()) {
        changes.push('goals')
      }
      const projected = projectedMinute(prev)
      if (
        next.clock.minute != null &&
        (projected == null || Math.abs(projected - next.clock.minute) >= CLOCK_DRIFT_MIN)
      ) {
        changes.push('clock')
      }
      if (prev.stale) changes.push('fresh')
    }

    if (changes.length === 0) {
      if (import.meta.env.DEV && next) console.debug('[match] không đổi', scoreLine(next))
      return
    }
    this.current = next
    this.emit(changes)
  }

  private emit(changes: MatchChange[]) {
    const s = this.current
    console.info(`[match] ${changes.join(', ')} →`, s ? scoreLine(s) : 'không có trận', s)
    if (s && changes.includes('goal')) {
      const g = s.goals.at(-1)
      if (g) console.info(`[match] ⚽ VÀOOOO! ${g.minute} ${g.player} (${g.side ?? '?'})`)
    }
    for (const fn of this.listeners) fn()
  }

  private nextDelay(s: MatchSnapshot | null): number {
    if (!s) return IDLE_MAX
    switch (s.state) {
      case 'pre': {
        const untilWindow = s.kickoffAt - PRE_WINDOW - Date.now()
        return untilWindow > 0 ? Math.min(IDLE_MAX, untilWindow) : aligned(PRE_EVERY)
      }
      case 'in':
        return aligned(s.statusName.includes('HALFTIME') ? HALFTIME_EVERY : LIVE_EVERY)
      case 'post': {
        const up = this.upcoming
        if (!up) return POST_EVERY
        const now = Date.now()
        return Math.min(
          POST_EVERY,
          s.kickoffAt + RESULT_HOLD - now,
          up.kickoffAt - NEXT_TAKEOVER - now,
        )
      }
    }
  }
}

export const matchTracker = new MatchTracker()
