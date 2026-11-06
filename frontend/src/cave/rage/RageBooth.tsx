import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { net } from '../../net/NetClient'
import { playSplat } from '../../audio/splat'
import { canvasTexture } from '../../world/canvasTexture'
import { useQuality } from '../../world/useQuality'
import { prefersReducedMotion } from '../../world/quality'
import { groundY } from '../collision'
import {
  aimAt,
  FLOOR_Y,
  hitLocal,
  hitPoint,
  MISS,
  missAt,
  RING_R,
  slotAngle,
  SLOTS,
  slotBase,
  viewFor,
} from './geometry'
import { NICKNAMES, rage, type ThrowEvent } from './rageState'

const SERIF = 'Bitter, Georgia, serif'
const SANS = '"Be Vietnam Pro", system-ui, sans-serif'
const THROW_GAP_MS = 300
const MIN_POWER = 0.2
const SPLATS_PER_SLOT = 12
const FLOOR_SPLATS = 24
const SPLAT_MS = 120_000
const FLYING = 32
const ITEM_COLORS = ['#d4271b', '#2f6fd1', '#f6e7cf', '#f4f1ea'] as const
const SPLAT_COLORS = ['#c8231a', '#000000', '#f3dcc0', '#e9e5dc'] as const

const labelCache = new Map<number, THREE.CanvasTexture>()
function labelTexture(nick: number) {
  const hit = labelCache.get(nick)
  if (hit) return hit
  const n = NICKNAMES[nick] ?? NICKNAMES[0]!
  const tex = canvasTexture(512, 176, (g) => {
    g.fillStyle = '#fff6ec'
    g.beginPath()
    g.roundRect(6, 6, 500, 164, 18)
    g.fill()
    g.lineWidth = 10
    g.strokeStyle = '#fbe122'
    g.stroke()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#2a1712'
    g.font = `800 76px ${SERIF}`
    const w = g.measureText(n.name).width
    const k = Math.min(1, 440 / w)
    g.save()
    g.translate(256, 76)
    g.scale(k, k)
    g.fillText(n.name, 0, 0)
    g.restore()
    g.font = `600 30px ${SANS}`
    g.fillStyle = '#7a5a45'
    g.fillText(n.role, 256, 140)
  })
  labelCache.set(nick, tex)
  return tex
}

type Flying = {
  mesh: THREE.Mesh
  from: THREE.Vector3
  to: THREE.Vector3
  t0: number
  dur: number
  arc: number
  ev: ThrowEvent | null
}

type BoothScene = ReturnType<typeof createScene>
let scene: BoothScene | null = null
const getScene = () => (scene ??= createScene())

function createScene() {
  const itemGeo = [
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.BoxGeometry(0.34, 0.06, 0.13),
    new THREE.CylinderGeometry(0.17, 0.17, 0.14, 14),
    new THREE.IcosahedronGeometry(0.12, 0),
  ]
  const itemMat = ITEM_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }))
  const splatGeo = new THREE.CircleGeometry(0.15, 10)
  const splatMat = SPLAT_COLORS.map(
    (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }),
  )
  const flying: Flying[] = Array.from({ length: FLYING }, () => {
    const mesh = new THREE.Mesh(itemGeo[0], itemMat[0])
    mesh.visible = false
    return {
      mesh,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t0: 0,
      dur: 1,
      arc: 1,
      ev: null,
    }
  })
  const mkSplat = () => {
    const m = new THREE.Mesh(splatGeo, splatMat[0])
    m.visible = false
    m.userData.until = 0
    return m
  }
  return {
    itemGeo,
    itemMat,
    splatMat,
    flying,
    body: Array.from({ length: SLOTS }, () => Array.from({ length: SPLATS_PER_SLOT }, mkSplat)),
    bodyNext: new Array<number>(SLOTS).fill(0),
    floor: Array.from({ length: FLOOR_SPLATS }, mkSplat),
    floorNext: 0,
    wobble: Array.from({ length: SLOTS }, () => ({ a: 0, w: 0 })),
    slotGroups: new Array<THREE.Group | null>(SLOTS).fill(null),
    ray: new THREE.Ray(),
    aimCam: new THREE.PerspectiveCamera(),
    aimPos: new THREE.Vector3(),
    aimLook: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
    miss: new THREE.Vector3(),
    hand: new THREE.Vector3(),
    right: new THREE.Vector3(),
    lastSent: -Infinity,
  }
}

function handOf(S: BoothScene, camera: THREE.Camera, out: THREE.Vector3) {
  S.right.setFromMatrixColumn(camera.matrixWorld, 0)
  return out
    .copy(camera.position)
    .addScaledVector(S.right, 0.45)
    .setY(camera.position.y - 1.1)
}

function launch(S: BoothScene, ev: ThrowEvent, now: number, camera: THREE.Camera) {
  let f = S.flying.find((x) => !x.ev)
  if (!f) {
    f = S.flying.reduce((a, b) => (a.t0 < b.t0 ? a : b))
    land(S, f)
  }
  handOf(S, camera, f.from)
  if (ev.slot === MISS) {
    if (ev.to) f.to.set(ev.to.x, ev.to.y, ev.to.z)
    else {
      S.ray.origin.copy(camera.position)
      camera.getWorldDirection(S.ray.direction)
      missAt(S.ray, f.to)
    }
  } else if (ev.slot >= 0 && ev.slot < SLOTS) hitPoint(ev.slot, ev.u, ev.v, f.to)
  else return
  const dist = f.from.distanceTo(f.to)
  f.dur = Math.min(1.1, Math.max(0.35, dist / 16)) * 1000
  f.arc = 0.4 + dist * 0.12
  f.t0 = now
  f.ev = ev
  f.mesh.geometry = S.itemGeo[ev.item] ?? S.itemGeo[0]!
  f.mesh.material = S.itemMat[ev.item] ?? S.itemMat[0]!
  f.mesh.visible = true
}

function land(S: BoothScene, f: Flying) {
  const ev = f.ev
  f.ev = null
  f.mesh.visible = false
  if (!ev) return
  const now = performance.now()
  if (rage.active) playSplat(ev.item)
  const leaves = ev.item !== 1
  if (ev.slot !== MISS) {
    const w = S.wobble[ev.slot]
    if (w && !prefersReducedMotion()) w.w += (ev.u >= 0 ? -1 : 1) * (1.6 + Math.random())
    if (!leaves) return
    const k = S.bodyNext[ev.slot]!
    S.bodyNext[ev.slot] = (k + 1) % SPLATS_PER_SLOT
    const m = S.body[ev.slot]![k]!
    hitLocal(ev.u, ev.v, m.position)
    m.rotation.set(0, 0, Math.random() * Math.PI)
    const s = ev.item === 3 ? 0.55 : 0.8 + Math.random() * 0.6
    m.scale.set(s, s * (0.7 + Math.random() * 0.5), 1)
    m.material = S.splatMat[ev.item]!
    m.userData.until = now + SPLAT_MS
    m.visible = true
  } else if (leaves) {
    const m = S.floor[S.floorNext]!
    S.floorNext = (S.floorNext + 1) % FLOOR_SPLATS
    m.position.copy(f.to)
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI)
    const s = 1 + Math.random() * 0.8
    m.scale.set(s, s, 1)
    m.material = S.splatMat[ev.item]!
    m.userData.until = now + SPLAT_MS
    m.visible = true
  }
}

function step(S: BoothScene, camera: THREE.Camera, dt: number) {
  const now = performance.now()

  const req = rage.request
  if (req && rage.active) {
    rage.request = null
    const aimCam = S.aimCam
    aimCam.copy(camera as THREE.PerspectiveCamera)
    viewFor(rage.getSnapshot().slot, S.aimPos, S.aimLook)
    aimCam.position.copy(S.aimPos)
    aimCam.lookAt(S.aimLook)
    aimCam.updateMatrixWorld()
    S.ndc.set(req.ndcX, req.ndcY, 0.5).unproject(aimCam)
    S.ray.origin.copy(aimCam.position)
    S.ray.direction.copy(S.ndc).sub(aimCam.position).normalize()
    let aim = aimAt(S.ray, S.miss)
    if (req.power < MIN_POWER) {
      if (aim.slot !== MISS) hitPoint(aim.slot, aim.u, aim.v, S.miss)
      handOf(S, camera, S.hand)
      S.miss.lerpVectors(S.hand, S.miss, 0.3 + 0.4 * (req.power / MIN_POWER))
      aim = { slot: MISS, u: 0, v: 0 }
    }
    if (aim.slot === MISS) S.miss.y = groundY(S.miss.x, S.miss.z) + 0.03
    const item = rage.getSnapshot().item
    const ev: ThrowEvent = {
      by: -1,
      slot: aim.slot,
      item,
      u: aim.u,
      v: aim.v,
      to: aim.slot === MISS ? { x: S.miss.x, y: S.miss.y, z: S.miss.z } : undefined,
    }
    if (now - S.lastSent >= THROW_GAP_MS && net.sendThrow(aim.slot, item, aim.u, aim.v)) {
      S.lastSent = now
      rage.addOwn(ev, true)
    } else {
      rage.addOwn(ev, false)
    }
  }

  while (rage.throws.length) launch(S, rage.throws.shift()!, now, camera)

  for (const f of S.flying) {
    if (!f.ev) continue
    const k = (now - f.t0) / f.dur
    if (k >= 1) {
      land(S, f)
      continue
    }
    f.mesh.position.lerpVectors(f.from, f.to, k)
    f.mesh.position.y += Math.sin(Math.PI * k) * f.arc
    f.mesh.rotation.x += dt * 9
    f.mesh.rotation.z += dt * 6
  }

  for (let k = 0; k < SLOTS; k++) {
    const w = S.wobble[k]!
    w.w += (-30 * w.a - 4.5 * w.w) * dt
    w.a = Math.max(-0.5, Math.min(0.5, w.a + w.w * dt))
    const g = S.slotGroups[k]
    if (g) g.rotation.z = w.a
  }
  for (const list of S.body)
    for (const m of list) if (m.visible && now > m.userData.until) m.visible = false
  for (const m of S.floor) if (m.visible && now > m.userData.until) m.visible = false
}

export function RageBooth() {
  const q = useQuality()
  const snap = useSyncExternalStore(rage.subscribe, rage.getSnapshot)
  const [S] = useState(getScene)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    void Promise.all([
      document.fonts.load(`800 76px ${SERIF}`, 'Bủ Nô PHÒNG XẢ GIẬN'),
      document.fonts.load(`600 30px ${SANS}`, 'tiền vệ'),
    ])
      .catch(() => undefined)
      .then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])

  useFrame(({ camera }, dt) => step(S, camera, Math.min(dt, 0.1)))

  const bases = useMemo(() => Array.from({ length: SLOTS }, (_, k) => slotBase(k)), [])
  const Mat = q.pbr ? 'meshStandardMaterial' : 'meshLambertMaterial'

  return (
    <group>
      <mesh position={[0, FLOOR_Y + 0.02, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[RING_R - 0.06, RING_R + 0.06, 64]} />
        <meshBasicMaterial color="#c8102e" transparent opacity={0.7} />
      </mesh>

      {bases.map((b, k) => (
        <group key={k} position={b} rotation-y={slotAngle(k)}>
          <group
            ref={(g) => {
              S.slotGroups[k] = g
            }}
          >
            <mesh position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 1.1, 6]} />
              <Mat color="#6b4a32" />
            </mesh>
            <mesh position={[0, 1.35, 0]}>
              <capsuleGeometry args={[0.38, 0.75, 4, 10]} />
              <Mat color="#b8102a" />
            </mesh>
            <mesh position={[0, 2.25, 0]}>
              <sphereGeometry args={[0.27, 14, 10]} />
              <Mat color="#c9a27a" />
            </mesh>
            {S.body[k]!.map((m, i) => (
              <primitive key={i} object={m} />
            ))}
          </group>
          {fontsReady && (
            <mesh position={[0, 3.05, 0.05]}>
              <planeGeometry args={[1.9, 0.65]} />
              <meshBasicMaterial map={labelTexture(snap.labels[k] ?? 0)} toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}

      {S.floor.map((m, i) => (
        <primitive key={`f${i}`} object={m} />
      ))}
      {S.flying.map((f, i) => (
        <primitive key={`p${i}`} object={f.mesh} />
      ))}
    </group>
  )
}
