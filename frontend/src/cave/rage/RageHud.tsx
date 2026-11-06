import { useEffect, useRef, useState } from 'react'
import { net } from '../../net/NetClient'
import { isTyping } from '../players/useKeyboard'
import { SLOTS } from './geometry'
import { ITEM_ICONS, ITEM_NAMES, NICKNAMES, rage, useRage } from './rageState'

const FULL_POWER_MS = 900
const ROLES = ['thủ môn', 'hậu vệ', 'tiền vệ', 'tiền đạo', 'HLV'] as const
const ROLE_TITLE: Record<(typeof ROLES)[number], string> = {
  'thủ môn': 'Thủ môn',
  'hậu vệ': 'Hậu vệ',
  'tiền vệ': 'Tiền vệ',
  'tiền đạo': 'Tiền đạo',
  HLV: 'HLV',
}

function enterRoom() {
  if (document.pointerLockElement) document.exitPointerLock()
  rage.enter()
}

export function RageHud({ touch }: { touch: boolean }) {
  const s = useRage()
  const [aim, setAim] = useState({ x: 0.5, y: 0.45 })
  const [charge, setCharge] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(!touch)
  const holdStart = useRef<number | null>(null)
  const raf = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const snap = rage.getSnapshot()
      if (e.code === 'KeyE' && !snap.active && snap.near) {
        e.preventDefault()
        enterRoom()
      } else if (e.code === 'Escape' && snap.active) {
        rage.exit()
      } else if (snap.active && /^Digit[1-4]$/.test(e.code)) {
        rage.setItem(Number(e.code.slice(5)) - 1)
      } else if (snap.active && (e.code === 'KeyA' || e.code === 'ArrowLeft')) {
        rage.cycle(-1)
      } else if (snap.active && (e.code === 'KeyD' || e.code === 'ArrowRight')) {
        rage.cycle(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => () => rage.exit(), [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  if (!s.active) {
    if (!s.near) return null
    return (
      <div className="rage-prompt" role="status">
        <span>🍅 Phòng xả giận</span>
        <span className="rage-prompt-sub">ném cà chua vào hình nộm</span>
        {touch ? (
          <button type="button" className="rage-enter" onClick={enterRoom}>
            Vào phòng
          </button>
        ) : (
          <span>
            <kbd>E</kbd> để vào
          </span>
        )}
      </div>
    )
  }

  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const startCharge = () => {
    holdStart.current = performance.now()
    const loop = () => {
      if (holdStart.current == null) return
      setCharge(
        Math.max(0.01, Math.min(1, (performance.now() - holdStart.current) / FULL_POWER_MS)),
      )
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
  }
  const stopCharge = () => {
    holdStart.current = null
    cancelAnimationFrame(raf.current)
    setCharge(0)
  }
  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (holdStart.current == null) return
    const power = Math.min(1, (performance.now() - holdStart.current) / FULL_POWER_MS)
    stopCharge()
    const p = point(e)
    rage.request = { ndcX: p.x * 2 - 1, ndcY: -(p.y * 2 - 1), power }
  }

  const label = (slot: number) => NICKNAMES[s.labels[slot] ?? 0]?.name ?? ''

  return (
    <>
      <div
        className="rage-aim"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setAim(point(e))
          startCharge()
        }}
        onPointerMove={(e) => setAim(point(e))}
        onPointerUp={release}
        onPointerCancel={stopCharge}
      >
        <div
          className="rage-cross"
          style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        className="rage-turn is-prev"
        aria-label="Hình nộm bên trái"
        title={touch ? undefined : 'Hình nộm bên trái (A / ←)'}
        onClick={() => rage.cycle(-1)}
      >
        ◀
      </button>
      <button
        type="button"
        className="rage-turn is-next"
        aria-label="Hình nộm bên phải"
        title={touch ? undefined : 'Hình nộm bên phải (D / →)'}
        onClick={() => rage.cycle(1)}
      >
        ▶
      </button>

      <button type="button" className="rage-exit" onClick={() => rage.exit()}>
        ← Ra phòng{touch ? '' : ' (Esc)'}
      </button>
      <p className="rage-disclaimer">
        Trò đùa xả stress của fan, không nhằm xúc phạm bất kỳ ai. Chỉ ném đồ mềm vào hình nộm. Anh
        em vẫn yêu đội 🔴
      </p>
      <p className="rage-counter" aria-live="off">
        🍅 Hôm nay cả hang đã ném <b>{s.today.toLocaleString('vi-VN')}</b> món
      </p>

      <div className="rage-items" role="radiogroup" aria-label="Chọn món để ném">
        {ITEM_NAMES.map((name, i) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={s.item === i}
            className={`rage-item${s.item === i ? ' is-on' : ''}`}
            onClick={() => rage.setItem(i)}
          >
            <span className="rage-item-icon" aria-hidden="true">
              {ITEM_ICONS[i]}
            </span>
            {name}
            {!touch && <kbd>{i + 1}</kbd>}
          </button>
        ))}
      </div>

      <div className="rage-power" aria-hidden="true" data-on={charge > 0 || undefined}>
        <i style={{ width: `${charge * 100}%` }} />
        <span>{touch ? 'giữ ngón tay = lấy lực' : 'giữ chuột = lấy lực, thả để ném'}</span>
      </div>

      {!pickerOpen ? (
        <button type="button" className="rage-picker-toggle" onClick={() => setPickerOpen(true)}>
          🎭 Đổi biệt danh: <b>{label(s.slot)}</b> ▾
        </button>
      ) : (
        <section className="rage-picker" aria-label="Biệt danh cho hình nộm">
          <div className="rage-picker-head">
            <h2>Biệt danh cho hình nộm</h2>
            <button type="button" aria-label="Thu gọn" onClick={() => setPickerOpen(false)}>
              ×
            </button>
          </div>
          <p>Cả hang cùng thấy biển này. Không có bảng xếp hạng.</p>
          <div className="rage-slots" role="radiogroup" aria-label="Chọn hình nộm">
            {Array.from({ length: SLOTS }, (_, k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={s.slot === k}
                className={`rage-slot${s.slot === k ? ' is-on' : ''}`}
                onClick={() => rage.setSlot(k)}
              >
                {k + 1}. {label(k)}
              </button>
            ))}
          </div>
          {ROLES.map((role) => (
            <div key={role}>
              <p className="rage-group">{ROLE_TITLE[role]}</p>
              <div className="rage-chips">
                {NICKNAMES.map((n, i) =>
                  n.role === role ? (
                    <button
                      key={n.name}
                      type="button"
                      className={`rage-chip${s.labels[s.slot] === i ? ' is-on' : ''}`}
                      onClick={() => net.sendRageLabel(s.slot, i)}
                    >
                      {n.name}
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="rage-chip rage-random"
            onClick={() => net.sendRageLabel(s.slot, Math.floor(Math.random() * NICKNAMES.length))}
          >
            🎭 Ngẫu nhiên
          </button>
        </section>
      )}
    </>
  )
}
