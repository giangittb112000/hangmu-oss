import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { detectTier, QUALITY, rememberDowngrade, type Tier } from './quality'
import { QualityContext } from './useQuality'

export function QualityProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<Tier>(detectTier)
  const downgrade = useCallback(() => {
    setTier((t) => {
      if (t !== 'low') rememberDowngrade()
      return 'low'
    })
  }, [])
  const value = useMemo(() => ({ quality: QUALITY[tier], downgrade }), [tier, downgrade])
  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>
}
