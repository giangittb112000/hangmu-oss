import { useSyncExternalStore } from 'react'
import { sanitizeChat } from './protocol'

export const TALK_INVITE_MS = 20_000

const inviteMs = (v: unknown) =>
  typeof v === 'number' && v >= 1000 && v <= 300_000 ? v : TALK_INVITE_MS
const MAX_MESSAGES = 200

export type TalkMsg = {
  key: number
  mine: boolean
  text: string
  pending?: boolean
  failed?: boolean
}

export type TalkView = {
  asking: { target: number; name: string; until: number } | null
  invite: { id: number; from: number; name: string; until: number } | null
  conv: {
    id: number
    peer: number
    name: string
    messages: TalkMsg[]
    ended: null | { byMe: boolean; reason: 'end' | 'left' | 'idle' }
  } | null
  toast: { text: string; seq: number } | null
  confirming: boolean
  cooldowns: Readonly<Record<number, number>>
}

type Send = (msg: object) => boolean

const EMPTY: TalkView = {
  asking: null,
  invite: null,
  conv: null,
  toast: null,
  confirming: false,
  cooldowns: {},
}

class Talk {
  private view: TalkView = EMPTY
  private listeners = new Set<() => void>()
  private send: Send = () => false
  private seq = 0
  private msgKey = 0
  private dmSeq = 0
  readonly talking = new Set<number>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.view

  private set(patch: Partial<TalkView>) {
    this.view = { ...this.view, ...patch }
    this.listeners.forEach((l) => l())
  }

  bindSend(fn: Send) {
    this.send = fn
  }

  get frozen() {
    const c = this.view.conv
    return c != null && c.ended == null
  }

  get overlay() {
    return this.view.conv != null
  }

  ask(target: number, name: string) {
    const v = this.view
    if (v.asking || v.conv || this.talking.has(target)) return
    const left = this.cooldownLeft(target)
    if (left > 0) return this.toast(declinedText(name, left))
    if (!this.send({ t: 'talkAsk', target })) return
    this.set({ asking: { target, name, until: performance.now() + TALK_INVITE_MS } })
  }

  cancelAsk() {
    if (!this.view.asking) return
    this.send({ t: 'talkCancel' })
    this.set({ asking: null })
  }

  answer(accept: boolean) {
    const inv = this.view.invite
    if (!inv) return
    this.send({ t: 'talkAnswer', id: inv.id, accept })
    this.set({ invite: null })
  }

  sendDm(raw: string): boolean {
    const c = this.view.conv
    const text = sanitizeChat(raw)
    if (!c || c.ended || !text) return false
    const id = ++this.dmSeq
    if (!this.send({ t: 'dm', text, id })) return false
    this.pushMsg({ key: id, mine: true, text, pending: true })
    return true
  }

  askEnd() {
    const c = this.view.conv
    if (!c) return
    if (c.ended) return this.dismiss()
    this.set({ confirming: true })
  }

  cancelEnd() {
    if (this.view.confirming) this.set({ confirming: false })
  }

  end() {
    const c = this.view.conv
    if (!c || c.ended) return
    this.send({ t: 'talkEnd' })
    this.set({ conv: null, confirming: false })
  }

  dismiss() {
    if (this.view.conv?.ended) this.set({ conv: null, confirming: false })
  }

  cooldownLeft(target: number, now = performance.now()) {
    const until = this.view.cooldowns[target]
    return until ? Math.max(0, until - now) : 0
  }

  private toast(text: string) {
    this.set({ toast: { text, seq: ++this.seq } })
  }

  private pushMsg(m: TalkMsg) {
    const c = this.view.conv
    if (!c) return
    const messages = [...c.messages, m].slice(-MAX_MESSAGES)
    this.set({ conv: { ...c, messages } })
  }

  onServer(m: TalkServerMsg, nameOf: (i: number) => string | undefined) {
    const v = this.view
    const now = performance.now()
    switch (m.t) {
      case 'talkAsked':
        if (v.asking?.target === m.target)
          this.set({ asking: { ...v.asking, until: now + inviteMs(m.ms) } })
        break
      case 'talkDeclined': {
        const name = v.asking?.name ?? nameOf(m.target) ?? 'Người đó'
        if (v.asking?.target === m.target) this.set({ asking: null })
        const wait =
          typeof m.waitMs === 'number' && m.waitMs > 0 ? Math.min(m.waitMs, 3_600_000) : 0
        if ((m.reason === 'declined' || m.reason === 'cooldown') && wait > 0) {
          this.set({ cooldowns: { ...this.view.cooldowns, [m.target]: now + wait } })
          this.toast(declinedText(name, wait))
          break
        }
        this.toast(
          m.reason === 'busy'
            ? `${name} đang bận trò chuyện`
            : m.reason === 'far'
              ? `Lại gần ${name} hơn chút nữa`
              : m.reason === 'wait'
                ? 'Chờ chút rồi hãy mời tiếp'
                : m.reason === 'gone'
                  ? `${name} đã đi xa, chưa bắt chuyện được`
                  : `${name} chưa trả lời`,
        )
        break
      }
      case 'talkInvite':
        if (v.conv) {
          this.send({ t: 'talkAnswer', id: m.id, accept: false })
          break
        }
        this.set({
          invite: {
            id: m.id,
            from: m.from,
            name: cleanName(m.name) ?? nameOf(m.from) ?? 'Ai đó',
            until: now + inviteMs(m.ms),
          },
        })
        break
      case 'talkInviteGone':
        if (v.invite?.id === m.id) this.set({ invite: null })
        break
      case 'talkOpen':
        this.set({
          asking: null,
          invite: null,
          conv: {
            id: m.id,
            peer: m.peer,
            name: cleanName(m.name) ?? nameOf(m.peer) ?? 'Ai đó',
            messages: [],
            ended: null,
          },
        })
        break
      case 'talkClosed': {
        const c = v.conv
        if (!c || c.id !== m.id || c.ended) break
        this.set({
          confirming: false,
          conv: {
            ...c,
            ended: {
              byMe: m.by !== c.peer,
              reason: m.reason === 'left' || m.reason === 'idle' ? m.reason : 'end',
            },
          },
        })
        break
      }
      case 'dm':
        if (v.conv && !v.conv.ended && typeof m.text === 'string')
          this.pushMsg({ key: --this.msgKey, mine: false, text: m.text.slice(0, 400) })
        break
      case 'dmAck':
      case 'dmDropped': {
        const c = v.conv
        if (!c) break
        const messages = c.messages.map((x) =>
          x.mine && x.key === m.id
            ? m.t === 'dmAck'
              ? { ...x, pending: false, text: typeof m.text === 'string' ? m.text : x.text }
              : { ...x, pending: false, failed: true }
            : x,
        )
        this.set({ conv: { ...c, messages } })
        break
      }
      case 'talking':
        for (const i of m.on ?? []) this.talking.add(i)
        for (const i of m.off ?? []) this.talking.delete(i)
        break
    }
  }

  forgetPlayer(i: number) {
    this.talking.delete(i)
    if (i in this.view.cooldowns) {
      const rest = { ...this.view.cooldowns }
      delete rest[i]
      this.set({ cooldowns: rest })
    }
  }

  reset() {
    this.talking.clear()
    this.set(EMPTY)
  }
}

export function declinedText(name: string, leftMs: number) {
  return `${name} vừa từ chối · mời lại sau ${Math.ceil(leftMs / 1000)}s`
}

function cleanName(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, 40) : null
}

export type TalkServerMsg =
  | { t: 'talkAsked'; target: number; id: number; ms?: number }
  | {
      t: 'talkDeclined'
      target: number
      reason: 'no' | 'busy' | 'far' | 'wait' | 'gone' | 'declined' | 'cooldown'
      waitMs?: number
    }
  | { t: 'talkInvite'; id: number; from: number; name: string; ms?: number }
  | { t: 'talkInviteGone'; id: number }
  | { t: 'talkOpen'; id: number; peer: number; name: string }
  | { t: 'talkClosed'; id: number; by: number; reason: string }
  | { t: 'dm'; text: string }
  | { t: 'dmAck'; id: number; text: string }
  | { t: 'dmDropped'; id: number; reason: string }
  | { t: 'talking'; on?: number[]; off?: number[] }

export const TALK_TYPES = new Set<string>([
  'talkAsked',
  'talkDeclined',
  'talkInvite',
  'talkInviteGone',
  'talkOpen',
  'talkClosed',
  'dm',
  'dmAck',
  'dmDropped',
  'talking',
])

export const talk = new Talk()

export const useTalk = () => useSyncExternalStore(talk.subscribe, talk.getSnapshot)
