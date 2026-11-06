import { useEffect, useState } from 'react'
import { notices } from '../net/notices'

const SHOW_MS = 5_000

export function PunchIntro({ touch }: { touch: boolean }) {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setShow(false), SHOW_MS)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!show) return
    return notices.hold()
  }, [show])
  if (!show) return null
  return (
    <section
      className="punch-intro"
      style={{ '--intro-ms': `${SHOW_MS}ms` } as React.CSSProperties}
      aria-label="Hướng dẫn đấm"
    >
      <span className="punch-intro-icon" aria-hidden="true">
        👊
      </span>
      <div className="punch-intro-body">
        <p className="punch-intro-title">Đấm anh em trong hang!</p>
        <p className="punch-intro-text">
          Đi tới gần ai đó — khi vòng dưới chân họ chuyển <b className="punch-intro-red">đỏ</b>,{' '}
          {touch ? (
            <>
              bấm nút <kbd>👊</kbd>
            </>
          ) : (
            <>
              nhấn <kbd>F</kbd> (hoặc <kbd>Click</kbd> khi đã khoá chuột)
            </>
          )}
          .
        </p>
      </div>
      <button
        type="button"
        className="punch-intro-close"
        aria-label="Đóng hướng dẫn"
        onClick={(e) => {
          setShow(false)
          if (e.detail > 0) e.currentTarget.blur()
        }}
      >
        ×
      </button>
      <span className="punch-intro-timer" aria-hidden="true" />
    </section>
  )
}
