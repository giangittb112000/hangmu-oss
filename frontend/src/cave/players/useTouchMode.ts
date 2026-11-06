import { useEffect, useState } from 'react'

export function useTouchMode() {
  const [touch, setTouch] = useState(() => {
    const forced = new URLSearchParams(window.location.search).get('joystick')
    if (forced === '1') return true
    if (forced === '0') return false
    return (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia('(any-pointer: coarse)').matches
  })

  useEffect(() => {
    if (touch) return
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true)
    }
    window.addEventListener('pointerdown', onPointer, { passive: true })
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [touch])

  return touch
}
