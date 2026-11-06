import { copyState, makeState, stepPlayer, type MoveInput } from '../cave/players/movement'
import type { PlayerEntry, PlayerStore } from '../cave/players/store'
import { dqDir, dqHeading, type MoveRec } from './protocol'

export function tickDiff(a: number, b: number) {
  const d = (((Math.round(a) - Math.round(b)) % 65536) + 65536) % 65536
  return d >= 32768 ? d - 65536 : d
}

const MAX_FAST_FORWARD = 45
const MAX_QUEUE = 32
const RESYNC_TICKS = 4

const dirTmp = { mx: 0, mz: 0 }

export function enqueueMove(store: PlayerStore, rec: MoveRec) {
  const e = store.players.get(String(rec.index))
  const line = e?.remote
  if (!e || !line) return
  const q = line.queue
  let i = q.length
  while (i > 0 && tickDiff(q[i - 1]!.tick, rec.tick) > 0) i--
  q.splice(i, 0, rec)
  if (q.length > MAX_QUEUE) q.shift()
}

function applyAt(store: PlayerStore, e: PlayerEntry, rec: MoveRec, late: number) {
  dqDir(rec.dir, dirTmp)
  const input: MoveInput = { mx: dirTmp.mx, mz: dirTmp.mz, run: false }
  const s = makeState(rec.x, rec.z, dqHeading(rec.heading))
  s.vx = e.curr.vx
  s.vz = e.curr.vz
  const n = Math.max(0, Math.min(MAX_FAST_FORWARD, late))
  for (let i = 0; i < n; i++) stepPlayer(s, input)
  store.applyRemote(e.id, s, input)
}

export function stepRemote(store: PlayerStore, e: PlayerEntry) {
  const line = e.remote
  if (!line) return
  line.tick = (line.tick + 1) & 0xffff
  stepPlayer(e.curr, e.input)
  const q = line.queue
  while (q.length && tickDiff(line.tick, q[0]!.tick) >= 0) {
    const rec = q.shift()!
    applyAt(store, e, rec, tickDiff(line.tick, rec.tick))
  }
}

export function syncRemote(store: PlayerStore, e: PlayerEntry, renderTick: number) {
  const line = e.remote
  if (!line) return
  const d = tickDiff(renderTick, line.tick)
  if (d > RESYNC_TICKS) {
    const n = Math.min(d, MAX_FAST_FORWARD)
    for (let i = 0; i < n; i++) {
      copyState(e.prev, e.curr)
      stepRemote(store, e)
    }
    line.tick = Math.round(renderTick) & 0xffff
  } else if (d < -RESYNC_TICKS) {
    line.tick = Math.round(renderTick) & 0xffff
  }
}
