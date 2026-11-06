import { createContext, useContext } from 'react'
import { QUALITY, type Quality } from './quality'

export type QualityCtx = { quality: Quality; downgrade: () => void }

export const QualityContext = createContext<QualityCtx>({
  quality: QUALITY.high,
  downgrade: () => {},
})

export const useQuality = () => useContext(QualityContext).quality
export const useDowngrade = () => useContext(QualityContext).downgrade
