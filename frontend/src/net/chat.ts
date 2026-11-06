export type ChatMsg = {
  id: number
  name: string
  text: string
  self: boolean
  state: 'pending' | 'sent' | 'failed'
  clientId?: number
}

export type ChatSnapshot = {
  messages: readonly ChatMsg[]
  notice: string | null
}

export type DropReason = 'rate' | 'duplicate' | 'busy' | 'invalid'

const KEEP = 50
const NOTICE_MS = 3500

const DROP_NOTICE: Record<DropReason, string> = {
  rate: 'Bạn gửi nhanh quá, chờ một chút rồi gửi tiếp.',
  duplicate: 'Bạn vừa gửi câu này rồi.',
  busy: 'Hang đang chat rất đông, tin chưa gửi được. Thử lại sau giây lát.',
  invalid: 'Tin nhắn trống hoặc quá dài.',
}

const bubbleMs = (text: string) => Math.min(10_000, 5000 + text.length * 60)

export class ChatLog {
  private snap: ChatSnapshot = { messages: [], notice: null }
  private listeners = new Set<() => void>()
  private nextId = 1
  private noticeTimer: ReturnType<typeof setTimeout> | undefined
  readonly bubbles = new Map<number, { text: string; until: number; clientId?: number }>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snap

  private set(messages: readonly ChatMsg[], notice = this.snap.notice) {
    this.snap = { messages, notice }
    this.listeners.forEach((l) => l())
  }

  private bubble(index: number, text: string, clientId?: number) {
    this.bubbles.set(index, { text, until: performance.now() + bubbleMs(text), clientId })
  }

  addOwnPending(index: number, name: string, text: string, clientId: number) {
    this.bubble(index, text, clientId)
    this.push({ id: this.nextId++, name, text, self: true, state: 'pending', clientId })
  }

  addOwnSent(index: number, name: string, text: string) {
    this.bubble(index, text)
    this.push({ id: this.nextId++, name, text, self: true, state: 'sent' })
  }

  ack(clientId: number, text: string, selfIndex: number) {
    const k = this.snap.messages.findIndex((m) => m.self && m.clientId === clientId)
    if (k < 0) return
    const messages = this.snap.messages.slice()
    messages[k] = { ...messages[k]!, text, state: 'sent' }
    const b = this.bubbles.get(selfIndex)
    if (b?.clientId === clientId) b.text = text
    this.set(messages)
  }

  receive(batch: [number, string][], selfIndex: number, nameOf: (i: number) => string) {
    let messages = this.snap.messages.slice()
    let changed = false
    for (const [i, text] of batch) {
      if (i === selfIndex) continue
      this.bubble(i, text)
      messages.push({ id: this.nextId++, name: nameOf(i), text, self: false, state: 'sent' })
      changed = true
    }
    if (!changed) return
    if (messages.length > KEEP) messages = messages.slice(-KEEP)
    this.set(messages)
  }

  dropped(reason: DropReason, clientId: number | undefined, selfIndex: number) {
    const messages = this.snap.messages.slice()
    const k =
      clientId != null
        ? messages.findIndex((m) => m.self && m.clientId === clientId)
        : messages.findIndex((m) => m.self && m.state === 'pending')
    if (k >= 0) {
      messages[k] = { ...messages[k]!, state: 'failed' }
      const b = this.bubbles.get(selfIndex)
      if (b && (clientId != null ? b.clientId === clientId : b.text === messages[k]!.text))
        this.bubbles.delete(selfIndex)
    }
    this.set(messages)
    this.notify(DROP_NOTICE[reason] ?? DROP_NOTICE.busy)
  }

  forget(index: number) {
    this.bubbles.delete(index)
  }

  notify(text: string) {
    clearTimeout(this.noticeTimer)
    this.set(this.snap.messages, text)
    this.noticeTimer = setTimeout(() => this.set(this.snap.messages, null), NOTICE_MS)
  }

  reset() {
    clearTimeout(this.noticeTimer)
    this.bubbles.clear()
    this.set([], null)
  }

  private push(m: ChatMsg) {
    const messages = [...this.snap.messages, m]
    this.set(messages.length > KEEP ? messages.slice(-KEEP) : messages)
  }
}
