import { useEffect, useState } from 'react'
import { notices } from '../net/notices'
import { loadLocal, saveLocal } from '../storage'
import { installLabel } from './pwa'
import { useInstallAction } from './useInstallAction'
import './pwa.css'

const SHOW_AFTER_MS =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pwa')
    ? 3000
    : 4 * 60_000
const SNOOZE_MS = 7 * 24 * 3600_000
const SNOOZE_KEY = 'hangmu.pwa.snoozedAt'

const snoozed = () => {
  const at = Number(loadLocal(SNOOZE_KEY))
  return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS
}

export function InstallNudge() {
  const { mode, available, start, guideEl } = useInstallAction()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!available || (snoozed() && SHOW_AFTER_MS > 3000)) return
    const t = setTimeout(() => setShow(true), SHOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [available])

  const visible = show && available
  useEffect(() => (visible ? notices.hold() : undefined), [visible])

  const close = () => {
    setShow(false)
    saveLocal(SNOOZE_KEY, String(Date.now()))
  }

  return (
    <>
      {visible && (
        <aside className="pwa-nudge" aria-label={installLabel(mode)}>
          <img src="/icon-192.png" alt="" width={36} height={36} />
          <p>
            <b>{installLabel(mode).replace('Thêm vào', 'Thêm Hang MU vào')}</b>
            <span>Lần sau vào hang chỉ một chạm</span>
          </p>
          <button
            type="button"
            className="pwa-nudge-add"
            onClick={() => {
              setShow(false)
              void start()
            }}
          >
            Thêm
          </button>
          <button
            type="button"
            className="pwa-nudge-close"
            aria-label="Không nhắc nữa"
            onClick={close}
          >
            ×
          </button>
        </aside>
      )}
      {guideEl}
    </>
  )
}
