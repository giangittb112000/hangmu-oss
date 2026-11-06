import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

export const FPS_ELEMENT_ID = 'hangmu-fps'

export function FpsMeter() {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ frames: 0, time: 0, worst: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.frames++
    a.time += dt
    a.worst = Math.max(a.worst, dt)
    if (a.time < 0.5) return
    const fps = a.frames / a.time
    const el = document.getElementById(FPS_ELEMENT_ID)
    if (el) {
      el.textContent = `${Math.round(fps)} FPS · ${((a.time / a.frames) * 1000).toFixed(1)} ms · tệ nhất ${(a.worst * 1000).toFixed(0)} ms · ×${gl.getPixelRatio().toFixed(2)}`
      el.dataset.level = fps >= 55 ? 'good' : fps >= 35 ? 'ok' : 'bad'
    }
    a.frames = 0
    a.time = 0
    a.worst = 0
  })
  return null
}
