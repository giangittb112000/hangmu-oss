import { useCallback, useEffect, useRef, useState } from 'react'
import { net } from '../net/NetClient'
import { useChat } from '../net/useChat'
import { loadLocal, saveLocal } from '../storage'
import GAME from '../shared/game-constants.json'
import { isTyping } from './players/useKeyboard'

const HIDDEN_KEY = 'hangmu.chat.hidden'
const readHidden = () => loadLocal(HIDDEN_KEY) === '1'
const writeHidden = (v: boolean) => saveLocal(HIDDEN_KEY, v ? '1' : '0')

const isControl = (t: EventTarget | null) =>
  t instanceof Element &&
  t.closest(
    'button, a[href], summary, select, [role="button"], [role="link"], [contenteditable]',
  ) != null

export function ChatPanel({ touch }: { touch: boolean }) {
  const { messages, notice } = useChat()
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [seenId, setSeenId] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLOListElement>(null)
  const lastId = messages.at(-1)?.id ?? 0

  const show = useCallback((andWrite: boolean) => {
    setHidden(false)
    writeHidden(false)
    if (andWrite) {
      if (document.pointerLockElement) document.exitPointerLock()
      setOpen(true)
    }
  }, [])
  const hide = () => {
    setHidden(true)
    setOpen(false)
    setSeenId(lastId)
    writeHidden(true)
  }
  const close = useCallback(() => {
    setOpen(false)
    input.current?.blur()
  }, [])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    const el = log.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    el.classList.toggle('is-overflow', el.scrollHeight > el.clientHeight + 1)
  }, [messages, hidden])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || isTyping(e.target) || isControl(e.target)) return
      e.preventDefault()
      show(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  const send = () => {
    if (!draft.trim()) return close()
    if (net.sendChat(draft)) {
      setDraft('')
      close()
    }
  }

  const cls = `cave-chat${touch ? ' is-touch' : ''}${open ? ' is-open' : ''}`

  if (hidden) {
    const unread = messages.filter((m) => m.id > seenId && !m.self).length
    return (
      <section className={`${cls} is-hidden`} aria-label="Chat trong hang">
        <button type="button" className="cave-chat-toggle" onClick={() => show(false)}>
          Hiện chat
          {unread > 0 && (
            <span className="cave-chat-badge" aria-label={`${unread} tin mới`}>
              {unread > 49 ? '50+' : unread}
            </span>
          )}
        </button>
      </section>
    )
  }

  const left = GAME.chatMaxChars - Array.from(draft).length

  return (
    <section className={cls} aria-label="Chat trong hang">
      <div className="cave-chat-head">
        <h2 className="cave-chat-title">Chat trong hang</h2>
        <button type="button" className="cave-chat-hide" onClick={hide}>
          Ẩn
        </button>
      </div>

      <ol className="cave-chat-log" ref={log} role="log">
        {messages.length === 0 && (
          <li className="cave-chat-empty">
            Chưa ai nói gì. Chào anh em một câu đi! (Lịch sự nha: không xúc phạm, spam, quảng cáo
            hay nội dung vi phạm pháp luật.)
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`cave-chat-msg is-${m.state}`}>
            <span className={m.self ? 'cave-chat-name is-self' : 'cave-chat-name'}>{m.name}</span>{' '}
            {m.text}
            {m.state === 'failed' && <span className="cave-chat-failed"> (chưa gửi được)</span>}
          </li>
        ))}
      </ol>

      {notice && (
        <p className="cave-chat-notice" role="status">
          {notice}
        </p>
      )}

      {open ? (
        <form
          className="cave-chat-form"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input
            ref={input}
            className="cave-chat-input"
            value={draft}
            placeholder="Nói gì đó với anh em…"
            aria-label="Nội dung tin nhắn"
            enterKeyHint="send"
            autoComplete="off"
            onChange={(e) => {
              const chars = Array.from(e.target.value)
              setDraft(
                chars.length > GAME.chatMaxChars
                  ? chars.slice(0, GAME.chatMaxChars).join('')
                  : e.target.value,
              )
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
                e.preventDefault()
              }
              if (e.key === 'Escape') close()
            }}
            onBlur={() => {
              if (!draft.trim()) setOpen(false)
            }}
          />
          {left <= 30 && <span className="cave-chat-count">{left}</span>}
          <button type="submit" className="cave-chat-send">
            Gửi
          </button>
        </form>
      ) : (
        <button type="button" className="cave-chat-compose" onClick={() => show(true)}>
          {touch ? (
            'Chạm để nhắn tin…'
          ) : (
            <>
              Nhấn <kbd>Enter</kbd> để nhắn tin…
            </>
          )}
        </button>
      )}
    </section>
  )
}
