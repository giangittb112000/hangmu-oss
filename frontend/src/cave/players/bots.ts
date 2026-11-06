import { rng } from '../../world/rock'
import { FIRE_RADIUS, resolveCollisions, WALK_RADIUS } from '../collision'
import type { PlayerEntry, PlayerStore } from './store'

type Brain = {
  tx: number
  tz: number
  wait: number
  run: boolean
  lastX: number
  lastZ: number
  stuck: number
}

export function readBotCount(): number {
  const n = Number(new URLSearchParams(window.location.search).get('bots'))
  return Number.isFinite(n) ? Math.max(0, Math.min(499, Math.floor(n))) : 0
}

export function createBots(store: PlayerStore, count: number, seed = 1) {
  const r = rng(seed)
  const brains = new Map<string, Brain>()
  const randomPoint = () => {
    const a = r() * Math.PI * 2
    const rad = FIRE_RADIUS + 1 + Math.sqrt(r()) * (WALK_RADIUS - FIRE_RADIUS - 1)
    const p = { x: Math.sin(a) * rad, z: Math.cos(a) * rad }
    resolveCollisions(p)
    return p
  }
  for (let i = 0; i < count; i++) {
    const p = randomPoint()
    const id = `bot-${i}`
    const num = r() < 0.8 ? 1 + Math.floor(r() * 99) : null
    store.add(id, p.x, p.z, r() * Math.PI * 2, false, '', null, num)
    const t = randomPoint()
    brains.set(id, {
      tx: t.x,
      tz: t.z,
      wait: r() * 3,
      run: r() < 0.15,
      lastX: p.x,
      lastZ: p.z,
      stuck: 0,
    })
  }

  return function think(dt: number) {
    for (const [id, b] of brains) {
      const e: PlayerEntry | undefined = store.players.get(id)
      if (!e) continue
      const s = e.curr
      if (b.wait > 0) {
        b.wait -= dt
        e.input.mx = 0
        e.input.mz = 0
        continue
      }
      const dx = b.tx - s.x
      const dz = b.tz - s.z
      const d = Math.hypot(dx, dz)
      const progressed = Math.hypot(s.x - b.lastX, s.z - b.lastZ)
      b.stuck = progressed < 0.02 ? b.stuck + dt : 0
      b.lastX = s.x
      b.lastZ = s.z
      if (d < 0.8 || b.stuck > 1.2) {
        const t = randomPoint()
        b.tx = t.x
        b.tz = t.z
        b.wait = 1 + r() * 5
        b.run = r() < 0.15
        b.stuck = 0
        e.input.mx = 0
        e.input.mz = 0
        continue
      }
      e.input.mx = dx / d
      e.input.mz = dz / d
      e.input.run = b.run
    }
  }
}
