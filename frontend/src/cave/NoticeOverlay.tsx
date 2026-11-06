import { useEffect } from 'react'
import {
  isWave,
  NOTICE_SHOW_MS,
  NOTICE_STYLE,
  noticeParts,
  notices,
  useNotice,
  type Notice,
} from '../net/notices'

export function NoticeOverlay() {
  const n = useNotice()
  usePreview()
  if (!n) return null
  const wave = isWave(n)
  const style = NOTICE_STYLE[n.kind]
  return (
    <div
      key={n.id}
      className="notice"
      data-wave={wave ? '' : undefined}
      data-kind={n.kind}
      style={{ '--notice-ms': `${NOTICE_SHOW_MS}ms` } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <p className="notice-main">
        {!wave && (
          <span className="notice-icon" aria-hidden="true">
            {style.icon}
          </span>
        )}
        {noticeParts(n).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : p.text))}
      </p>
      <p className="notice-sub">{style.sub}</p>
    </div>
  )
}

const DEMO: Notice[] = [
  { kind: 'tele_join', names: ['Giang'], more: 0 },
  { kind: 'tele_join', names: ['Tuấn', 'Minh'], more: 3 },
  { kind: 'tele_invite', names: [], more: 0, variant: 0 },
  { kind: 'room_join', names: ['Hùng'], more: 0 },
  { kind: 'room_join', names: ['Lan', 'Phúc'], more: 4 },
  { kind: 'tele_join', names: ['Hùng', 'Lan'], more: 10 },
]

declare global {
  interface Window {
    __notice?: (names?: string[], more?: number, kind?: Notice['kind']) => void
  }
}

function usePreview() {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    if (new URLSearchParams(window.location.search).has('notice')) {
      DEMO.forEach((n, i) => timers.push(setTimeout(() => notices.push(n), 3000 + i * 5000)))
    }
    if (import.meta.env.DEV) {
      window.__notice = (names = ['Giang'], more = 0, kind = 'tele_join') =>
        notices.push({ kind, names: names.slice(0, 2), more, variant: more })
    }
    return () => {
      timers.forEach(clearTimeout)
      if (import.meta.env.DEV) delete window.__notice
    }
  }, [])
}
