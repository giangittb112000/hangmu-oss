import GAME from '../shared/game-constants.json'
import { DUMMY_RADIUS, RING_R, SLOTS, slotXZ } from './rage/ring'
import { BENCH_DEPTH, BENCH_LEN, BENCHES } from './benchLayout'
import { ARENA_RADIUS, BOARD_TOP, BOARD_Z, CAVE, tierY } from './dimensions'

export const PLAYER_RADIUS = GAME.playerRadius

export const WALK_RADIUS = GAME.walkRadius
export const FIRE_RADIUS = GAME.fireRadius
const BOARD = { z: BOARD_Z, halfW: 12.9, halfD: 1.4 }

export const behindBoard = (x: number, y: number, z: number) =>
  z < BOARD.z + BOARD.halfD + 0.6 && Math.abs(x) < BOARD.halfW + 0.6 && y < BOARD_TOP + 0.6

export function groundY(x: number, z: number) {
  const r = Math.hypot(x, z)
  if (r < CAVE.pitRadius) return -CAVE.pitDepth
  if (r >= ARENA_RADIUS) return 0
  const tier = Math.floor((r - CAVE.pitRadius) / CAVE.tierWidth) + 1
  return tierY(Math.min(tier, CAVE.tiers))
}

function pushOutOfBox(
  p: { x: number; z: number },
  cx: number,
  cz: number,
  angle: number,
  halfW: number,
  halfD: number,
) {
  const dx = p.x - cx
  const dz = p.z - cz
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  const qx = Math.max(-halfW, Math.min(halfW, lx))
  const qz = Math.max(-halfD, Math.min(halfD, lz))
  let nx: number
  let nz: number
  const ox = lx - qx
  const oz = lz - qz
  const dist = Math.hypot(ox, oz)
  if (dist >= PLAYER_RADIUS) return
  if (dist < 1e-5) {
    if (halfW - Math.abs(lx) < halfD - Math.abs(lz)) {
      nx = (Math.sign(lx) || 1) * (halfW + PLAYER_RADIUS)
      nz = lz
    } else {
      nx = lx
      nz = (Math.sign(lz) || 1) * (halfD + PLAYER_RADIUS)
    }
  } else {
    const k = PLAYER_RADIUS / dist
    nx = qx + ox * k
    nz = qz + oz * k
  }
  p.x = cx + nx * c + nz * s
  p.z = cz - nx * s + nz * c
}

const BENCH_HALF_W = BENCH_LEN / 2
const BENCH_HALF_D = BENCH_DEPTH / 2

const CELL = 3
const cellKey = (cx: number, cz: number) => cx * 1000 + cz
const GRID = new Map<number, (typeof BENCHES)[number][]>()
for (const b of BENCHES) {
  const reach = BENCH_HALF_W + PLAYER_RADIUS
  for (let cx = Math.floor((b.x - reach) / CELL); cx <= Math.floor((b.x + reach) / CELL); cx++) {
    for (let cz = Math.floor((b.z - reach) / CELL); cz <= Math.floor((b.z + reach) / CELL); cz++) {
      const k = cellKey(cx, cz)
      const list = GRID.get(k)
      if (list) list.push(b)
      else GRID.set(k, [b])
    }
  }
}

const DUMMIES = Array.from({ length: SLOTS }, (_, k) => slotXZ(k))
const DUMMY_MIN = DUMMY_RADIUS + PLAYER_RADIUS

export function resolveCollisions(p: { x: number; z: number }) {
  let r = Math.hypot(p.x, p.z)
  if (r > WALK_RADIUS) {
    p.x *= WALK_RADIUS / r
    p.z *= WALK_RADIUS / r
    r = WALK_RADIUS
  }
  const minR = FIRE_RADIUS + PLAYER_RADIUS
  if (r < minR) {
    const k = r < 1e-5 ? 1 : minR / r
    p.x = r < 1e-5 ? minR : p.x * k
    p.z = r < 1e-5 ? 0 : p.z * k
  }
  if (r < RING_R + 1.5) {
    for (const d of DUMMIES) {
      const dx = p.x - d.x
      const dz = p.z - d.z
      const dd = Math.hypot(dx, dz)
      if (dd < DUMMY_MIN && dd > 1e-5) {
        p.x = d.x + (dx / dd) * DUMMY_MIN
        p.z = d.z + (dz / dd) * DUMMY_MIN
      }
    }
  }
  pushOutOfBox(p, 0, BOARD.z, 0, BOARD.halfW, BOARD.halfD)
  const near = GRID.get(cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL)))
  if (near) for (const b of near) pushOutOfBox(p, b.x, b.z, b.angle, BENCH_HALF_W, BENCH_HALF_D)
}
