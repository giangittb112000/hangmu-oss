import type { MoveRec } from '../../net/protocol'
import { makeAnim, type AnimState } from './avatarRig'
import { MAX_PLAYERS } from './constants'
import { copyState, makeState, NO_INPUT, type MoveInput, type PlayerState } from './movement'

export type PlayerEntry = {
  id: string
  prev: PlayerState
  curr: PlayerState
  input: MoveInput
  skin: number
  isLocal: boolean
  name: string
  number: number | null
  bot: boolean
  blendX: number
  blendZ: number
  drawX: number
  drawY: number
  drawZ: number
  anim: AnimState
  remote: { tick: number; queue: MoveRec[] } | null
}

const SKINS = [0xf1c7a3, 0xe0ac85, 0xc68e64, 0x9c6b47, 0x6f4a32, 0xf5d5b8]

export class PlayerStore {
  readonly players = new Map<string, PlayerEntry>()
  localId: string | null = null
  version = 0

  get size() {
    return this.players.size
  }

  add(
    id: string,
    x: number,
    z: number,
    heading = 0,
    isLocal = false,
    name = '',
    remoteTick: number | null = null,
    number: number | null = null,
  ): PlayerEntry | null {
    if (this.players.size >= MAX_PLAYERS && !this.players.has(id)) return null
    const curr = makeState(x, z, heading)
    const prev = makeState(x, z, heading)
    copyState(prev, curr)
    const h = Math.abs(hash(id))
    const skin = SKINS[h % SKINS.length]!
    const entry: PlayerEntry = {
      id,
      prev,
      curr,
      input: { ...NO_INPUT },
      skin,
      isLocal,
      name,
      number,
      bot: false,
      blendX: 0,
      blendZ: 0,
      drawX: x,
      drawY: 0,
      drawZ: z,
      anim: makeAnim(((h >>> 3) % 997) / 997),
      remote: remoteTick === null ? null : { tick: Math.round(remoteTick) & 0xffff, queue: [] },
    }
    this.players.set(id, entry)
    if (isLocal) this.localId = id
    this.version++
    return entry
  }

  remove(id: string) {
    if (this.players.delete(id)) this.version++
    if (this.localId === id) this.localId = null
  }

  applyRemote(id: string, s: PlayerState, input: MoveInput, snap = 2) {
    const e = this.players.get(id)
    if (!e || e.isLocal) return
    const bx = e.curr.x + e.blendX - s.x
    const bz = e.curr.z + e.blendZ - s.z
    const far = Math.hypot(bx, bz) > snap
    e.blendX = far ? 0 : bx
    e.blendZ = far ? 0 : bz
    copyState(e.curr, s)
    e.input.mx = input.mx
    e.input.mz = input.mz
    e.input.run = false
  }

  correctPosition(id: string, x: number, z: number, y: number, snap = 6) {
    const e = this.players.get(id)
    if (!e) return
    const dx = x - e.curr.x
    const dz = z - e.curr.z
    const bx = e.blendX - dx
    const bz = e.blendZ - dz
    const far = Math.hypot(bx, bz) > snap
    e.blendX = far ? 0 : bx
    e.blendZ = far ? 0 : bz
    for (const st of [e.curr, e.prev]) {
      st.x += dx
      st.z += dz
      st.y = y
    }
  }

  decayBlend(dt: number) {
    const k = Math.exp(-dt / 0.25)
    for (const e of this.players.values()) {
      if (e.blendX === 0 && e.blendZ === 0) continue
      e.blendX *= k
      e.blendZ *= k
      if (Math.abs(e.blendX) < 0.001 && Math.abs(e.blendZ) < 0.001) {
        e.blendX = 0
        e.blendZ = 0
      }
    }
  }

  setInput(id: string, mx: number, mz: number, run: boolean) {
    const e = this.players.get(id)
    if (!e) return
    e.input.mx = mx
    e.input.mz = mz
    e.input.run = run
  }

  get local(): PlayerEntry | undefined {
    return this.localId ? this.players.get(this.localId) : undefined
  }
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
