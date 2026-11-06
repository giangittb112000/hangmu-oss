import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { FpsMeter } from './FpsMeter'
import { useDowngrade, useQuality } from './useQuality'

const WARMUP_MS = 5000

export function Performance() {
  const quality = useQuality()
  const downgrade = useDowngrade()
  const setDpr = useThree((s) => s.setDpr)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), WARMUP_MS)
    return () => clearTimeout(t)
  }, [])

  const [min, max] = quality.dpr
  const deviceMax = Math.min(max, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)

  return (
    <>
      <FpsMeter />
      {armed && (
        <PerformanceMonitor
          bounds={(refresh) => (refresh > 90 ? [60, 100] : [45, 57])}
          flipflops={4}
          factor={1}
          step={0.2}
          onChange={({ factor }) => setDpr(min + (deviceMax - min) * factor)}
          onFallback={() => {
            if (quality.tier === 'high') downgrade()
          }}
        />
      )}
      {quality.maxFps && <FrameLimiter fps={quality.maxFps} />}
    </>
  )
}

function FrameLimiter({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let raf = 0
    let last = 0
    const interval = 1000 / fps
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last >= interval - 1) {
        last = t
        invalidate()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fps, invalidate])
  return null
}
