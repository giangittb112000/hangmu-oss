import { useEffect, useRef } from 'react'
import type { InstallMode } from './pwa'
import './pwa.css'

function ShareIcon() {
  return (
    <svg className="pwa-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Steps({ mode }: { mode: InstallMode }) {
  switch (mode) {
    case 'ios':
      return (
        <ol className="pwa-steps">
          <li>
            Bấm nút <b>Chia sẻ</b> <ShareIcon /> (thanh dưới cùng của Safari, hoặc góc trên bên phải
            trên iPad / Chrome).
          </li>
          <li>
            Kéo xuống, chọn <b>Thêm vào MH chính</b> (Add to Home Screen).
          </li>
          <li>
            Bấm <b>Thêm</b>. Icon Hang MU sẽ nằm trên màn hình chính.
          </li>
        </ol>
      )
    case 'android':
      return (
        <ol className="pwa-steps">
          <li>
            Bấm nút menu <b>⋮</b> của trình duyệt (góc trên bên phải).
          </li>
          <li>
            Chọn <b>Thêm vào màn hình chính</b> hoặc <b>Cài đặt ứng dụng</b>.
          </li>
          <li>
            Bấm <b>Thêm</b> / <b>Cài đặt</b>.
          </li>
        </ol>
      )
    case 'mac-safari':
      return (
        <ol className="pwa-steps">
          <li>
            Trên thanh menu, chọn <b>Tệp → Thêm vào Dock</b> (File → Add to Dock).
          </li>
          <li>
            Bấm <b>Thêm</b>. Hang MU sẽ nằm trên Dock như một app.
          </li>
        </ol>
      )
    case 'inapp':
      return (
        <ol className="pwa-steps">
          <li>
            Bạn đang mở trang trong một app khác (Zalo, Facebook…), nơi này không thêm được vào màn
            hình chính.
          </li>
          <li>
            Bấm menu <b>⋯</b> của app, chọn <b>Mở bằng trình duyệt</b> (Safari / Chrome).
          </li>
          <li>Ở trình duyệt, bấm lại nút “Thêm vào màn hình chính”.</li>
        </ol>
      )
    default:
      return null
  }
}

export function InstallGuide({ mode, onClose }: { mode: InstallMode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pwa-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        className="pwa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-title"
        tabIndex={-1}
      >
        <img className="pwa-icon" src="/icon-192.png" alt="" width={56} height={56} />
        <h2 id="pwa-title">
          {mode === 'mac-safari' ? 'Thêm Hang MU vào Dock' : 'Thêm Hang MU vào màn hình chính'}
        </h2>
        <p className="pwa-lede">Có icon riêng như app, mở toàn màn hình, vào hang chỉ một chạm.</p>
        <Steps mode={mode} />
        <button type="button" className="pwa-close" onClick={onClose}>
          Đã hiểu
        </button>
      </div>
    </div>
  )
}
