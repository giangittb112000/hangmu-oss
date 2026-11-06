import { groundY, resolveCollisions } from '../collision'
import { ACCEL, MAX_SUBSTEP, RUN_SPEED, SIM_DT, TURN_RATE, WALK_SPEED } from './constants'

export type MoveInput = { mx: number; mz: number; run: boolean }

export const NO_INPUT: MoveInput = { mx: 0, mz: 0, run: false }

export type PlayerState = {
  x: number
  y: number
  z: number
  vx: number
  vz: number
  heading: number
}

export const makeState = (x: number, z: number, heading = 0): PlayerState => ({
  x,
  y: groundY(x, z),
  z,
  vx: 0,
  vz: 0,
  heading,
})

export function copyState(to: PlayerState, from: PlayerState) {
  to.x = from.x
  to.y = from.y
  to.z = from.z
  to.vx = from.vx
  to.vz = from.vz
  to.heading = from.heading
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function stepPlayer(s: PlayerState, input: MoveInput, dt = SIM_DT) {
  let mx = Number.isFinite(input.mx) ? input.mx : 0
  let mz = Number.isFinite(input.mz) ? input.mz : 0
  const len = Math.hypot(mx, mz)
  if (len > 1) {
    mx /= len
    mz /= len
  }
  const max = input.run ? RUN_SPEED : WALK_SPEED
  const k = Math.min(1, ACCEL * dt)
  s.vx += (mx * max - s.vx) * k
  s.vz += (mz * max - s.vz) * k
  if (len === 0 && s.vx * s.vx + s.vz * s.vz < 0.01) {
    s.vx = 0
    s.vz = 0
  }

  const px = s.x
  const pz = s.z
  const dist = Math.hypot(s.vx, s.vz) * dt
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP))
  const next = { x: s.x, z: s.z }
  for (let i = 0; i < n; i++) {
    next.x += (s.vx * dt) / n
    next.z += (s.vz * dt) / n
    resolveCollisions(next)
  }
  s.x = next.x
  s.z = next.z
  s.vx = (s.x - px) / dt
  s.vz = (s.z - pz) / dt

  s.y += (groundY(s.x, s.z) - s.y) * Math.min(1, dt * 14)

  const dx = s.x - px
  const dz = s.z - pz
  if (dx * dx + dz * dz > 1e-5) {
    const d = wrapAngle(Math.atan2(dx, dz) - s.heading)
    s.heading = wrapAngle(s.heading + d * Math.min(1, TURN_RATE * dt))
  }
}

export function lerpState(out: PlayerState, a: PlayerState, b: PlayerState, alpha: number) {
  out.x = a.x + (b.x - a.x) * alpha
  out.y = a.y + (b.y - a.y) * alpha
  out.z = a.z + (b.z - a.z) * alpha
  out.vx = b.vx
  out.vz = b.vz
  out.heading = a.heading + wrapAngle(b.heading - a.heading) * alpha
}
