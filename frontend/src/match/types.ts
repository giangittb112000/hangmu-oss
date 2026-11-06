export type MatchState = 'pre' | 'in' | 'post'

export type Side = 'home' | 'away'

export type TeamInfo = {
  id: string
  name: string
  short: string
  score: number | null
  pen: number | null
}

export type GoalEvent = {
  id: string
  kind: string
  minute: string
  side: Side | null
  player: string
}

export type MatchSnapshot = {
  id: string
  competition: string
  kickoffAt: number
  state: MatchState
  statusName: string
  detail: string
  period: number
  clock: { minute: number | null; at: number }
  home: TeamInfo
  away: TeamInfo
  goals: GoalEvent[]
  stale: boolean
}

export type MatchChange =
  | 'new-match'
  | 'status'
  | 'info'
  | 'score'
  | 'goal'
  | 'goal-disallowed'
  | 'goals'
  | 'clock'
  | 'stale'
  | 'fresh'
  | 'no-match'
