import type { Notice } from './notices'
import GAME from '../shared/game-constants.json'

export const OP = {
  MOVE: 0x01,
  PING: 0x02,
  WELCOME: 0x80,
  MOVES: 0x81,
  CORRECTION: 0x82,
  PONG: 0x83,
} as const

const POS_SCALE = GAME.posScale
const DIR_STEPS = GAME.dirSteps
const MAG_STEPS = GAME.dirMagSteps
const TAU = Math.PI * 2

export const qPos = (m: number) => Math.max(-32768, Math.min(32767, Math.round(m * POS_SCALE)))
export const dqPos = (v: number) => v / POS_SCALE

export const qHeading = (rad: number) => ((Math.round((rad / TAU) * 256) % 256) + 256) % 256
export const dqHeading = (v: number) => {
  const a = (v / 256) * TAU
  return a > Math.PI ? a - TAU : a
}

export function qDir(mx: number, mz: number): number {
  const len = Math.min(1, Math.hypot(mx, mz))
  const mag = Math.round(len * MAG_STEPS)
  if (mag === 0) return 0
  const idx =
    ((Math.round((Math.atan2(mx, mz) / TAU) * DIR_STEPS) % DIR_STEPS) + DIR_STEPS) % DIR_STEPS
  return (mag << 5) | idx
}

export function dqDir(dir: number, out: { mx: number; mz: number }) {
  const mag = dir >> 5
  if (mag === 0) {
    out.mx = 0
    out.mz = 0
    return out
  }
  const a = ((dir & 31) / DIR_STEPS) * TAU
  const len = mag / MAG_STEPS
  out.mx = Math.sin(a) * len
  out.mz = Math.cos(a) * len
  return out
}

export type MoveRec = {
  index: number
  tick: number
  x: number
  z: number
  heading: number
  dir: number
}
export type WelcomeRec = { index: number; x: number; z: number; heading: number; dir: number }

export function encodeMove(
  x: number,
  z: number,
  heading: number,
  dir: number,
  clientTick: number,
): ArrayBuffer {
  const b = new ArrayBuffer(9)
  const v = new DataView(b)
  v.setUint8(0, OP.MOVE)
  v.setInt16(1, qPos(x), true)
  v.setInt16(3, qPos(z), true)
  v.setUint8(5, heading & 0xff)
  v.setUint8(6, dir & 0xff)
  v.setUint16(7, clientTick & 0xffff, true)
  return b
}

export function encodePing(clientTime: number): ArrayBuffer {
  const b = new ArrayBuffer(5)
  const v = new DataView(b)
  v.setUint8(0, OP.PING)
  v.setUint32(1, clientTime >>> 0, true)
  return b
}

export type ServerBinary =
  | { op: 'welcome'; entries: WelcomeRec[] }
  | { op: 'moves'; serverTick: number; records: MoveRec[] }
  | { op: 'correction'; x: number; z: number }
  | { op: 'pong'; clientTime: number; serverTick: number }

export function decodeServerBinary(buf: ArrayBuffer): ServerBinary | null {
  const v = new DataView(buf)
  if (v.byteLength < 1) return null
  const op = v.getUint8(0)
  try {
    switch (op) {
      case OP.WELCOME: {
        const n = v.getUint16(1, true)
        const entries: WelcomeRec[] = []
        for (let i = 0, o = 3; i < n; i++, o += 8) {
          entries.push({
            index: v.getUint16(o, true),
            x: dqPos(v.getInt16(o + 2, true)),
            z: dqPos(v.getInt16(o + 4, true)),
            heading: v.getUint8(o + 6),
            dir: v.getUint8(o + 7),
          })
        }
        return { op: 'welcome', entries }
      }
      case OP.MOVES: {
        const serverTick = v.getUint16(1, true)
        const n = v.getUint16(3, true)
        const records: MoveRec[] = []
        for (let i = 0, o = 5; i < n; i++, o += 10) {
          records.push({
            index: v.getUint16(o, true),
            tick: v.getUint16(o + 2, true),
            x: dqPos(v.getInt16(o + 4, true)),
            z: dqPos(v.getInt16(o + 6, true)),
            heading: v.getUint8(o + 8),
            dir: v.getUint8(o + 9),
          })
        }
        return { op: 'moves', serverTick, records }
      }
      case OP.CORRECTION:
        return { op: 'correction', x: dqPos(v.getInt16(1, true)), z: dqPos(v.getInt16(3, true)) }
      case OP.PONG:
        return { op: 'pong', clientTime: v.getUint32(1, true), serverTick: v.getUint16(5, true) }
      default:
        return null
    }
  } catch {
    return null
  }
}

export type ServerJson =
  | { t: 'queued'; position: number; inRoom: number; waiting: number }
  | {
      t: 'admitted'
      selfIndex: number
      serverTick: number
      tickHz: number
      capacity: number
      roster: { i: number; name: string; n?: number | null; b?: boolean }[]
      resumed?: boolean
      pollVoted?: boolean
    }
  | { t: 'join'; i: number; name: string; n?: number | null; x: number; z: number; b?: boolean }
  | { t: 'leave'; i: number }
  | { t: 'rejected'; reason: 'invalid_name' | 'queue_full' | 'other_tab'; retryAfter?: number }
  | { t: 'replaced' }
  | { t: 'busy'; retryAfter: number }
  | { t: 'chat'; m: [number, string][] }
  | { t: 'chatDropped'; reason: 'rate' | 'duplicate' | 'busy' | 'invalid'; id?: number }
  | { t: 'chatAck'; id: number; text: string }
  | { t: 'board'; video?: unknown; videos?: unknown }
  | { t: 'punched'; by: number }
  | { t: 'punchHit'; target: number; text: string }
  | { t: 'notice'; kind: string; names: unknown; more: unknown }
  | { t: 'poll'; id: number; q: string; options: string[] }
  | { t: 'rage'; labels: unknown; today: unknown }

export const encodeLeave = () => JSON.stringify({ t: 'leave' })

export const encodeEnter = (name: string, number: number | null = null, tab?: string) =>
  JSON.stringify({
    t: 'enter',
    name,
    ...(number == null ? {} : { number }),
    ...(tab ? { tab } : {}),
  })

export const jerseyNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99 ? v : null
export const encodePunch = (target: number) => JSON.stringify({ t: 'punch', target })
export const encodeThrow = (slot: number, item: number, u: number, v: number) =>
  JSON.stringify({
    t: 'throw',
    slot,
    item,
    u: Math.round(u * 100) / 100,
    v: Math.round(v * 100) / 100,
  })
export const encodeRageLabel = (slot: number, nick: number) =>
  JSON.stringify({ t: 'rageLabel', slot, nick })

export function parseNotice(m: { kind: string; names: unknown; more: unknown }): Notice | null {
  const kind = m.kind
  if (kind !== 'tele_join' && kind !== 'room_join') return null
  if (!Array.isArray(m.names) || m.names.length > 2) return null
  const names = m.names.filter(
    (n): n is string => typeof n === 'string' && n.length > 0 && n.length <= 40,
  )
  const more = m.more
  if (names.length !== m.names.length) return null
  if (typeof more !== 'number' || !Number.isInteger(more) || more < 0 || more > 100_000) return null
  if (names.length + more === 0) return null
  return { kind, names, more }
}

export const punchText = (victim: string) => `đã 👊 ${victim}`

export const encodeVote = (poll: number, option: number) =>
  JSON.stringify({ t: 'vote', poll, option })

export type Poll = { id: number; q: string; options: string[] }

export function parsePoll(m: { id: unknown; q: unknown; options: unknown }): Poll | null {
  const ok = (v: unknown, max: number): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= max
  if (!Number.isInteger(m.id) || !ok(m.q, 200) || !Array.isArray(m.options)) return null
  const options = m.options.filter((o): o is string => ok(o, 60))
  if (options.length < 2 || options.length > 6 || options.length !== m.options.length) return null
  return { id: m.id as number, q: m.q, options }
}

export const voteText = (option: string) => `🗳️ Bình chọn: ${option}`

export const encodeChat = (text: string, id: number) => JSON.stringify({ t: 'chat', text, id })

const isInvisible = (cp: number) =>
  cp <= 0x1f ||
  (cp >= 0x7f && cp <= 0x9f) ||
  cp === 0x00ad ||
  cp === 0x034f ||
  cp === 0x115f ||
  cp === 0x1160 ||
  cp === 0x17b4 ||
  cp === 0x17b5 ||
  cp === 0x180e ||
  (cp >= 0x200b && cp <= 0x200f) ||
  (cp >= 0x2028 && cp <= 0x202e) ||
  (cp >= 0x2060 && cp <= 0x2064) ||
  (cp >= 0x2066 && cp <= 0x2069) ||
  cp === 0x2800 ||
  cp === 0x3164 ||
  cp === 0xfeff ||
  cp === 0xffa0 ||
  (cp >= 0xe0000 && cp <= 0xe007f)
const MARK_PILE = /(\p{M}{2})\p{M}+/gu

export function sanitizeChat(raw: string) {
  const visible = Array.from(raw.replace(/[\n\t]/g, ' '))
    .filter((c) => !isInvisible(c.codePointAt(0)!))
    .join('')
  const text = visible.normalize('NFC').replace(MARK_PILE, '$1').replace(/\s+/g, ' ').trim()
  return Array.from(text).slice(0, GAME.chatMaxChars).join('')
}
