import { useState } from 'react'
import { createPortal } from 'react-dom'
import { InstallGuide } from './InstallGuide'
import { canOfferInstall, pwa, useInstallMode } from './pwa'

export function useInstallAction() {
  const mode = useInstallMode()
  const [guide, setGuide] = useState(false)
  const start = async () => {
    if (!(await pwa.install())) setGuide(true)
  }
  const guideEl = guide
    ? createPortal(<InstallGuide mode={mode} onClose={() => setGuide(false)} />, document.body)
    : null
  return { mode, available: canOfferInstall(mode), start, guideEl }
}
