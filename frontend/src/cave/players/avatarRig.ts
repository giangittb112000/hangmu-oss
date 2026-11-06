import * as THREE from 'three'

export const AV = {
  hipY: 0.55,
  hipX: 0.13,
  legLen: 0.42,
  legR: 0.085,
  torsoR: 0.3,
  torsoLen: 0.34,
  torsoY: 1.0,
  headR: 0.25,
  headY: 1.66,
  shoulderY: 1.34,
  shoulderX: 0.37,
  armLen: 0.44,
  armR: 0.075,
  handR: 0.095,
  footR: 0.11,
} as const

export const AVATAR_TOP = AV.headY + AV.headR

const STRIDE = 2.0
const ACCEL_REF = 14
export const PUNCH_ANIM_MS = 420
export const HIT_ANIM_MS = 700
const HOP_HEIGHT = 0.6
const HOP_SPEED = 7.5

export type AnimState = {
  gait: number
  prevSpeed: number
  squash: number
  seed: number
}

export const makeAnim = (seed: number): AnimState => ({
  gait: seed * 6.28,
  prevSpeed: 0,
  squash: 0,
  seed,
})

export type Pose = {
  hop: number
  push: number
  bob: number
  lean: number
  twist: number
  roll: number
  squash: number
  headYaw: number
  headRoll: number
  limbs: Float32Array
  stars: number
}

export const makePose = (): Pose => ({
  hop: 0,
  push: 0,
  bob: 0,
  lean: 0,
  twist: 0,
  roll: 0,
  squash: 0,
  headYaw: 0,
  headRoll: 0,
  limbs: new Float32Array(8),
  stars: 0,
})

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const wander = (x: number) => Math.sin(x) * 0.6 + Math.sin(x * 2.3 + 1.7) * 0.4

function mix(l: Float32Array, j: number, fwd: number, out: number, w: number) {
  l[j * 2] = lerp(l[j * 2]!, fwd, w)
  l[j * 2 + 1] = lerp(l[j * 2 + 1]!, out, w)
}

export function computePose(
  out: Pose,
  a: AnimState,
  speed: number,
  dt: number,
  t: number,
  party: number,
  punchK: number,
  hitK: number,
  motion: boolean,
) {
  const m = motion ? 1 : 0
  const n = Math.min(1, speed / 9)
  const walk = smooth(0.2, 1.5, speed)
  a.gait = (a.gait + dt * speed * ((Math.PI * 2) / STRIDE)) % (Math.PI * 200)
  const ph = a.gait
  const acc = dt > 0 ? (speed - a.prevSpeed) / dt : 0
  a.prevSpeed = speed
  const target = Math.max(-1, Math.min(1, acc / ACCEL_REF)) * 0.07 * m
  a.squash = lerp(a.squash, target, 1 - Math.exp(-dt * 12))

  const breathe = (1 - walk) * Math.sin(t * 2.2 + a.seed * 6) * 0.022 * m
  out.bob = walk * Math.abs(Math.sin(ph)) * 0.06
  out.hop =
    party > 0 && motion ? Math.abs(Math.sin(t * HOP_SPEED + a.seed * 11)) * HOP_HEIGHT * party : 0
  out.lean = (0.05 + 0.13 * n) * walk * m
  out.twist = Math.sin(ph) * 0.12 * walk * m
  out.roll = 0
  out.push = 0
  out.squash = a.squash - breathe
  out.headYaw = (1 - walk) * (1 - party) * wander(t * 0.45 + a.seed * 30) * 0.5 * m
  out.headRoll = 0
  out.stars = 0

  const l = out.limbs
  const swing = Math.sin(ph) * 0.75 * walk
  l[0] = -swing + 0.05
  l[1] = 0.14 + breathe * 2
  l[2] = swing + 0.05
  l[3] = 0.14 + breathe * 2
  l[4] = swing * 0.9
  l[5] = 0.03
  l[6] = -swing * 0.9
  l[7] = 0.03

  if (party > 0) {
    const wv = Math.sin(t * 14 + a.seed * 9) * 0.25 * m
    mix(l, 0, 0.2, 2.75 + wv, party)
    mix(l, 1, 0.2, 2.75 - wv, party)
    const air = smooth(0.05, 0.3, out.hop)
    mix(l, 2, 0.45, 0.18, air)
    mix(l, 3, -0.2, 0.18, air)
    out.lean = lerp(out.lean, -0.06 * m, party)
  }

  if (punchK >= 0 && punchK < 1) {
    const wind = smooth(0, 0.25, punchK) * (1 - smooth(0.25, 0.45, punchK))
    const strike = smooth(0.22, 0.42, punchK) * (1 - smooth(0.62, 1, punchK))
    out.twist += (-0.6 * wind + 0.45 * strike) * m
    out.push += 0.15 * strike * m
    out.lean += 0.1 * strike * m
    mix(l, 1, -0.7, 0.35, wind)
    mix(l, 1, 1.62, -0.12, strike)
    const guard = Math.max(wind, strike)
    mix(l, 0, 1.95, -0.35, guard)
    mix(l, 2, 0.35, 0.05, guard * 0.8)
    mix(l, 3, -0.3, 0.05, guard * 0.8)
  }

  if (hitK >= 0 && hitK < 1) {
    const d = 1 - hitK
    const kick = Math.sin(Math.min(1, hitK * 2.5) * Math.PI)
    out.lean -= 0.38 * kick * m
    out.push -= 0.22 * kick * m
    out.roll = Math.sin(hitK * Math.PI * 3) * 0.18 * d * m
    out.headRoll = Math.sin(hitK * Math.PI * 5) * 0.45 * d * m
    const flail = Math.sin(hitK * 30) * 0.3 * m
    mix(l, 0, 0.4, 1.7 + flail, kick)
    mix(l, 1, 0.6, 1.5 - flail, kick)
    mix(l, 2, 0.45, 0.1, kick)
    mix(l, 3, -0.15, 0.1, kick)
    out.stars = smooth(0, 0.08, hitK) * (1 - smooth(0.8, 1, hitK)) * m
  }
}

export type AvatarMatrices = {
  body: THREE.Matrix4
  head: THREE.Matrix4
  limbs: [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4, THREE.Matrix4]
}

export const makeAvatarMatrices = (): AvatarMatrices => ({
  body: new THREE.Matrix4(),
  head: new THREE.Matrix4(),
  limbs: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()],
})

const UP = new THREE.Vector3(0, 1, 0)
const ONE = new THREE.Vector3(1, 1, 1)
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _root = new THREE.Matrix4()
const _frame = new THREE.Matrix4()
const _local = new THREE.Matrix4()

function limb(
  out: THREE.Matrix4,
  parent: THREE.Matrix4,
  x: number,
  y: number,
  fwd: number,
  outA: number,
  side: number,
) {
  _e.set(-fwd, 0, side * outA, 'ZXY')
  _q.setFromEuler(_e)
  _p.set(x, y, 0)
  out.multiplyMatrices(parent, _local.compose(_p, _q, ONE))
}

export function avatarMatrices(
  p: Pose,
  x: number,
  y: number,
  z: number,
  heading: number,
  out: AvatarMatrices,
) {
  _q.setFromAxisAngle(UP, heading)
  _p.set(x + Math.sin(heading) * p.push, y + p.hop, z + Math.cos(heading) * p.push)
  _root.compose(_p, _q, ONE)

  _e.set(p.lean, p.twist, p.roll, 'YXZ')
  _q.setFromEuler(_e)
  _p.set(0, AV.hipY + p.bob, 0)
  _frame.multiplyMatrices(_root, _local.compose(_p, _q, ONE))

  const s = p.squash
  const k = 1 - s * 0.6
  _q.identity()
  _p.set(0, (AV.torsoY - AV.hipY) * (1 - s), 0)
  _s.set(1 + s * 0.5, 1 - s, 1 + s * 0.5)
  out.body.multiplyMatrices(_frame, _local.compose(_p, _q, _s))

  _e.set(0, p.headYaw, p.headRoll, 'YXZ')
  _q.setFromEuler(_e)
  _p.set(0, (AV.headY - AV.hipY) * k, 0)
  out.head.multiplyMatrices(_frame, _local.compose(_p, _q, ONE))

  const l = p.limbs
  const sy = (AV.shoulderY - AV.hipY) * k
  limb(out.limbs[0], _frame, AV.shoulderX, sy, l[0]!, l[1]!, 1)
  limb(out.limbs[1], _frame, -AV.shoulderX, sy, l[2]!, l[3]!, -1)
  limb(out.limbs[2], _root, AV.hipX, AV.hipY + p.bob + Math.max(0, l[4]!) * 0.12, l[4]!, l[5]!, 1)
  limb(out.limbs[3], _root, -AV.hipX, AV.hipY + p.bob + Math.max(0, l[6]!) * 0.12, l[6]!, l[7]!, -1)
}
