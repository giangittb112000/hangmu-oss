import { useSyncExternalStore } from 'react'
import { celebration } from '../cave/celebration'

export type Part = { text: string; bold?: boolean }

export type NoticeKind = 'tele_join' | 'room_join' | 'tele_invite'
export type Notice = { kind: NoticeKind; names: string[]; more: number; variant?: number }

export const TELE_INVITE_LINES: Part[][] = [
  [
    { text: 'Vào ' },
    { text: 'group Tele HangMu', bold: true },
    { text: ' để nhận lịch & thông tin trận MU!' },
  ],
  [
    { text: 'Không muốn lỡ trận nào? Vào ' },
    { text: 'group Tele HangMu', bold: true },
    { text: ' nhé!' },
  ],
  [
    { text: 'Tỷ số, đội hình, giờ bóng lăn — có hết trong ' },
    { text: 'group Tele HangMu', bold: true },
  ],
  [
    { text: 'Anh em đang bàn trận tối nay trong ' },
    { text: 'group Tele HangMu', bold: true },
    { text: ' 🔴' },
  ],
]

export const NOTICE_STYLE: Record<NoticeKind, { icon: string; sub: string }> = {
  tele_join: { icon: '✈', sub: 'Vào cùng anh em → nút ✈ phía trên' },
  room_join: { icon: '👋', sub: 'Chào anh em một câu đi!' },
  tele_invite: { icon: '📣', sub: 'Bấm nút ✈ phía trên để vào group' },
}
export type ShownNotice = Notice & { id: number }

export const NOTICE_SHOW_MS = 4200
const GAP_MS = 500
const STALE_MS = 15_000
const QUEUE_MAX = 3
const RETRY_MS = 500
const WAVE_AT = 10
const NAMES_SHOWN = 2

type Item = Notice & { at: number }

export function noticeParts(n: Notice): Part[] {
  if (n.kind === 'tele_invite') {
    return TELE_INVITE_LINES[(n.variant ?? 0) % TELE_INVITE_LINES.length]!
  }
  const total = n.names.length + n.more
  const tele = n.kind === 'tele_join'
  if (total >= WAVE_AT) {
    return [
      { text: '🔥 ' },
      { text: String(total), bold: true },
      { text: tele ? ' anh em vừa vào group Tele!' : ' anh em vừa vào hang!' },
    ]
  }
  const tail = { text: tele ? ' đã tham gia Tele HangMu.online' : ' vừa vào hang' }
  if (n.names.length === 0) return [{ text: String(n.more), bold: true }, { text: ' anh em' }, tail]
  const [a, b] = n.names as [string, string | undefined]
  if (n.more > 0) {
    return [
      { text: a, bold: true },
      ...(b ? [{ text: ', ' }, { text: b, bold: true }] : []),
      { text: ' và ' },
      { text: String(n.more), bold: true },
      { text: ' anh em khác' },
      tail,
    ]
  }
  return b
    ? [{ text: a, bold: true }, { text: ' và ' }, { text: b, bold: true }, tail]
    : [{ text: a, bold: true }, tail]
}

export const isWave = (n: Notice) => n.names.length + n.more >= WAVE_AT

function merge(a: Notice, b: Notice): Notice {
  const names = [...a.names, ...b.names]
  const shown = names.slice(0, NAMES_SHOWN)
  return { kind: a.kind, names: shown, more: a.more + b.more + (names.length - shown.length) }
}

class NoticeQueue {
  private current: ShownNotice | null = null
  private queue: Item[] = []
  private seq = 0
  private holders = new Set<symbol>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.current

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.pump()
      })
    }
  }

  push(n: Notice) {
    const same = this.queue.findIndex((q) => q.kind === n.kind)
    if (same >= 0) {
      const q = this.queue[same]!
      this.queue[same] = { ...merge(q, n), at: q.at }
    } else {
      if (this.queue.length >= QUEUE_MAX) this.queue.shift()
      this.queue.push({ ...n, at: performance.now() })
    }
    this.pump()
  }

  hold(): () => void {
    const token = Symbol('notice-hold')
    this.holders.add(token)
    return () => {
      if (this.holders.delete(token)) this.pump()
    }
  }

  reset() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.queue = []
    if (this.current) {
      this.current = null
      this.emit()
    }
  }

  private pump = () => {
    if (this.current || this.timer) return
    const now = performance.now()
    this.queue = this.queue.filter((q) => now - q.at <= STALE_MS)
    if (this.queue.length === 0) return
    if (typeof document !== 'undefined' && document.hidden) return
    if (this.holders.size > 0 || celebration.state) {
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.pump()
      }, RETRY_MS)
      return
    }
    const next = this.queue.shift()!
    this.current = { kind: next.kind, names: next.names, more: next.more, id: ++this.seq }
    this.emit()
    this.timer = setTimeout(() => {
      this.current = null
      this.emit()
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.pump()
      }, GAP_MS)
    }, NOTICE_SHOW_MS)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}

export const notices = new NoticeQueue()

export const useNotice = () => useSyncExternalStore(notices.subscribe, notices.getSnapshot)
