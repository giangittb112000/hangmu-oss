import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { prefersReducedMotion } from '../world/quality'
import { useQuality } from '../world/useQuality'
import { celebration } from './celebration'
import { glowTexture } from './glow'

const PALETTE = ['#ff2a1a', '#ff2a1a', '#fff4e6', '#ffd23a'].map((c) => new THREE.Color(c))
const GRAVITY = 5.5
const DRAG = 0.9
const FIRE_UNTIL = 6.2
const BURST_EVERY = 0.32

export function GoalFireworks() {
  const { tier } = useQuality()
  const capacity = tier === 'high' ? 1600 : 600
  const perBurst = tier === 'high' ? 130 : 60

  const points = useRef<THREE.Points>(null)
  const sim = useMemo(() => {
    const pos = new Float32Array(capacity * 3)
    const col = new Float32Array(capacity * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 15, 0), 60)
    return {
      geo,
      pos,
      col,
      vel: new Float32Array(capacity * 3),
      base: new Float32Array(capacity * 3),
      life: new Float32Array(capacity),
      maxLife: new Float32Array(capacity),
      next: 0,
      alive: 0,
      lastBurst: -1,
      runId: -1,
    }
  }, [capacity])
  useEffect(() => () => sim.geo.dispose(), [sim])

  useFrame((_, rawDt) => {
    const p = points.current
    if (!p) return
    const dt = Math.min(rawDt, 0.05)
    const S = sim
    const state = celebration.state
    const t = celebration.elapsed()

    if (state && !prefersReducedMotion()) {
      if (S.runId !== state.id) {
        S.runId = state.id
        S.lastBurst = -BURST_EVERY
      }
      while (t < FIRE_UNTIL && t - S.lastBurst >= BURST_EVERY) {
        S.lastBurst += BURST_EVERY
        burst(S, capacity, perBurst)
      }
    }
    if (S.alive === 0) {
      p.visible = false
      return
    }
    p.visible = true

    let alive = 0
    const drag = Math.pow(DRAG, dt * 10)
    for (let i = 0; i < capacity; i++) {
      if (S.life[i]! <= 0) continue
      const life = (S.life[i]! -= dt)
      const j = i * 3
      if (life <= 0) {
        S.col[j] = S.col[j + 1] = S.col[j + 2] = 0
        continue
      }
      alive++
      S.vel[j]! *= drag
      S.vel[j + 1] = S.vel[j + 1]! * drag - GRAVITY * dt
      S.vel[j + 2]! *= drag
      S.pos[j]! += S.vel[j]! * dt
      S.pos[j + 1]! += S.vel[j + 1]! * dt
      S.pos[j + 2]! += S.vel[j + 2]! * dt
      const k = life / S.maxLife[i]!
      const fade = k * k * (k < 0.35 ? 0.6 + 0.4 * Math.sin(life * 60 + i) : 1)
      S.col[j] = S.base[j]! * fade
      S.col[j + 1] = S.base[j + 1]! * fade
      S.col[j + 2] = S.base[j + 2]! * fade
    }
    S.alive = alive
    S.geo.attributes.position!.needsUpdate = true
    S.geo.attributes.color!.needsUpdate = true
  })

  return (
    <points ref={points} geometry={sim.geo} visible={false} frustumCulled={false}>
      <pointsMaterial
        vertexColors
        map={glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.45)')}
        size={0.8}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </points>
  )
}

type Sim = {
  pos: Float32Array
  col: Float32Array
  vel: Float32Array
  base: Float32Array
  life: Float32Array
  maxLife: Float32Array
  next: number
  alive: number
}

function burst(S: Sim, capacity: number, count: number) {
  const a = Math.random() * Math.PI * 2
  const r = 10 + Math.random() * 14
  const cx = Math.sin(a) * r
  const cz = Math.cos(a) * r
  const cy = 13 + Math.random() * 9
  const c1 = PALETTE[Math.floor(Math.random() * PALETTE.length)]!
  const c2 = Math.random() < 0.5 ? c1 : PALETTE[Math.floor(Math.random() * PALETTE.length)]!
  const speed = 6 + Math.random() * 4
  for (let n = 0; n < count; n++) {
    const i = S.next
    S.next = (S.next + 1) % capacity
    const j = i * 3
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const v = speed * (0.85 + Math.random() * 0.15)
    S.pos[j] = cx
    S.pos[j + 1] = cy
    S.pos[j + 2] = cz
    S.vel[j] = s * Math.cos(th) * v
    S.vel[j + 1] = u * v + 1.5
    S.vel[j + 2] = s * Math.sin(th) * v
    const c = n % 3 === 0 ? c2 : c1
    S.base[j] = c.r * 2.2
    S.base[j + 1] = c.g * 2.2
    S.base[j + 2] = c.b * 2.2
    const life = 1.5 + Math.random() * 0.7
    S.life[i] = life
    S.maxLife[i] = life
  }
  S.alive += count
}
