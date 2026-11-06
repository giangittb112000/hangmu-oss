import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useControls } from './controls'
import { net } from '../../net/NetClient'
import { isTyping } from './useKeyboard'

const MOUSE_SCALE = 0.6
const EDGE_ZONE = 0.07
const MAX_LOCKED_DELTA = 300

export function useCameraDrag() {
  const { rig } = useControls()

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (!isTyping(e.target)) return
      rig.setEdge(0)
      if (document.pointerLockElement) document.exitPointerLock()
    }
    const onBlur = () => rig.setEdge(0)
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('blur', onBlur)
      if (document.pointerLockElement) document.exitPointerLock()
      rig.setEdge(0)
    }
  }, [rig])

  return useMemo(() => {
    const last = new Map<number, { x: number; y: number }>()
    const mouse = { x: 0, y: 0, active: false }

    return {
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.pointerType === 'mouse') {
          if (e.button === 0 && !isLocked()) {
            rig.setEdge(0)
            requestLock(e.currentTarget)
          } else if (e.button === 0) {
            net.punch()
          }
          return
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        last.set(e.pointerId, { x: e.clientX, y: e.clientY })
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (e.pointerType === 'mouse') {
          if (isLocked()) {
            const dx = e.movementX
            const dy = e.movementY
            if (Math.abs(dx) < MAX_LOCKED_DELTA && Math.abs(dy) < MAX_LOCKED_DELTA) {
              rig.rotate(dx * MOUSE_SCALE, dy * MOUSE_SCALE)
            }
            mouse.active = false
            return
          }
          if (mouse.active) {
            rig.rotate((e.clientX - mouse.x) * MOUSE_SCALE, (e.clientY - mouse.y) * MOUSE_SCALE)
          }
          mouse.x = e.clientX
          mouse.y = e.clientY
          mouse.active = true
          if (isTyping(document.activeElement)) {
            rig.setEdge(0)
            return
          }
          const r = e.currentTarget.getBoundingClientRect()
          const fx = (e.clientX - r.left) / r.width
          rig.setEdge(
            fx < EDGE_ZONE
              ? -(1 - fx / EDGE_ZONE)
              : fx > 1 - EDGE_ZONE
                ? (fx - (1 - EDGE_ZONE)) / EDGE_ZONE
                : 0,
          )
          return
        }
        const p = last.get(e.pointerId)
        if (!p) return
        const share = 1 / last.size
        rig.rotate((e.clientX - p.x) * share, (e.clientY - p.y) * share)
        p.x = e.clientX
        p.y = e.clientY
      },
      onPointerUp(e: React.PointerEvent<HTMLElement>) {
        last.delete(e.pointerId)
      },
      onPointerCancel(e: React.PointerEvent<HTMLElement>) {
        last.delete(e.pointerId)
      },
      onPointerLeave(e: React.PointerEvent<HTMLElement>) {
        if (e.pointerType !== 'mouse') return
        mouse.active = false
        rig.setEdge(0)
      },
    }
  }, [rig])
}

const isLocked = () => document.pointerLockElement != null

function requestLock(el: HTMLElement) {
  try {
    const p = el.requestPointerLock() as Promise<void> | undefined
    p?.catch(() => undefined)
  } catch {}
}

const subscribeLock = (fn: () => void) => {
  document.addEventListener('pointerlockchange', fn)
  return () => document.removeEventListener('pointerlockchange', fn)
}

export function usePointerLocked() {
  return useSyncExternalStore(subscribeLock, isLocked)
}
