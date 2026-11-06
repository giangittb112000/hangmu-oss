import { useRef } from 'react'
import { useControls } from './controls'

const RADIUS = 52

export function Joystick() {
  const { stick } = useControls()
  const knob = useRef<HTMLDivElement>(null)
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null)

  const move = (clientX: number, clientY: number) => {
    const a = active.current
    if (!a) return
    let dx = clientX - a.cx
    let dy = clientY - a.cy
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
    stick.set(dx / RADIUS, -dy / RADIUS)
  }

  const end = () => {
    active.current = null
    stick.release()
    if (knob.current) knob.current.style.transform = 'translate(0, 0)'
  }

  return (
    <div
      className="cave-stick"
      role="application"
      aria-label="Cần điều khiển di chuyển"
      onPointerDown={(e) => {
        if (active.current) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const r = e.currentTarget.getBoundingClientRect()
        active.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
        move(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (active.current?.id === e.pointerId) move(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        if (active.current?.id === e.pointerId) end()
      }}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div ref={knob} className="cave-stick-knob" />
    </div>
  )
}
