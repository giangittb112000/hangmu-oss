import { useEffect, useState } from 'react'
import { isTyping } from './players/useKeyboard'

const DESKTOP: [string, string][] = [
  ['W A S D', 'Đi lại'],
  ['Chuột', 'Xoay góc nhìn (bấm vào cảnh để khoá chuột, Esc để thả)'],
  ['F / Click', 'Đấm người trong vòng đỏ trước mặt'],
  ['C', 'Bắt chuyện (chat riêng) với người đứng gần'],
  ['G', 'Ăn mừng'],
  ['Enter', 'Chat'],
  ['1 2 3', 'Bình chọn'],
  ['E', 'Vào phòng xả giận (khi đứng gần hình nộm quanh đống lửa)'],
  ['M', 'Tắt / bật tiếng'],
  ['V', 'Tắt / bật tiếng video bảng tin'],
  ['H', 'Mở / đóng bảng này'],
]

const TOUCH: [string, string][] = [
  ['Cần điều khiển', 'Đi lại'],
  ['Vuốt màn hình', 'Xoay góc nhìn'],
  ['👊', 'Đấm người trong vòng đỏ trước mặt'],
  ['💬', 'Bắt chuyện (chat riêng) với người đứng gần'],
  ['🎉', 'Ăn mừng'],
  ['🍅', 'Phòng xả giận: lại gần hình nộm quanh đống lửa → "Vào phòng"'],
]

export function ControlsHelp({ touch, locked }: { touch: boolean; locked: boolean }) {
  const [open, setOpen] = useState(false)
  const [everLocked, setEverLocked] = useState(false)
  if (locked && !everLocked) setEverLocked(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.code === 'KeyH') setOpen((o) => !o)
      else if (e.code === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => setOpen(false)

  const rows = touch ? TOUCH : DESKTOP
  return (
    <>
      {!touch && !everLocked && !open && (
        <p className="cave-lock-hint" aria-hidden="true">
          Bấm vào cảnh để xoay bằng chuột
        </p>
      )}
      <button
        type="button"
        className="cave-help-btn"
        aria-expanded={open}
        aria-controls="cave-help-card"
        title={touch ? 'Cách điều khiển' : 'Cách điều khiển (H)'}
        onClick={(e) => {
          if (open) close()
          else setOpen(true)
          if (e.detail > 0) e.currentTarget.blur()
        }}
      >
        {touch ? 'Hướng dẫn' : 'Phím (H)'}
      </button>
      {open && (
        <section id="cave-help-card" className="cave-help-card" aria-label="Cách điều khiển">
          <p className="cave-help-title">Cách điều khiển</p>
          <dl className="cave-help-list">
            {rows.map(([k, v]) => (
              <div key={k} className="cave-help-row">
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className="cave-help-ok"
            onClick={(e) => {
              close()
              if (e.detail > 0) e.currentTarget.blur()
            }}
          >
            Đã hiểu
          </button>
        </section>
      )}
    </>
  )
}
