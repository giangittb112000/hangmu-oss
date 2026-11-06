import { config } from '../config'
import type { GoalEvent, MatchSnapshot, MatchState, Side, TeamInfo } from './types'

export const TEAM_ID = '360'

export async function fetchEspn(path: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(config.apiTimeoutMs)
  const res = await fetch(`/ext/espn/${path}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`ESPN ${path}: HTTP ${res.status}`)
  return res.json()
}

type Json = Record<string, unknown>

const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback

function readScore(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  const o = obj(v)
  if (!o) return null
  return readScore(o.value ?? o.displayValue)
}

function readTeam(c: Json | undefined): TeamInfo {
  const team = obj(c?.team)
  return {
    id: str(team?.id),
    name: str(team?.displayName, '?'),
    short: str(team?.abbreviation, '?'),
    score: readScore(c?.score),
    pen: readScore(c?.shootoutScore),
  }
}

function readMinute(display: string): number | null {
  const n = Number.parseInt(display, 10)
  return Number.isFinite(n) ? n : null
}

export function parseTeam(json: unknown, now = Date.now()): MatchSnapshot | null {
  return parseEvent(obj(arr(obj(obj(json)?.team)?.nextEvent)[0]), now)
}

export function parseLastResult(json: unknown, now = Date.now()): MatchSnapshot | null {
  let last: Json | undefined
  let lastAt = -Infinity
  for (const raw of arr(obj(json)?.events)) {
    const ev = obj(raw)
    const type = obj(obj(obj(arr(ev?.competitions)[0])?.status)?.type)
    const at = Date.parse(str(ev?.date))
    const finished = str(type?.state) === 'post' && type?.completed === true
    if (finished && Number.isFinite(at) && at <= now && at > lastAt) {
      last = ev
      lastAt = at
    }
  }
  return parseEvent(last, now)
}

function parseEvent(ev: Json | undefined, now: number): MatchSnapshot | null {
  const comp = obj(arr(ev?.competitions)[0])
  if (!ev || !comp) return null

  const status = obj(comp.status)
  const type = obj(status?.type)
  const state = str(type?.state) as MatchState
  if (state !== 'pre' && state !== 'in' && state !== 'post') {
    console.warn('[match] trạng thái lạ từ ESPN', type)
    return null
  }
  const competitors = arr(comp.competitors).map(obj)
  const home = competitors.find((c) => c?.homeAway === 'home')
  const away = competitors.find((c) => c?.homeAway === 'away')
  if (!home || !away) return null

  const kickoffAt = Date.parse(str(ev.date))
  const league = obj(ev.league)
  return {
    id: str(ev.id),
    competition: str(league?.name ?? league?.abbreviation),
    kickoffAt: Number.isFinite(kickoffAt) ? kickoffAt : 0,
    state,
    statusName: str(type?.name),
    detail: str(type?.shortDetail ?? type?.detail),
    period: Number(status?.period) || 0,
    clock: { minute: state === 'in' ? readMinute(str(status?.displayClock)) : null, at: now },
    home: readTeam(home),
    away: readTeam(away),
    goals: [],
    stale: false,
  }
}

export function parseGoals(json: unknown, homeId: string, awayId: string): GoalEvent[] {
  const goals: GoalEvent[] = []
  for (const raw of arr(obj(json)?.keyEvents)) {
    const k = obj(raw)
    if (!k || k.scoringPlay !== true || k.shootout === true) continue
    const teamId = str(obj(k.team)?.id)
    const side: Side | null = teamId === homeId ? 'home' : teamId === awayId ? 'away' : null
    const athlete = obj(obj(arr(k.participants)[0])?.athlete)
    goals.push({
      id: str(k.id),
      kind: str(obj(k.type)?.type, 'goal'),
      minute: str(obj(k.clock)?.displayValue),
      side,
      player: str(athlete?.displayName ?? k.shortText),
    })
  }
  return goals
}
