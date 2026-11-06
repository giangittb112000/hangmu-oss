import * as THREE from 'three'
import RAGE from '../../shared/rage-room.json'
import { groundY } from '../collision'
import { CAVE } from '../dimensions'
import { DUMMY_RADIUS, RING_R, SLOTS, slotAngle } from './ring'

export { DUMMY_RADIUS, RING_R, SLOTS, slotAngle }
export const NEAR_DIST = RAGE.nearDist
export const FLOOR_Y = -CAVE.pitDepth

export const BODY_HALF_W = 0.38
export const HEAD_HALF_W = 0.27
export const BODY_Y0 = 0.6
export const BODY_TOP = 2.05
export const BODY_Y1 = 2.5
export const halfWidthAt = (h: number) => (h > BODY_TOP ? HEAD_HALF_W : BODY_HALF_W)
const OUTS = Array.from({ length: SLOTS }, (_, k) => {
  const a = slotAngle(k)
  return new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
})
const SIDES = Array.from({ length: SLOTS }, (_, k) => {
  const a = slotAngle(k)
  return new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))
})
const BASES = OUTS.map((o) => o.clone().multiplyScalar(RING_R).setY(FLOOR_Y))

export const slotBase = (k: number, out = new THREE.Vector3()) => out.copy(BASES[k]!)

export function nearestSlot(x: number, z: number) {
  let best = 0
  let bestD = Infinity
  for (let k = 0; k < SLOTS; k++) {
    const d = Math.hypot(x - BASES[k]!.x, z - BASES[k]!.z)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return { slot: best, dist: bestD }
}

const VIEW_BACK = 7.5
const VIEW_UP = 5.8
const LOOK_UP = 1.4

export function viewFor(k: number, pos: THREE.Vector3, look: THREE.Vector3) {
  pos.copy(BASES[k]!).addScaledVector(OUTS[k]!, VIEW_BACK)
  pos.y = FLOOR_Y + VIEW_UP
  look.copy(BASES[k]!)
  look.y = FLOOR_Y + LOOK_UP
}

export function hitPoint(k: number, u: number, v: number, out = new THREE.Vector3()) {
  const h = BODY_Y0 + v * (BODY_Y1 - BODY_Y0)
  const half = halfWidthAt(h)
  out
    .copy(BASES[k]!)
    .addScaledVector(SIDES[k]!, u * half)
    .addScaledVector(OUTS[k]!, half + 0.02)
  out.y = FLOOR_Y + h
  return out
}

export function hitLocal(u: number, v: number, out: THREE.Vector3) {
  const h = BODY_Y0 + v * (BODY_Y1 - BODY_Y0)
  const half = halfWidthAt(h)
  return out.set(u * half, h, half + 0.02)
}

export type Aim = { slot: number; u: number; v: number }
export const MISS = 255

const tmp = new THREE.Vector3()
const diff = new THREE.Vector3()

export function aimAt(ray: THREE.Ray, point: THREE.Vector3): Aim {
  let best: Aim | null = null
  let bestT = Infinity
  for (let k = 0; k < SLOTS; k++) {
    const n = OUTS[k]!
    const denom = ray.direction.dot(n)
    if (denom > -1e-4) continue
    const t = diff.copy(BASES[k]!).sub(ray.origin).dot(n) / denom
    if (t <= 0 || t >= bestT) continue
    ray.at(t, tmp)
    const h = tmp.y - FLOOR_Y
    const lateral = diff.copy(tmp).sub(BASES[k]!).dot(SIDES[k]!)
    const half = halfWidthAt(h)
    if (h < BODY_Y0 || h > BODY_Y1 || Math.abs(lateral) > half) continue
    bestT = t
    best = { slot: k, u: lateral / half, v: (h - BODY_Y0) / (BODY_Y1 - BODY_Y0) }
  }
  if (best) return best
  missAt(ray, point)
  return { slot: MISS, u: 0, v: 0 }
}

const MISS_MAX = 40
const MISS_STEP = 0.5
const MISS_FAR = 14
const below = (p: THREE.Vector3) => p.y <= groundY(p.x, p.z)

export function missAt(ray: THREE.Ray, out: THREE.Vector3) {
  let lo = 0
  let hit = -1
  for (let t = MISS_STEP; t <= MISS_MAX; t += MISS_STEP) {
    if (below(ray.at(t, out))) {
      hit = t
      break
    }
    lo = t
  }
  if (hit > 0) {
    let hi = hit
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2
      if (below(ray.at(mid, out))) hi = mid
      else lo = mid
    }
    ray.at(hi, out)
  } else {
    ray.at(MISS_FAR, out)
  }
  out.y = groundY(out.x, out.z) + 0.03
  return out
}
