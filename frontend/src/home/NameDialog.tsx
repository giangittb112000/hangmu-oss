import { loadLocal, saveLocal } from '../storage'
import { useEffect, useId, useRef, useState } from 'react'

const MAX = 30
const STORAGE_KEY = 'hangmu.name'
const NUMBER_KEY = 'hangmu.number'

const INVISIBLE: [number, number][] = [
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
]

const isInvisible = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0
  return c < 0x20 || (c >= 0x7f && c < 0xa0) || INVISIBLE.some(([a, b]) => c >= a && c <= b)
}

function cleanName(raw: string) {
  return Array.from(raw.normalize('NFC'))
    .filter((ch) => !isInvisible(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

const countChars = (s: string) => Array.from(s).length

const readSaved = (key: string) => loadLocal(key) ?? ''

const cleanNumber = (raw: string) => raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 2)

export function NameDialog({
  onSubmit,
  onCancel,
  initial,
}: {
  onSubmit: (name: string, number: number | null) => void
  onCancel: () => void
  initial?: { name: string; number: number | null }
}) {
  const [value, setValue] = useState(() => (initial ? initial.name : readSaved(STORAGE_KEY)))
  const [num, setNum] = useState(() =>
    initial ? cleanNumber(String(initial.number ?? '')) : cleanNumber(readSaved(NUMBER_KEY)),
  )
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const name = cleanName(value)
  const n = countChars(name)
  const valid = n >= 1 && n <= MAX

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  return (
    <div className="name-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          saveLocal(STORAGE_KEY, name)
          saveLocal(NUMBER_KEY, num)
          onSubmit(name, num ? Number(num) : null)
        }}
      >
        <h2 id={`${id}-title`}>{initial ? 'Đổi tên' : 'Anh em gọi bạn là gì?'}</h2>
        <label htmlFor={`${id}-name`} className="name-label">
          Tên hiện trên đầu nhân vật (không mạo danh, không phản cảm)
        </label>
        <input
          ref={input}
          id={`${id}-name`}
          className="name-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={60}
          autoComplete="nickname"
          enterKeyHint="go"
          spellCheck={false}
        />
        <p className={`name-count${n > MAX ? ' is-over' : ''}`} aria-live="polite">
          {n}/{MAX} ký tự
        </p>
        <div className="name-number-row">
          <div className="name-number-text">
            <label htmlFor={`${id}-number`} className="name-label">
              Số áo sau lưng
            </label>
            <p className="name-hint">1–99, để trống = áo trơn</p>
          </div>
          <div className="name-jersey" aria-hidden="true">
            <span className="name-jersey-num">{num || ''}</span>
          </div>
          <input
            id={`${id}-number`}
            className="name-input name-number"
            value={num}
            onChange={(e) => setNum(cleanNumber(e.target.value))}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            autoComplete="off"
            enterKeyHint="go"
            placeholder="7"
          />
        </div>
        <div className="name-actions">
          <button type="button" className="name-cancel" onClick={onCancel}>
            Huỷ
          </button>
          <button type="submit" className="home-enter" disabled={!valid}>
            Vào hang
          </button>
        </div>
      </form>
    </div>
  )
}
