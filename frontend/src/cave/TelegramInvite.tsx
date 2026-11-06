import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { config } from '../config'
import { PaperPlane } from '../PaperPlane'
import { notices, TELE_INVITE_LINES, useNotice } from '../net/notices'

const DONE_KEY = 'hangmu.tele.done'
const NUDGE_AFTER_MS = 15_000
const NUDGE_FOR_MS = 8_000
const INVITE_EVERY_MS = 60_000

const readDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return false
  }
}
const markDone = () => {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {}
}

export function TelegramInvite({ touch }: { touch: boolean }) {
  const [nudge, setNudge] = useState(false)
  const [attn, setAttn] = useState(() => !readDone())
  const shown = useNotice()?.kind
  const teleNotice = shown === 'tele_join' || shown === 'tele_invite'

  useEffect(() => {
    if (!config.telegramUrl) return
    let variant = Math.floor(Math.random() * TELE_INVITE_LINES.length)
    let timer: ReturnType<typeof setTimeout>
    const schedule = (ms: number) => {
      timer = setTimeout(() => {
        if (!readDone())
          notices.push({ kind: 'tele_invite', names: [], more: 0, variant: variant++ })
        schedule(INVITE_EVERY_MS)
      }, ms)
    }
    schedule(INVITE_EVERY_MS)
    return () => clearTimeout(timer)
  }, [])
  const btn = useRef<HTMLAnchorElement>(null)
  const bubble = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const b = bubble.current
    const a = btn.current
    if (!nudge || !b || !a) return
    const place = () => {
      const r = a.getBoundingClientRect()
      const w = b.offsetWidth
      const margin = 12
      const center = r.left + r.width / 2
      const left = Math.min(Math.max(center - 28, margin), window.innerWidth - margin - w)
      b.style.left = `${left}px`
      b.style.top = `${r.bottom + 12}px`
      b.style.setProperty('--arrow-x', `${center - left - 6}px`)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [nudge])

  useEffect(() => {
    if (!config.telegramUrl || readDone()) return
    const show = setTimeout(() => setNudge(true), NUDGE_AFTER_MS)
    const hide = setTimeout(() => setNudge(false), NUDGE_AFTER_MS + NUDGE_FOR_MS)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [])

  if (!config.telegramUrl) return null
  const done = () => {
    markDone()
    setNudge(false)
    setAttn(false)
  }
  return (
    <span className="cave-tele-wrap">
      <a
        ref={btn}
        className="cave-tele"
        data-nudge={nudge || teleNotice ? '' : undefined}
        data-attn={attn && !nudge ? '' : undefined}
        data-touch={touch ? '' : undefined}
        href={config.telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Tham gia group Telegram HangMu (mở tab mới)"
        title="Tham gia group Telegram HangMu"
        onClick={(e) => {
          done()
          if (e.detail > 0) e.currentTarget.blur()
        }}
      >
        <PaperPlane size={touch ? 21 : 18} />
        {!touch && <span>Group Tele</span>}
      </a>
      {nudge && (
        <div ref={bubble} className="cave-tele-nudge" role="status">
          <span>
            👆 Vào <b>group Tele HangMu</b> để nhận lịch xem chung &amp; thông báo trận!
          </span>
          <button
            type="button"
            className="cave-tele-nudge-close"
            aria-label="Tắt lời nhắc"
            onClick={done}
          >
            ×
          </button>
        </div>
      )}
    </span>
  )
}
