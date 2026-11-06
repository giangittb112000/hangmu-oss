import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { notices } from '../../net/notices'
import { talk, useTalk, type TalkView } from '../../net/talk'
import { useTalkAim, talkAim } from '../players/talkAim'
import { isTyping } from '../players/useKeyboard'
import './talk.css'

export function TalkLayer({ touch }: { touch: boolean }) {
  return (
    <>
      <TalkHint touch={touch} />
      <TalkAsking />
      <TalkInvite touch={touch} />
      <TalkToast />
      <TalkOverlay touch={touch} />
    </>
  )
}

function askAimed() {
  const aim = talkAim.getSnapshot()
  const v = talk.getSnapshot()
  if (!aim || v.asking || v.conv) return
  if (document.pointerLockElement) document.exitPointerLock()
  talk.ask(Number(aim.id), aim.name)
}

function useCooldownLeft(target: number | null, cooldowns: Readonly<Record<number, number>>) {
  const until = target == null ? 0 : (cooldowns[target] ?? 0)
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!until) return
    const tick = () => setNow(performance.now())
    const first = requestAnimationFrame(tick)
    const timer = setInterval(tick, 500)
    return () => {
      cancelAnimationFrame(first)
      clearInterval(timer)
    }
  }, [until])
  return until ? Math.max(0, until - now) : 0
}

function TalkHint({ touch }: { touch: boolean }) {
  const aim = useTalkAim()
  const { asking, conv, cooldowns } = useTalk()
  const left = useCooldownLeft(aim ? Number(aim.id) : null, cooldowns)
  const secs = Math.ceil(left / 1000)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyC' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      askAimed()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!aim || asking || conv) return null
  if (touch) {
    return (
      <button
        type="button"
        className="cave-talk"
        data-wait={secs > 0 || undefined}
        aria-label={
          secs > 0
            ? `${aim.name} vừa từ chối, mời lại sau ${secs} giây`
            : `Bắt chuyện với ${aim.name}`
        }
        onClick={askAimed}
      >
        <span className="cave-talk-icon" aria-hidden="true">
          💬
        </span>
        <span className="cave-talk-label">{secs > 0 ? `${secs}s` : aim.name}</span>
      </button>
    )
  }
  if (secs > 0) {
    return (
      <p className="cave-talk-hint is-wait" role="status">
        <span aria-hidden="true">💬</span>
        <strong>{aim.name}</strong> vừa từ chối · mời lại sau {secs}s
      </p>
    )
  }
  return (
    <p className="cave-talk-hint" role="status">
      <kbd>C</kbd>
      <span aria-hidden="true">💬</span> Bắt chuyện với <strong>{aim.name}</strong>
    </p>
  )
}

function Countdown({ until }: { until: number }) {
  const [ms] = useState(() => Math.max(0, until - performance.now()))
  return (
    <span className="talk-bar" aria-hidden="true">
      <i style={{ animationDuration: `${ms}ms` }} />
    </span>
  )
}

function TalkAsking() {
  const { asking } = useTalk()
  if (!asking) return null
  return (
    <div className="talk-asking" role="status">
      <div className="talk-asking-row">
        <span>
          💬 Đã mời <strong>{asking.name}</strong> bắt chuyện, đang chờ trả lời…
        </span>
        <button type="button" className="talk-btn" onClick={() => talk.cancelAsk()}>
          Huỷ
        </button>
      </div>
      <Countdown key={asking.until} until={asking.until} />
    </div>
  )
}

function TalkInvite({ touch }: { touch: boolean }) {
  const { invite } = useTalk()
  const shown = invite != null
  useEffect(() => (shown ? notices.hold() : undefined), [shown])
  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.code === 'KeyY') talk.answer(true)
      else if (e.code === 'KeyN') talk.answer(false)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])
  if (!invite) return null
  return (
    <section className="talk-invite" role="dialog" aria-label="Lời mời bắt chuyện">
      <div className="talk-invite-who">
        <span className="talk-face" aria-hidden="true" />
        <div>
          <strong>{invite.name} muốn bắt chuyện</strong>
          <p>Đồng ý thì cả hai đứng yên để chat riêng, cả hang không đọc được</p>
        </div>
      </div>
      <div className="talk-invite-acts">
        <button type="button" className="talk-btn is-ok" onClick={() => talk.answer(true)}>
          Đồng ý {!touch && <kbd>Y</kbd>}
        </button>
        <button type="button" className="talk-btn" onClick={() => talk.answer(false)}>
          Để sau {!touch && <kbd>N</kbd>}
        </button>
      </div>
      <Countdown key={invite.id} until={invite.until} />
    </section>
  )
}

const TOAST_MS = 3200

function TalkToast() {
  const { toast } = useTalk()
  const [hidden, setHidden] = useState(0)
  const seq = toast?.seq ?? 0
  useEffect(() => {
    if (!seq) return
    const t = setTimeout(() => setHidden(seq), TOAST_MS)
    return () => clearTimeout(t)
  }, [seq])
  if (!toast || hidden === seq) return null
  return (
    <p className="talk-toast" role="status">
      {toast.text}
    </p>
  )
}

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

function endedText(conv: NonNullable<TalkView['conv']>) {
  const e = conv.ended
  if (!e) return ''
  if (e.reason === 'idle') return 'Cuộc trò chuyện tự kết thúc vì lâu không ai nhắn'
  if (e.reason === 'left') return `${conv.name} đã rời hang`
  return e.byMe ? 'Bạn đã kết thúc trò chuyện' : `${conv.name} đã kết thúc trò chuyện`
}

function TalkOverlay({ touch }: { touch: boolean }) {
  const { conv, confirming } = useTalk()
  const open = conv != null
  const ended = conv?.ended != null
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const stay = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) return
    const fit = () => {
      const el = root.current
      if (!el) return
      el.style.top = `${vv.offsetTop}px`
      el.style.height = `${vv.height}px`
      el.style.bottom = 'auto'
    }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (document.pointerLockElement) document.exitPointerLock()
    if (!touch) input.current?.focus()
    const release = notices.hold()
    return () => {
      release()
      setDraft('')
    }
  }, [open, touch])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const v = talk.getSnapshot()
      if (e.key === 'Escape') {
        e.preventDefault()
        if (v.confirming) talk.cancelEnd()
        else talk.askEnd()
      } else if (v.conv?.ended && MOVE_KEYS.has(e.code)) {
        talk.dismiss()
        return
      } else if (
        !v.confirming &&
        !v.conv?.ended &&
        e.target !== input.current &&
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        input.current?.focus()
      }
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  useEffect(() => {
    if (confirming) stay.current?.focus()
    else if (open && !touch) input.current?.focus()
  }, [confirming, open, touch])

  const count = conv?.messages.length ?? 0
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count, ended])

  if (!conv) return null
  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (talk.sendDm(draft)) setDraft('')
  }

  return createPortal(
    <div
      ref={root}
      className="talk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Trò chuyện riêng với ${conv.name}`}
    >
      <section className="talk-box">
        <header className="talk-head">
          <div className="talk-who">
            <span className="talk-face" aria-hidden="true" />
            <div>
              <strong>🔒 {conv.name}</strong>
              <span>{ended ? 'Đã kết thúc' : 'Chỉ 2 người thấy · không lưu'}</span>
            </div>
          </div>
          {!ended && (
            <button type="button" className="talk-btn is-danger" onClick={() => talk.askEnd()}>
              Kết thúc {!touch && <kbd>Esc</kbd>}
            </button>
          )}
        </header>
        <p className="talk-state">
          {ended
            ? touch
              ? 'Bạn đi lại được rồi'
              : 'Bạn đi lại được rồi · bấm W A S D để quay lại hang'
            : '🧍 Hai bạn đang đứng yên trong hang · 💬 cả hang thấy bạn đang trò chuyện'}
        </p>
        <ol className="talk-msgs" ref={list} aria-live="polite">
          <li className="talk-sys">Bắt đầu trò chuyện riêng với {conv.name}. Chào một câu đi!</li>
          {conv.messages.map((m) => (
            <li
              key={m.key}
              className={`talk-msg${m.mine ? ' is-mine' : ''}${m.pending ? ' is-pending' : ''}${m.failed ? ' is-failed' : ''}`}
            >
              {m.text}
              {m.failed && <span className="talk-fail"> · chưa gửi được</span>}
            </li>
          ))}
          {ended && <li className="talk-sys">{endedText(conv)}</li>}
        </ol>
        {ended ? (
          <button
            type="button"
            className="talk-btn is-ok talk-close"
            onClick={() => talk.dismiss()}
          >
            Đóng, quay lại hang
          </button>
        ) : (
          <form className="talk-form" onSubmit={send}>
            <input
              id="talk-input"
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              placeholder={`Nhắn cho ${conv.name}…`}
              autoComplete="off"
              enterKeyHint="send"
              aria-label={`Nhắn cho ${conv.name}`}
            />
            <button type="submit" className="talk-btn is-send" disabled={!draft.trim()}>
              Gửi
            </button>
          </form>
        )}
      </section>

      {confirming && (
        <div className="talk-confirm-dim">
          <div
            className="talk-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="talk-confirm-title"
          >
            <strong id="talk-confirm-title">Kết thúc trò chuyện với {conv.name}?</strong>
            <p>Tin nhắn sẽ mất, không xem lại được. Cả hai sẽ đi lại bình thường.</p>
            <div className="talk-confirm-acts">
              <button
                ref={stay}
                type="button"
                className="talk-btn"
                onClick={() => talk.cancelEnd()}
              >
                Ở lại
              </button>
              <button type="button" className="talk-btn is-danger" onClick={() => talk.end()}>
                Kết thúc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
