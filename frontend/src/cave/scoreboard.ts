import { drawClubLogo, loadClubLogo } from '../world/clubLogo'
import { projectedMinute, type GoalEvent, type MatchSnapshot, type TeamInfo } from '../match'

export type ScoreboardState = { kind: 'idle' } | { kind: 'match'; match: MatchSnapshot }

export const SCREEN_W = 1280
export const SCREEN_H = 720

const W = SCREEN_W
const H = SCREEN_H
const CREAM = '#f2e6cf'
const MUTED = 'rgba(242,230,207,0.62)'
const RED = '#da291c'
const UI = '"Be Vietnam Pro", system-ui, sans-serif'
const SERIF = 'Bitter, Georgia, serif'

export type ScoreboardAssets = { logo: HTMLImageElement | null }

let assets: Promise<ScoreboardAssets> | undefined

export function loadScoreboardAssets(): Promise<ScoreboardAssets> {
  const sample = 'HANG MU TRỰC TIẾP Thứ Bảy ắằẳẵặ 0123456789'
  assets ??= Promise.all([
    document.fonts.load(`800 80px ${SERIF}`, sample).catch(() => undefined),
    document.fonts.load(`600 40px ${UI}`, sample).catch(() => undefined),
    document.fonts.load(`500 40px ${UI}`, sample).catch(() => undefined),
    loadClubLogo(),
  ]).then(([, , , logo]) => ({ logo }))
  return assets
}

export function drawScoreboard(
  canvas: HTMLCanvasElement,
  state: ScoreboardState,
  { logo }: ScoreboardAssets,
  now = Date.now(),
) {
  const c = canvas.getContext('2d')!
  c.textBaseline = 'middle'

  const bg = c.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#16090a')
  bg.addColorStop(1, '#2a0b0c')
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)

  c.fillStyle = RED
  c.fillRect(0, 0, W, 120)
  c.fillStyle = '#fff6ec'
  c.textAlign = 'left'
  c.font = `800 64px ${SERIF}`
  c.fillText('HANG MU TRỰC TIẾP', 150, 62)
  if (logo) drawClubLogo(c, logo, 80, 60, 96)

  if (state.kind === 'idle') drawIdle(c)
  else drawMatch(c, state.match, now)

  c.fillStyle = 'rgba(0,0,0,0.18)'
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1)
}

function drawIdle(c: CanvasRenderingContext2D) {
  c.textAlign = 'center'
  c.fillStyle = CREAM
  c.font = `600 70px ${UI}`
  c.fillText('Chưa có lịch thi đấu', W / 2, H / 2 + 20)
  c.fillStyle = MUTED
  c.font = `500 40px ${UI}`
  c.fillText('Trận tiếp theo của MU sẽ hiện ở đây', W / 2, H / 2 + 110)
}

function drawMatch(c: CanvasRenderingContext2D, m: MatchSnapshot, now: number) {
  const halftime = m.statusName.includes('HALFTIME')

  c.textAlign = 'center'
  c.fillStyle = MUTED
  c.font = `600 30px ${UI}`
  c.fillText(fit(c, m.competition.toUpperCase(), 900), W / 2, 162)
  drawStatusPill(c, m, halftime)

  drawTeam(c, m.home, 250)
  drawTeam(c, m.away, W - 250)

  c.textAlign = 'center'
  if (m.state === 'pre') {
    c.fillStyle = MUTED
    c.font = `800 110px ${SERIF}`
    c.fillText('VS', W / 2, 330)
  } else {
    c.fillStyle = '#fff6ec'
    c.font = `800 150px ${SERIF}`
    c.fillText(`${m.home.score ?? 0} – ${m.away.score ?? 0}`, W / 2, 325)
    if (m.home.pen != null || m.away.pen != null) {
      c.fillStyle = CREAM
      c.font = `600 34px ${UI}`
      c.fillText(`Luân lưu ${m.home.pen ?? 0} – ${m.away.pen ?? 0}`, W / 2, 425)
    }
  }

  if (m.state === 'pre') {
    c.fillStyle = CREAM
    c.font = `600 46px ${UI}`
    c.fillText(formatKickoff(m.kickoffAt), W / 2, 540)
    c.fillStyle = '#fbe122'
    c.font = `600 40px ${UI}`
    c.fillText(countdown(m.kickoffAt - now), W / 2, 610)
  } else {
    if (m.state === 'in' && !halftime) {
      c.fillStyle = '#fbe122'
      c.font = `800 52px ${SERIF}`
      c.fillText(formatMinute(m, now), W / 2, 445)
    }
    drawGoals(c, m.goals)
  }

  if (m.stale) {
    c.textAlign = 'right'
    c.fillStyle = MUTED
    c.font = `500 24px ${UI}`
    c.fillText('đang cập nhật…', W - 30, H - 30)
  }
}

function drawStatusPill(c: CanvasRenderingContext2D, m: MatchSnapshot, halftime: boolean) {
  const [label, color] =
    m.state === 'pre'
      ? ['SẮP DIỄN RA', '#5a4a3a']
      : m.state === 'post'
        ? ['KẾT THÚC', '#4a4a4a']
        : halftime
          ? ['NGHỈ GIỮA HIỆP', '#8a6a10']
          : ['● TRỰC TIẾP', RED]
  c.font = `600 28px ${UI}`
  const w = c.measureText(label).width + 44
  c.fillStyle = color
  c.beginPath()
  c.roundRect(W / 2 - w / 2, 192, w, 46, 23)
  c.fill()
  c.fillStyle = '#fff6ec'
  c.textAlign = 'center'
  c.fillText(label, W / 2, 216)
}

function drawTeam(c: CanvasRenderingContext2D, t: TeamInfo, cx: number) {
  c.textAlign = 'center'
  c.fillStyle = '#fff6ec'
  c.font = `800 ${t.short.length > 3 ? 104 : 120}px ${SERIF}`
  c.fillText(fit(c, t.short, 360), cx, 330)

  c.fillStyle = CREAM
  c.font = `600 32px ${UI}`
  c.fillText(fit(c, t.name, 360), cx, 420)
}

function drawGoals(c: CanvasRenderingContext2D, goals: GoalEvent[]) {
  const MAX = 4
  c.font = `500 28px ${UI}`
  c.fillStyle = CREAM
  for (const [side, x, align] of [
    ['home', 90, 'left'],
    ['away', W - 90, 'right'],
  ] as const) {
    const list = goals.filter((g) => g.side === side)
    c.textAlign = align
    list.slice(0, MAX).forEach((g, i) => {
      c.fillText(fit(c, `⚽ ${g.minute} ${g.player}${goalNote(g.kind)}`, 480), x, 520 + i * 44)
    })
    if (list.length > MAX) c.fillText(`+${list.length - MAX} bàn nữa`, x, 520 + MAX * 44)
  }
}

function goalNote(kind: string) {
  if (kind.includes('own')) return ' (phản lưới)'
  if (kind.includes('penalty')) return ' (pen)'
  return ''
}

function formatMinute(m: MatchSnapshot, now: number) {
  const min = projectedMinute(m, now)
  if (min == null) return m.detail
  const cap = [0, 45, 90, 105, 120][m.period] ?? 120
  return min > cap ? `${cap}+${min - cap}'` : `${min}'`
}

const kickoffFmt = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatKickoff(ms: number) {
  const p = Object.fromEntries(kickoffFmt.formatToParts(ms).map((x) => [x.type, x.value]))
  const weekday = (p.weekday ?? '').replace(/^./, (ch) => ch.toUpperCase())
  return `${weekday}, ${p.day}/${p.month} · ${p.hour}:${p.minute}`
}

function countdown(ms: number) {
  if (ms <= 60_000) return 'Sắp bắt đầu'
  const mins = Math.floor(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const mm = mins % 60
  if (d > 0) return `Còn ${d} ngày ${h} giờ`
  if (h > 0) return `Còn ${h} giờ ${mm} phút`
  return `Còn ${mm} phút`
}

function fit(c: CanvasRenderingContext2D, text: string, maxW: number) {
  if (c.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

export type GoalScreen = { scorer: string; minute: string; scoreLine: string }

export function drawGoalScreen(
  canvas: HTMLCanvasElement,
  goal: GoalScreen,
  flash: boolean,
  { logo }: ScoreboardAssets,
) {
  const c = canvas.getContext('2d')!
  c.textBaseline = 'middle'
  c.textAlign = 'center'
  const fg = flash ? RED : '#fff6ec'
  c.fillStyle = flash ? '#fff6ec' : RED
  c.fillRect(0, 0, W, H)

  c.save()
  c.translate(W / 2, H / 2)
  c.fillStyle = flash ? 'rgba(218,41,28,0.12)' : 'rgba(255,255,255,0.12)'
  for (let k = 0; k < 16; k++) {
    c.rotate((Math.PI * 2) / 16)
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(W, -70)
    c.lineTo(W, 70)
    c.closePath()
    c.fill()
  }
  c.restore()

  if (logo) {
    drawClubLogo(c, logo, 150, 150, 170)
    drawClubLogo(c, logo, W - 150, 150, 170)
  }
  c.fillStyle = fg
  c.font = `800 210px ${SERIF}`
  c.fillText(fit(c, 'VÀOOOO!', W - 120), W / 2, 330)
  c.font = `600 54px ${UI}`
  const who = [goal.minute, goal.scorer].filter(Boolean).join('  ')
  c.fillText(fit(c, who ? `⚽ ${who}` : 'GLORY GLORY MAN UNITED!', W - 160), W / 2, 500)
  c.font = `800 70px ${SERIF}`
  c.fillText(fit(c, goal.scoreLine, W - 160), W / 2, 610)

  c.fillStyle = 'rgba(0,0,0,0.14)'
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1)
}
