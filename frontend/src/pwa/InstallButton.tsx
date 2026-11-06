import { installLabel } from './pwa'
import { useInstallAction } from './useInstallAction'
import './pwa.css'

export function InstallButton({ className = '' }: { className?: string }) {
  const { mode, available, start, guideEl } = useInstallAction()
  if (!available) return null
  return (
    <>
      <button type="button" className={`pwa-button ${className}`} onClick={() => void start()}>
        <span aria-hidden="true">📲</span> {installLabel(mode)}
      </button>
      {guideEl}
    </>
  )
}
