import { groundY } from '../cave/collision'
import { isYouTubeId } from '../cave/youtube'
import { copyState, type PlayerState } from '../cave/players/movement'
import { PlayerStore } from '../cave/players/store'
import { config } from '../config'
import GAME from '../shared/game-constants.json'
import {
  decodeServerBinary,
  dqDir,
  dqHeading,
  encodeChat,
  encodePunch,
  encodeRageLabel,
  encodeThrow,
  parseNotice,
  encodeVote,
  punchText,
  parsePoll,
  voteText,
  type Poll,
  encodeEnter,
  encodeLeave,
  jerseyNumber,
  encodeMove,
  encodePing,
  qHeading,
  sanitizeChat,
  type ServerJson,
} from './protocol'
import { ChatLog } from './chat'
import { playPunch } from '../audio/punch'
import { notices } from './notices'
import { rage } from '../cave/rage/rageState'
import { findPunchTarget, PUNCH_COOLDOWN_MS } from '../cave/players/punchAim'
import { enqueueMove, tickDiff } from './remoteSync'
import { loadSession, saveSession } from '../storage'
import { talk, TALK_TYPES, type TalkServerMsg } from './talk'

export type Phase = 'idle' | 'connecting' | 'queued' | 'inCave' | 'closed'

export type NetState = {
  phase: Phase
  position?: number
  inRoom?: number
  capacity?: number
  waiting?: number
  error?: string
  retryIn?: number
  unstable?: boolean
  reconnectUntil?: number
  reconnectQueue?: number
  boardVideo?: string
  poll?: Poll
  pollVoted?: boolean
  punched?: { by: string; seq: number }
}

const PING_EVERY_MS = 5000
const UNSTABLE_MS = 7000
const DEAD_MS = 15_000
const HIDDEN_LEAVE_MS = 60 * 60_000
const RECONNECT_WINDOW_MS = 25_000
const RECONNECT_DELAYS_MS = [0, 1000, 2000, 2000]
const ATTEMPT_TIMEOUT_MS = 4000
const MIN_SEND_GAP_MS = 100
const OTHER_TAB = 'Bạn đã vào hang ở tab khác.'

const TAB_KEY = 'hangmu.tab'
let memTab = ''
function tabId() {
  let t = loadSession(TAB_KEY) ?? memTab
  if (!t) {
    t = Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
    saveSession(TAB_KEY, t)
    memTab = t
  }
  return t
}
const KEYFRAME_MS = 1000
const DELAY_MIN = 3
const DELAY_MAX = 10
const DELAY_DEFAULT = 5
const SETTLE_MS = 250

export class NetClient {
  state: NetState = { phase: 'idle' }
  store: PlayerStore | null = null
  selfIndex = -1
  readonly chat = new ChatLog()

  private ws: WebSocket | null = null
  private name = ''
  private number: number | null = null
  private listeners = new Set<() => void>()
  private people = new Map<number, { name: string; number: number | null; bot?: boolean }>()
  private intentionalClose = false
  private retryAttempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectUntil = 0
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private keepLocal = false
  private resumedVoted = false
  private frozenInCave = false
  private hiddenTimer: ReturnType<typeof setTimeout> | undefined
  private healthTimer: ReturnType<typeof setInterval> | undefined
  private lastHeard = 0
  private lastPing = 0
  private lastCheck = 0
  private countTimer: ReturnType<typeof setInterval> | undefined

  private tickHz: number = GAME.serverTickHz
  private baseLocal = 0
  private baseTick = 0
  private bestRtt = Infinity

  private lastDir = -1
  private lastSent = 0
  private ages: number[] = []
  private delayTicks = DELAY_DEFAULT
  private settleAt = 0
  private lastChatAt = -Infinity
  private chatSeq = 0

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility)
      window.addEventListener('pagehide', this.onPageGone)
      window.addEventListener('pageshow', this.onPageShow)
    }
    talk.bindSend((m) => this.sendJson(m))
  }

  private onPageGone = () => {
    const p = this.state.phase
    if (p === 'inCave') {
      console.info('[net] rời trang khi đang trong hang → đóng kết nối (server giữ chỗ 30s)')
      this.stopReconnect()
      this.closeSocket()
      this.frozenInCave = true
    } else if (p === 'queued' || p === 'connecting') {
      console.info('[net] rời trang khi đang chờ → huỷ')
      this.leave()
    }
  }

  private onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted || !this.frozenInCave) return
    this.frozenInCave = false
    if (this.state.phase === 'inCave' && !this.ws) this.startReconnect()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  enter(name: string, number: number | null = null) {
    if (
      this.state.phase === 'connecting' ||
      this.state.phase === 'queued' ||
      this.state.phase === 'inCave'
    )
      return
    this.name = name
    this.number = jerseyNumber(number)
    this.retryAttempt = 0
    this.connect()
  }

  leave(error?: string) {
    this.intentionalClose = true
    clearTimeout(this.retryTimer)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeLeave())
    this.frozenInCave = false
    this.teardown()
    this.setState(error ? { phase: 'closed', error } : { phase: 'idle' })
  }

  sendChat(raw: string): boolean {
    const text = sanitizeChat(raw)
    const ws = this.ws
    if (!text || !this.live() || ws?.readyState !== WebSocket.OPEN) return false
    const now = performance.now()
    const wait = this.lastChatAt + GAME.chatMinIntervalMs - now
    if (wait > 0) {
      this.chat.notify(`Chờ ${Math.ceil(wait / 1000)} giây rồi gửi tiếp nhé.`)
      return false
    }
    this.lastChatAt = now
    const id = (this.chatSeq = (this.chatSeq % 0xffff_ffff) + 1)
    ws.send(encodeChat(text, id))
    this.chat.addOwnPending(
      this.selfIndex,
      this.people.get(this.selfIndex)?.name ?? this.name,
      text,
      id,
    )
    return true
  }

  punchAnimAt = -Infinity
  punchTargetId: string | null = null
  punchHitAt = -Infinity
  punchHitId: string | null = null
  punchedAt = -Infinity
  punchedById: string | null = null
  private punchSeq = 0

  punch() {
    if (rage.active) return
    if (talk.overlay) return
    const ws = this.ws
    const store = this.store
    const me = store?.local
    if (!store || !me || !this.live() || ws?.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    if (now - this.punchAnimAt < PUNCH_COOLDOWN_MS) return
    this.punchAnimAt = now
    const target = findPunchTarget(store, me, talk.talking)
    this.punchTargetId = target?.id ?? null
    if (target) ws.send(encodePunch(Number(target.id)))
  }

  sendThrow(slot: number, item: number, u: number, v: number) {
    const ws = this.ws
    if (!this.live() || ws?.readyState !== WebSocket.OPEN) return false
    ws.send(encodeThrow(slot, item, u, v))
    return true
  }

  sendRageLabel(slot: number, nick: number) {
    const ws = this.ws
    if (!this.live() || ws?.readyState !== WebSocket.OPEN) return
    ws.send(encodeRageLabel(slot, nick))
  }

  vote(option: number) {
    const ws = this.ws
    const poll = this.state.poll
    const label = poll?.options[option]
    if (!poll || label == null || this.state.pollVoted) return
    if (!this.live() || ws?.readyState !== WebSocket.OPEN) return
    ws.send(encodeVote(poll.id, option))
    this.chat.addOwnSent(
      this.selfIndex,
      this.people.get(this.selfIndex)?.name ?? this.name,
      voteText(label),
    )
    this.setState({ ...this.state, pollVoted: true })
  }

  renderTick() {
    return this.serverTickNow() - this.delayTicks
  }

  get renderDelayTicks() {
    return this.delayTicks
  }

  serverTickNow() {
    return this.baseTick + ((performance.now() - this.baseLocal) * this.tickHz) / 1000
  }

  reportLocal(s: PlayerState, dir: number) {
    if (!this.live() || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    const changed = dir !== this.lastDir
    const settleDue = this.settleAt > 0 && now >= this.settleAt
    const keyframeDue = dir !== 0 && now - this.lastSent >= KEYFRAME_MS
    if (!changed && !settleDue && !keyframeDue) return
    if (now - this.lastSent < MIN_SEND_GAP_MS) return
    const clientTick = Math.floor((now * this.tickHz) / 1000) & 0xffff
    this.ws.send(encodeMove(s.x, s.z, qHeading(s.heading), dir, clientTick))
    this.lastSent = now
    this.lastDir = dir
    this.settleAt = changed ? now + SETTLE_MS : 0
  }

  private sendJson(m: object): boolean {
    const ws = this.ws
    if (!this.live() || ws?.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(m))
    return true
  }

  private onTalk(m: TalkServerMsg) {
    if (this.state.phase !== 'inCave') return
    const me = this.store?.local
    if (m.t === 'talkOpen' && me) {
      const peer = this.store?.players.get(String(m.peer))
      if (peer) {
        me.curr.heading = me.prev.heading = Math.atan2(
          peer.drawX - me.curr.x,
          peer.drawZ - me.curr.z,
        )
      }
      copyState(me.prev, me.curr)
      me.curr.vx = me.curr.vz = me.prev.vx = me.prev.vz = 0
      this.lastDir = -1
    }
    talk.onServer(m, (i) => this.people.get(i)?.name)
  }

  private live() {
    return this.state.phase === 'inCave' && this.reconnectUntil === 0
  }

  private setState(next: NetState) {
    this.state = next
    this.listeners.forEach((l) => l())
  }

  private connect(resume = false) {
    if (resume) this.closeSocket()
    else this.teardown()
    this.intentionalClose = false
    if (!resume) this.setState({ phase: 'connecting' })
    const ws = new WebSocket(config.wsUrl)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    if (resume) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = setTimeout(() => {
        if (this.ws !== ws || !this.reconnectUntil) return
        console.warn('[net] kết nối lại: lần thử quá lâu, thử lần khác')
        this.closeSocket()
        this.nextAttempt()
      }, ATTEMPT_TIMEOUT_MS)
    }
    ws.onopen = () => {
      ws.send(encodeEnter(this.name, this.number, tabId()))
      this.lastHeard = performance.now()
      this.lastPing = 0
      this.lastCheck = performance.now()
      this.healthTimer = setInterval(() => this.checkHealth(), 1000)
      this.checkHealth()
    }
    ws.onmessage = (ev) => {
      this.lastHeard = performance.now()
      if (this.state.unstable) this.setState({ ...this.state, unstable: false })
      if (typeof ev.data === 'string') this.onJson(JSON.parse(ev.data) as ServerJson)
      else this.onBinary(ev.data as ArrayBuffer)
    }
    ws.onclose = (ev) => {
      if (this.ws !== ws) return
      const wasIn = this.state.phase
      console.warn('[net] WebSocket đóng', {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
        phase: wasIn,
        intentional: this.intentionalClose,
        hidden: document.hidden,
        focused: document.hasFocus(),
        silentMs: Math.round(performance.now() - this.lastHeard),
        reconnecting: this.reconnectUntil > 0,
      })
      if (this.reconnectUntil) {
        this.closeSocket()
        this.nextAttempt()
        return
      }
      if (wasIn === 'inCave' && !this.intentionalClose && !this.retryTimer) {
        this.startReconnect()
        return
      }
      this.teardown()
      if (this.intentionalClose || wasIn === 'closed' || this.retryTimer) return
      if (wasIn === 'connecting') {
        this.setState({ phase: 'closed', error: 'Không vào được hang. Kiểm tra mạng rồi thử lại.' })
      } else {
        this.setState({
          phase: 'closed',
          error: 'Mất kết nối với hang. Bấm "Vào hang" để vào lại.',
        })
      }
    }
  }

  private teardown() {
    this.closeSocket()
    clearTimeout(this.hiddenTimer)
    this.stopReconnect()
    this.resetSession()
  }

  private closeSocket() {
    clearInterval(this.healthTimer)
    this.healthTimer = undefined
    clearInterval(this.countTimer)
    this.countTimer = undefined
    if (this.ws) {
      const ws = this.ws
      this.ws = null
      ws.onclose = null
      ws.onmessage = null
      ws.onopen = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }
  }

  private startReconnect() {
    console.warn('[net] mất kết nối khi đang trong hang → tự kết nối lại', {
      windowMs: RECONNECT_WINDOW_MS,
    })
    this.closeSocket()
    this.reconnectUntil = performance.now() + RECONNECT_WINDOW_MS
    this.reconnectAttempt = 0
    const store = this.store
    if (store)
      for (const e of store.players.values()) if (e.remote) store.setInput(e.id, 0, 0, false)
    window.addEventListener('online', this.onOnline)
    this.setState({ ...this.state, unstable: false, reconnectUntil: this.reconnectUntil })
    this.nextAttempt()
  }

  private nextAttempt() {
    clearTimeout(this.reconnectTimer)
    const left = this.reconnectUntil - performance.now()
    if (left <= 0) {
      console.warn('[net] kết nối lại không được → rời hang', { attempts: this.reconnectAttempt })
      this.intentionalClose = true
      this.teardown()
      this.setState({
        phase: 'closed',
        error:
          'Mất kết nối với hang, đã thử kết nối lại nhưng không được. Bấm "Vào hang" để vào lại.',
      })
      return
    }
    const base =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 2000
    const delay = Math.min(base * (0.7 + Math.random() * 0.6), left)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => this.connect(true), delay)
  }

  private onOnline = () => {
    if (!this.reconnectUntil || this.ws?.readyState === WebSocket.OPEN) return
    this.connect(true)
  }

  private stopReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.reconnectUntil = 0
    this.keepLocal = false
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline)
  }

  private resetForResume() {
    const store = this.store
    if (store)
      for (const id of [...store.players.keys()]) if (id !== store.localId) store.remove(id)
    this.punchAnimAt = -Infinity
    this.punchTargetId = null
    this.punchHitAt = -Infinity
    this.punchHitId = null
    this.punchedAt = -Infinity
    this.punchedById = null
    talk.reset()
    this.lastDir = -1
    this.lastSent = 0
    this.settleAt = 0
    this.ages = []
    this.delayTicks = DELAY_DEFAULT
    this.bestRtt = Infinity
  }

  private resetSession() {
    this.store = null
    this.selfIndex = -1
    this.punchAnimAt = -Infinity
    this.punchTargetId = null
    this.punchHitAt = -Infinity
    this.punchHitId = null
    this.punchedAt = -Infinity
    this.punchedById = null
    notices.reset()
    talk.reset()
    this.people.clear()
    this.chat.reset()
    rage.reset()
    this.lastChatAt = -Infinity
    this.lastDir = -1
    this.lastSent = 0
    this.settleAt = 0
    this.ages = []
    this.delayTicks = DELAY_DEFAULT
    this.bestRtt = Infinity
  }

  private onJson(m: ServerJson) {
    if (TALK_TYPES.has(m.t)) return this.onTalk(m as unknown as TalkServerMsg)
    switch (m.t) {
      case 'queued':
        if (this.reconnectUntil) {
          if (m.inRoom < (this.state.capacity ?? Infinity)) {
            clearTimeout(this.reconnectTimer)
            this.reconnectUntil = performance.now() + RECONNECT_WINDOW_MS
            this.setState({
              ...this.state,
              reconnectQueue: m.position,
              reconnectUntil: this.reconnectUntil,
            })
            break
          }
          this.stopReconnect()
          this.resetSession()
        }
        this.setState({
          phase: 'queued',
          position: m.position,
          inRoom: m.inRoom,
          waiting: m.waiting,
        })
        break
      case 'admitted': {
        const reconnected = this.reconnectUntil > 0
        const keep =
          reconnected && m.resumed === true && this.store?.localId === String(m.selfIndex)
        if (reconnected) {
          this.stopReconnect()
          if (keep) this.resetForResume()
          else this.resetSession()
        }
        this.keepLocal = keep
        this.resumedVoted = m.resumed === true && m.pollVoted === true
        this.retryAttempt = 0
        this.selfIndex = m.selfIndex
        this.tickHz = m.tickHz
        this.baseLocal = performance.now()
        this.baseTick = m.serverTick
        this.people = new Map(
          m.roster.map((r) => [
            r.i,
            { name: r.name, number: jerseyNumber(r.n), bot: r.b === true },
          ]),
        )
        if (!keep) this.store = new PlayerStore()
        this.setState({
          phase: 'inCave',
          inRoom: m.roster.length,
          capacity: m.capacity,
          boardVideo: reconnected ? this.state.boardVideo : undefined,
          ...(m.resumed === true ? { poll: this.state.poll, pollVoted: m.pollVoted === true } : {}),
        })
        this.ping()
        if (reconnected) {
          console.info('[net] đã kết nối lại với hang', { resumed: m.resumed === true })
          this.chat.notify(
            keep ? 'Đã kết nối lại với hang.' : 'Đã vào lại hang (chỗ cũ đã hết hạn giữ).',
          )
        }
        this.countTimer = setInterval(() => {
          const n = this.store?.size ?? 0
          if (this.state.phase === 'inCave' && n !== this.state.inRoom) {
            this.setState({ ...this.state, inRoom: n })
          }
        }, 500)
        break
      }
      case 'join': {
        if (m.i === this.selfIndex || !this.store) return
        this.chat.forget(m.i)
        this.people.set(m.i, { name: m.name, number: jerseyNumber(m.n), bot: m.b === true })
        const joined = this.store.add(
          String(m.i),
          m.x,
          m.z,
          Math.PI,
          false,
          m.name,
          this.renderTick(),
          jerseyNumber(m.n),
        )
        if (joined) joined.bot = m.b === true
        break
      }
      case 'leave':
        talk.forgetPlayer(m.i)
        this.people.delete(m.i)
        this.chat.forget(m.i)
        this.store?.remove(String(m.i))
        break
      case 'rejected':
        this.intentionalClose = true
        this.teardown()
        this.setState({
          phase: 'closed',
          error:
            m.reason === 'invalid_name'
              ? 'Tên không hợp lệ (1–30 ký tự).'
              : m.reason === 'other_tab'
                ? OTHER_TAB
                : 'Hang và hàng chờ đều đã đầy. Thử lại sau ít phút.',
        })
        break
      case 'replaced':
        this.intentionalClose = true
        this.teardown()
        this.setState({ phase: 'closed', error: OTHER_TAB })
        break
      case 'busy':
        if (this.reconnectUntil) {
          this.closeSocket()
          this.nextAttempt()
          break
        }
        this.scheduleRetry(m.retryAfter)
        break
      case 'chat':
        this.chat.receive(m.m, this.selfIndex, (i) => this.people.get(i)?.name ?? 'Ẩn danh')
        break
      case 'chatDropped':
        this.chat.dropped(m.reason, m.id, this.selfIndex)
        break
      case 'chatAck':
        this.chat.ack(m.id, m.text, this.selfIndex)
        break
      case 'punched':
        if (this.state.phase !== 'inCave') break
        this.punchedAt = performance.now()
        this.punchedById = String(m.by)
        this.setState({
          ...this.state,
          punched: { by: this.people.get(m.by)?.name ?? 'ai đó', seq: ++this.punchSeq },
        })
        playPunch()
        break
      case 'punchHit': {
        this.punchHitAt = performance.now()
        this.punchHitId = String(m.target)
        playPunch()
        const victim = this.people.get(m.target)?.name
        const text =
          typeof m.text === 'string' && m.text.length <= 200
            ? m.text
            : victim
              ? punchText(victim)
              : null
        if (!text) break
        this.chat.addOwnSent(
          this.selfIndex,
          this.people.get(this.selfIndex)?.name ?? this.name,
          text,
        )
        break
      }
      case 'notice': {
        if (this.state.phase !== 'inCave') break
        const n = parseNotice(m)
        if (n) notices.push(n)
        break
      }
      case 'rage':
        if (this.state.phase === 'inCave') rage.applyServer(m.labels, m.today)
        break
      case 'poll': {
        if (this.state.phase !== 'inCave') break
        const poll = parsePoll(m)
        if (poll && poll.id !== this.state.poll?.id)
          this.setState({ ...this.state, poll, pollVoted: this.resumedVoted })
        else if (poll && this.resumedVoted && !this.state.pollVoted)
          this.setState({ ...this.state, pollVoted: true })
        this.resumedVoted = false
        break
      }
      case 'board': {
        if (this.state.phase !== 'inCave') break
        const list = (Array.isArray(m.videos) ? m.videos : [m.video])
          .filter(isYouTubeId)
          .slice(0, 20)
        const boardVideo = list.length ? list.join(',') : undefined
        if (boardVideo !== this.state.boardVideo) this.setState({ ...this.state, boardVideo })
        break
      }
    }
  }

  private onBinary(buf: ArrayBuffer) {
    const msg = decodeServerBinary(buf)
    const store = this.store
    if (!msg || !store) return
    switch (msg.op) {
      case 'welcome': {
        const dir = { mx: 0, mz: 0 }
        for (const e of msg.entries) {
          const isSelf = e.index === this.selfIndex
          if (isSelf && this.keepLocal && store.localId) {
            store.correctPosition(store.localId, e.x, e.z, groundY(e.x, e.z))
            continue
          }
          const entry = store.add(
            String(e.index),
            e.x,
            e.z,
            dqHeading(e.heading),
            isSelf,
            this.people.get(e.index)?.name ?? '',
            isSelf ? null : this.renderTick(),
            this.people.get(e.index)?.number ?? null,
          )
          if (entry) entry.bot = this.people.get(e.index)?.bot === true
          if (entry && !isSelf) {
            dqDir(e.dir, dir)
            store.setInput(entry.id, dir.mx, dir.mz, false)
          }
        }
        this.keepLocal = false
        break
      }
      case 'moves': {
        const now = this.serverTickNow()
        for (const r of msg.records) {
          this.ages.push(tickDiff(now, r.tick))
          enqueueMove(store, r)
        }
        if (this.ages.length > 64) this.ages.splice(0, this.ages.length - 64)
        this.updateDelay()
        break
      }
      case 'correction': {
        if (store.localId) store.correctPosition(store.localId, msg.x, msg.z, groundY(msg.x, msg.z))
        this.lastDir = -1
        break
      }
      case 'pong': {
        const now = performance.now()
        const rtt = (((Math.floor(now) >>> 0) - msg.clientTime) >>> 0) % 0xffffffff
        if (rtt <= this.bestRtt + 30) {
          this.bestRtt = Math.min(this.bestRtt, rtt)
          this.baseLocal = now
          this.baseTick = msg.serverTick + ((rtt / 2) * this.tickHz) / 1000
        }
        break
      }
    }
  }

  private updateDelay() {
    if (this.ages.length < 8) return
    const sorted = [...this.ages].sort((a, b) => a - b)
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? DELAY_DEFAULT
    const target = Math.max(DELAY_MIN, Math.min(DELAY_MAX, Math.ceil(p90) + 1))
    this.delayTicks += Math.sign(target - this.delayTicks)
  }

  private ping() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.lastPing = performance.now()
      this.ws.send(encodePing(Math.floor(this.lastPing) >>> 0))
    }
  }

  private checkHealth() {
    const p = this.state.phase
    if (p !== 'connecting' && p !== 'queued' && p !== 'inCave') return
    const now = performance.now()
    if (now - this.lastCheck > 3000) this.lastHeard = now
    this.lastCheck = now
    if (now - this.lastPing >= PING_EVERY_MS) this.ping()
    const silent = now - this.lastHeard
    if (silent > DEAD_MS) {
      console.warn('[net] im lặng quá lâu → coi như mất kết nối', {
        silentMs: Math.round(silent),
        hidden: document.hidden,
        focused: document.hasFocus(),
      })
      if (this.reconnectUntil) {
        this.closeSocket()
        this.nextAttempt()
        return
      }
      if (p === 'inCave') {
        this.startReconnect()
        return
      }
      this.intentionalClose = true
      this.teardown()
      this.setState({
        phase: 'closed',
        error: 'Mất kết nối với hang (mạng không phản hồi). Bấm "Vào hang" để vào lại.',
      })
    } else if (
      silent > UNSTABLE_MS &&
      !this.state.unstable &&
      !this.reconnectUntil &&
      p !== 'connecting'
    ) {
      this.setState({ ...this.state, unstable: true })
    }
  }

  private scheduleRetry(hintSec: number) {
    this.intentionalClose = true
    this.teardown()
    const base = Math.max(hintSec, 2 ** Math.min(this.retryAttempt, 5))
    const delay = base * (0.7 + Math.random() * 0.6)
    this.retryAttempt++
    this.setState({ phase: 'connecting', retryIn: Math.ceil(delay) })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.connect()
    }, delay * 1000)
  }

  private onVisibility = () => {
    clearTimeout(this.hiddenTimer)
    if (!document.hidden && this.reconnectUntil && this.ws?.readyState !== WebSocket.OPEN) {
      this.connect(true)
    }
    const p = this.state.phase
    if (document.hidden && (p === 'inCave' || p === 'queued')) {
      this.hiddenTimer = setTimeout(
        () => this.leave('Bạn đã rời hang vì ẩn tab quá 1 tiếng.'),
        HIDDEN_LEAVE_MS,
      )
    }
  }
}

export const net = new NetClient()
