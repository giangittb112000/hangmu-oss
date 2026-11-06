import { useEffect, useMemo, useRef, useState } from 'react'
import { rage } from '../rage/rageState'
import { NEAR_DIST, nearestSlot, viewFor } from '../rage/geometry'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { loadClubLogo } from '../../world/clubLogo'
import { useQuality } from '../../world/useQuality'
import { behindBoard, groundY } from '../collision'
import { CAVE, domeY, SPAWN } from '../dimensions'
import {
  createArmTexture,
  createAvatarGeometries,
  createBodyTexture,
  createFaceTexture,
  createLegTexture,
  createLimbMaterial,
  BOT_STRIPE_WHITE,
  SHIRT_RED,
} from './avatarAssets'
import {
  AVATAR_TOP,
  avatarMatrices,
  computePose,
  HIT_ANIM_MS,
  makeAvatarMatrices,
  makePose,
  PUNCH_ANIM_MS,
} from './avatarRig'
import { createBots, readBotCount } from './bots'
import { CAMERA_DISTANCE, CAMERA_LOOK_HEIGHT, MAX_PLAYERS, SIM_DT } from './constants'
import { useControls } from './controls'
import { copyState, lerpState, makeState, stepPlayer } from './movement'
import type { PlayerEntry, PlayerStore } from './store'
import { nameTagTexture } from './nameTagTexture'
import { chatBubbleTexture, keepBubbleTextures } from './chatBubbleTexture'
import { net } from '../../net/NetClient'
import { dqDir, qDir } from '../../net/protocol'
import { stepRemote, syncRemote } from '../../net/remoteSync'
import { prefersReducedMotion } from '../../world/quality'
import { celebration } from '../celebration'
import {
  createJerseyAtlas,
  createNumberMaterial,
  createNumberPatch,
  flushNumberCells,
  setNumberCell,
} from './jerseyNumbers'
import {
  findPunchTarget,
  PUNCH_COOLDOWN_MS,
  PUNCH_HALF_ANGLE,
  PUNCH_NEAR,
  PUNCH_REACH,
  punchAim,
} from './punchAim'
import { findTalkTarget, talkAim } from './talkAim'
import { talk } from '../../net/talk'

const GROUND_LIFT = 0.1
const MAX_STEPS = 4
const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

const TAG_COUNT = 20
const TAG_PICK_MS = 250
const TAG_HEIGHT = 0.042
const TAG_Y = AVATAR_TOP + 0.35
const BUBBLE_COUNT = 8
const BUBBLE_RANGE = 28
const TALKING_ICON = '💬'
const BUBBLE_LIFT = TAG_HEIGHT * 0.62
const STAR_SETS = 2
const SHAKE_M = 0.12
const SHAKE_MS = 180

type Pick = { d: number; e: PlayerEntry; text: string }

function pooled(pool: Pick[], i: number, d: number, e: PlayerEntry, text = ''): Pick {
  const p = (pool[i] ??= { d, e, text })
  p.d = d
  p.e = e
  p.text = text
  return p
}

export function Players() {
  const quality = useQuality()
  const { rig, stick, keyboard } = useControls()

  const botCount = useMemo(() => readBotCount(), [])

  const geos = useMemo(() => createAvatarGeometries(!quality.pbr), [quality.pbr])
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])

  type Textures = {
    body: THREE.Texture
    face: THREE.Texture
    numbers: THREE.Texture
    arm: THREE.Texture
    leg: THREE.Texture
  }
  const [textures, setTextures] = useState<Textures>()
  useEffect(() => {
    let alive = true
    let made: Textures | undefined
    void Promise.all([loadClubLogo(), createJerseyAtlas()]).then(([logo, numbers]) => {
      if (!alive) {
        numbers.dispose()
        return
      }
      made = {
        body: createBodyTexture(logo),
        face: createFaceTexture(),
        numbers,
        arm: createArmTexture(),
        leg: createLegTexture(),
      }
      setTextures(made)
    })
    return () => {
      alive = false
      made?.body.dispose()
      made?.face.dispose()
      made?.numbers.dispose()
      made?.arm.dispose()
      made?.leg.dispose()
    }
  }, [])

  const limbMats = useMemo(
    () =>
      textures
        ? {
            arm: createLimbMaterial(textures.arm, quality.pbr),
            leg: createLimbMaterial(textures.leg, quality.pbr),
          }
        : null,
    [textures, quality.pbr],
  )
  useEffect(
    () => () => {
      limbMats?.arm.dispose()
      limbMats?.leg.dispose()
    },
    [limbMats],
  )

  const bodyMat = useMemo(
    () => (textures ? createLimbMaterial(textures.body, quality.pbr, 1) : null),
    [textures, quality.pbr],
  )
  useEffect(() => () => bodyMat?.dispose(), [bodyMat])

  const numberGeo = useMemo(() => createNumberPatch(MAX_PLAYERS, !quality.pbr), [quality.pbr])
  useEffect(() => () => numberGeo.dispose(), [numberGeo])
  const numberMat = useMemo(
    () => (textures ? createNumberMaterial(textures.numbers, quality.pbr) : null),
    [textures, quality.pbr],
  )
  useEffect(() => () => numberMat?.dispose(), [numberMat])

  const bodies = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const numbers = useRef<THREE.InstancedMesh>(null)
  const arms = useRef<THREE.InstancedMesh>(null)
  const legs = useRef<THREE.InstancedMesh>(null)
  const stars = useRef<THREE.InstancedMesh>(null)
  const marker = useRef<THREE.Mesh>(null)
  const punchZone = useRef<THREE.Group>(null)
  const zoneFill = useRef<THREE.MeshBasicMaterial>(null)
  const zoneEdge = useRef<THREE.MeshBasicMaterial>(null)
  const aimRing = useRef<THREE.Mesh>(null)
  const zoneGeo = useMemo(() => {
    const start = -Math.PI / 2 - PUNCH_HALF_ANGLE
    const len = PUNCH_HALF_ANGLE * 2
    return {
      fill: new THREE.CircleGeometry(PUNCH_REACH, 24, start, len).rotateX(-Math.PI / 2),
      edge: new THREE.RingGeometry(PUNCH_REACH - 0.07, PUNCH_REACH, 24, 1, start, len).rotateX(
        -Math.PI / 2,
      ),
      near: new THREE.RingGeometry(PUNCH_NEAR - 0.05, PUNCH_NEAR, 32).rotateX(-Math.PI / 2),
    }
  }, [])
  useEffect(() => () => Object.values(zoneGeo).forEach((g) => g.dispose()), [zoneGeo])
  useEffect(
    () => () => {
      punchAim.set(null)
      talkAim.set(null)
    },
    [],
  )
  const tagSprites = useRef<(THREE.Sprite | null)[]>([])
  const bubbleSprites = useRef<(THREE.Sprite | null)[]>([])

  const sim = useRef({
    acc: 0,
    view: makeState(SPAWN.x, SPAWN.z),
    desired: new THREE.Vector3(),
    look: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    p: new THREE.Vector3(),
    one: new THREE.Vector3(1, 1, 1),
    pose: makePose(),
    mats: makeAvatarMatrices(),
    hidden: new THREE.Matrix4().makeScale(0, 0, 0),
    starQ: new THREE.Quaternion(),
    p2: new THREE.Vector3(),
    one2: new THREE.Vector3(),
    colorArms: null as THREE.InstancedMesh | null,
    colorLegs: null as THREE.InstancedMesh | null,
    colorBodies: null as THREE.InstancedMesh | null,
    bodyColor: new THREE.Color(),
    zoneIdle: new THREE.Color('#fff2e0'),
    zoneHot: new THREE.Color('#ff3a24'),
    zero: new THREE.Vector3(0, 0, 0),
    cellGeo: null as THREE.BufferGeometry | null,
    up: new THREE.Vector3(0, 1, 0),
    color: new THREE.Color(),
    lastVersion: -1,
    dirTmp: { mx: 0, mz: 0 },
    botsFor: null as PlayerStore | null,
    think: null as ((dt: number) => void) | null,
    tagOf: new Map<string, number>(),
    tagNames: [] as string[],
    lastTagPick: -Infinity,
    pickBuf: [] as Pick[],
    pickPool: [] as Pick[],
    bubbleOf: new Map<string, number>(),
    bubbleTexts: [] as string[],
    rageCam: new THREE.Vector3(),
    rageLook: new THREE.Vector3(),
    rageTgt: new THREE.Vector3(),
    rageLookTgt: new THREE.Vector3(),
    wasRage: false,
    bubbleBuf: [] as Pick[],
    bubblePool: [] as Pick[],
  })

  useFrame(({ camera, clock }, rawDt) => {
    const S = sim.current
    const store = net.store
    const local = store?.local
    if (!store || !local) return
    if (rage.active || talk.overlay) rig.setEdge(0)
    else rig.tick(Math.min(rawDt, 0.1))
    if (S.botsFor !== store) {
      S.botsFor = store
      S.lastVersion = -1
      S.think = botCount > 0 ? createBots(store, botCount) : null
    }
    const think = S.think

    const k = keyboard.read()
    const inRage = rage.active
    const still = inRage || talk.frozen
    let f = still ? 0 : k.forward
    let r = still ? 0 : k.right
    if (f === 0 && r === 0 && !still) {
      f = stick.y
      r = stick.x
    }
    const sy = Math.sin(rig.yaw)
    const cy = Math.cos(rig.yaw)
    const dir = qDir(cy * r - sy * f, -sy * r - cy * f)
    dqDir(dir, S.dirTmp)
    store.setInput(local.id, S.dirTmp.mx, S.dirTmp.mz, false)

    S.acc += Math.min(rawDt, 0.25)
    let steps = 0
    while (S.acc >= SIM_DT && steps < MAX_STEPS) {
      think?.(SIM_DT)
      for (const e of store.players.values()) {
        copyState(e.prev, e.curr)
        if (e.remote) stepRemote(store, e)
        else stepPlayer(e.curr, e.input)
      }
      S.acc -= SIM_DT
      steps++
    }
    const renderTick = net.renderTick()
    for (const e of store.players.values()) if (e.remote) syncRemote(store, e, renderTick)
    if (steps === MAX_STEPS) S.acc = 0
    const alpha = S.acc / SIM_DT
    net.reportLocal(local.curr, dir)
    const ns = nearestSlot(local.curr.x, local.curr.z)
    rage.setNear(ns.dist < NEAR_DIST, ns.slot)
    store.decayBlend(Math.min(rawDt, 0.1))
    if (DEBUG) {
      const c = local.curr
      const others: { name: string; x: number; z: number }[] = []
      for (const e of store.players.values()) {
        if (!e.isLocal && others.length < 5) {
          others.push({
            name: e.name,
            x: +(e.curr.x + e.blendX).toFixed(3),
            z: +(e.curr.z + e.blendZ).toFixed(3),
          })
        }
      }
      ;(window as unknown as { __hangmu?: object }).__hangmu = {
        x: +c.x.toFixed(3),
        z: +c.z.toFixed(3),
        yaw: +rig.yaw.toFixed(3),
        pitch: +rig.pitch.toFixed(3),
        players: store.size,
        others,
        renderDelayTicks: net.renderDelayTicks,
      }
    }

    const nowMs = clock.elapsedTime * 1000
    const pickNow = nowMs - S.lastTagPick >= TAG_PICK_MS
    if (pickNow) {
      S.lastTagPick = nowMs
      const buf = S.pickBuf
      buf.length = 0
      for (const e of store.players.values()) {
        if (e.isLocal || !e.name) continue
        buf.push(
          pooled(
            S.pickPool,
            buf.length,
            (e.curr.x - local.curr.x) ** 2 + (e.curr.z - local.curr.z) ** 2,
            e,
          ),
        )
      }
      buf.sort((a, b) => a.d - b.d)
      S.tagOf.clear()
      for (let k = 0; k < TAG_COUNT; k++) {
        const sp = tagSprites.current[k]
        const e = buf[k]?.e
        if (!sp) continue
        if (!e) {
          sp.visible = false
          continue
        }
        S.tagOf.set(e.id, k)
        const tagKey = `${e.number ?? ''}|${e.name}`
        if (S.tagNames[k] !== tagKey) {
          S.tagNames[k] = tagKey
          const { tex, aspect } = nameTagTexture(e.name, e.number)
          const mat = sp.material as THREE.SpriteMaterial
          mat.map = tex
          mat.needsUpdate = true
          sp.scale.set(TAG_HEIGHT * aspect, TAG_HEIGHT, 1)
        }
        sp.visible = true
      }
    }

    if (pickNow) {
      const buf = S.bubbleBuf
      buf.length = 0
      const now = performance.now()
      for (const [index, b] of net.chat.bubbles) {
        if (b.until <= now) {
          net.chat.bubbles.delete(index)
          continue
        }
        const e = store.players.get(String(index))
        if (!e) continue
        const d = (e.curr.x - local.curr.x) ** 2 + (e.curr.z - local.curr.z) ** 2
        if (d <= BUBBLE_RANGE * BUBBLE_RANGE)
          buf.push(pooled(S.bubblePool, buf.length, d, e, b.text))
      }
      for (const index of talk.talking) {
        if (net.chat.bubbles.has(index)) continue
        const e = store.players.get(String(index))
        if (!e) continue
        const d = (e.curr.x - local.curr.x) ** 2 + (e.curr.z - local.curr.z) ** 2
        if (d <= BUBBLE_RANGE * BUBBLE_RANGE)
          buf.push(pooled(S.bubblePool, buf.length, d, e, TALKING_ICON))
      }
      buf.sort((a, b) => a.d - b.d)
      S.bubbleOf.clear()
      for (let k = 0; k < BUBBLE_COUNT; k++) {
        const sp = bubbleSprites.current[k]
        const pick = buf[k]
        if (!sp) continue
        if (!pick) {
          sp.visible = false
          S.bubbleTexts[k] = ''
          continue
        }
        S.bubbleOf.set(pick.e.id, k)
        const key = pick.e.isLocal ? `\u0000${pick.text}` : pick.text
        if (S.bubbleTexts[k] !== key) {
          S.bubbleTexts[k] = key
          const { tex, aspect, heightUnits } = chatBubbleTexture(pick.text)
          const mat = sp.material as THREE.SpriteMaterial
          mat.map = tex
          mat.needsUpdate = true
          const h = TAG_HEIGHT * heightUnits
          sp.scale.set(h * aspect, h, 1)
          sp.center.set(0.5, pick.e.isLocal ? 0 : -BUBBLE_LIFT / h)
        }
        sp.visible = true
      }
      keepBubbleTextures(buf, BUBBLE_COUNT)
    }

    const colorsDirty = S.lastVersion !== store.version
    const cellsDirty = colorsDirty || S.cellGeo !== numberGeo
    const cells = numberGeo.attributes.aCell as THREE.InstancedBufferAttribute
    const t = clock.elapsedTime
    const animDt = Math.min(rawDt, 0.1)
    const nowPerf = performance.now()
    const motion = !prefersReducedMotion()
    const limbColorsDirty =
      colorsDirty ||
      S.colorArms !== arms.current ||
      S.colorLegs !== legs.current ||
      S.colorBodies !== bodies.current
    const aim = talk.overlay ? null : findPunchTarget(store, local, talk.talking)
    punchAim.set(aim)
    talkAim.set(talk.overlay || inRage ? null : findTalkTarget(store, local, talk.talking))
    if (aimRing.current) aimRing.current.visible = aim != null
    const party = motion ? celebration.level() : 0
    let i = 0
    let starSets = 0
    for (const e of store.players.values()) {
      lerpState(S.view, e.prev, e.curr, alpha)
      const v = S.view
      v.x += e.blendX
      v.z += e.blendZ
      e.drawX = v.x
      e.drawY = v.y
      e.drawZ = v.z
      const punchK = e.isLocal
        ? (nowPerf - net.punchAnimAt) / PUNCH_ANIM_MS
        : e.id === net.punchedById
          ? (nowPerf - net.punchedAt) / PUNCH_ANIM_MS
          : -1
      const hitK = e.isLocal
        ? (nowPerf - net.punchedAt) / HIT_ANIM_MS
        : e.id === net.punchHitId
          ? (nowPerf - net.punchHitAt) / HIT_ANIM_MS
          : -1
      const pose = S.pose
      computePose(pose, e.anim, Math.hypot(v.vx, v.vz), animDt, t, party, punchK, hitK, motion)
      const M = S.mats
      avatarMatrices(pose, v.x, v.y, v.z, v.heading, M)
      const hide = inRage && e.isLocal
      const H = S.hidden
      bodies.current?.setMatrixAt(i, hide ? H : M.body)
      numbers.current?.setMatrixAt(i, e.number == null || hide ? H : M.body)
      if (cellsDirty) setNumberCell(cells, i, e.number)
      heads.current?.setMatrixAt(i, hide ? H : M.head)
      arms.current?.setMatrixAt(i * 2, hide ? H : M.limbs[0])
      arms.current?.setMatrixAt(i * 2 + 1, hide ? H : M.limbs[1])
      legs.current?.setMatrixAt(i * 2, hide ? H : M.limbs[2])
      legs.current?.setMatrixAt(i * 2 + 1, hide ? H : M.limbs[3])
      S.q.setFromAxisAngle(S.up, v.heading)
      const scale = hide ? S.zero : S.one
      shadows.current?.setMatrixAt(i, S.m.compose(S.p.set(v.x, v.y + GROUND_LIFT, v.z), S.q, scale))
      if (colorsDirty || limbColorsDirty) {
        S.color.setHex(e.skin)
        if (colorsDirty) heads.current?.setColorAt(i, S.color)
        if (limbColorsDirty) {
          if (bodyMat)
            bodies.current?.setColorAt(i, S.bodyColor.setHex(e.bot ? BOT_STRIPE_WHITE : SHIRT_RED))
          arms.current?.setColorAt(i * 2, S.color)
          arms.current?.setColorAt(i * 2 + 1, S.color)
          legs.current?.setColorAt(i * 2, S.color)
          legs.current?.setColorAt(i * 2 + 1, S.color)
        }
      }
      if (pose.stars > 0.01 && !hide && stars.current && starSets < STAR_SETS) {
        S.p.setFromMatrixPosition(M.head)
        S.one2.setScalar(pose.stars)
        for (let k = 0; k < 3; k++) {
          const a = t * 9 + (k * Math.PI * 2) / 3
          S.starQ.setFromAxisAngle(S.up, t * 6)
          S.m.compose(
            S.p2.set(
              S.p.x + Math.cos(a) * 0.34,
              S.p.y + 0.3 + Math.sin(a * 2) * 0.03,
              S.p.z + Math.sin(a) * 0.34,
            ),
            S.starQ,
            S.one2,
          )
          stars.current.setMatrixAt(starSets * 3 + k, S.m)
        }
        starSets++
      }
      const yOff = hide ? -100 : 0
      const lift = pose.bob + pose.hop
      const slot = S.tagOf.get(e.id)
      if (slot !== undefined)
        tagSprites.current[slot]?.position.set(v.x, v.y + TAG_Y + lift + yOff, v.z)
      const bslot = S.bubbleOf.get(e.id)
      if (bslot !== undefined)
        bubbleSprites.current[bslot]?.position.set(v.x, v.y + TAG_Y + lift + yOff, v.z)
      if (e.isLocal && marker.current)
        marker.current.position.set(v.x, v.y + GROUND_LIFT + 0.005 + yOff, v.z)
      if (e.isLocal && punchZone.current) {
        punchZone.current.position.set(v.x, v.y + GROUND_LIFT + 0.003 + yOff, v.z)
        punchZone.current.rotation.y = v.heading
      }
      if (e === aim && aimRing.current)
        aimRing.current.position.set(v.x, v.y + GROUND_LIFT + 0.006, v.z)
      i++
    }
    if (cellsDirty) {
      flushNumberCells(cells)
      S.cellGeo = numberGeo
    }
    for (const mesh of [bodies.current, heads.current, shadows.current, numbers.current]) {
      if (!mesh) continue
      mesh.count = i
      mesh.instanceMatrix.needsUpdate = true
    }
    for (const mesh of [arms.current, legs.current]) {
      if (!mesh) continue
      mesh.count = i * 2
      mesh.instanceMatrix.needsUpdate = true
      if (limbColorsDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (limbColorsDirty) {
      if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true
      S.colorBodies = bodies.current
      S.colorArms = arms.current
      S.colorLegs = legs.current
    }
    if (stars.current) {
      stars.current.count = starSets * 3
      stars.current.instanceMatrix.needsUpdate = true
    }
    if (colorsDirty && heads.current?.instanceColor) {
      heads.current.instanceColor.needsUpdate = true
      S.lastVersion = store.version
    }

    const cooling = performance.now() - net.punchAnimAt < PUNCH_COOLDOWN_MS
    if (zoneFill.current && zoneEdge.current) {
      const hot = aim != null && !cooling
      zoneFill.current.color.copy(hot ? S.zoneHot : S.zoneIdle)
      zoneEdge.current.color.copy(hot ? S.zoneHot : S.zoneIdle)
      zoneFill.current.opacity = cooling ? 0.04 : hot ? 0.26 : 0.12
      zoneEdge.current.opacity = cooling ? 0.18 : hot ? 0.95 : 0.6
    }

    if (inRage) {
      viewFor(rage.getSnapshot().slot, S.rageTgt, S.rageLookTgt)
      if (!S.wasRage) {
        S.rageCam.copy(camera.position)
        S.rageLook.copy(S.look)
      }
      const k = 1 - Math.exp(-6 * Math.min(rawDt, 0.1))
      S.rageCam.lerp(S.rageTgt, k)
      S.rageLook.lerp(S.rageLookTgt, k)
      camera.position.copy(S.rageCam)
      camera.lookAt(S.rageLook)
      S.wasRage = true
      return
    }
    S.wasRage = false
    lerpState(S.view, local.prev, local.curr, alpha)
    const v = S.view
    v.x += local.blendX
    v.z += local.blendZ
    const horiz = Math.cos(rig.pitch) * CAMERA_DISTANCE
    S.desired.set(
      v.x + Math.sin(rig.yaw) * horiz,
      v.y + CAMERA_LOOK_HEIGHT + Math.sin(rig.pitch) * CAMERA_DISTANCE,
      v.z + Math.cos(rig.yaw) * horiz,
    )
    const lx = v.x
    const ly = v.y + CAMERA_LOOK_HEIGHT
    const lz = v.z
    const fits = (x: number, y: number, z: number) => {
      const r = Math.hypot(x, z)
      return (
        r <= CAVE.radius - 2.5 &&
        y <= domeY(r) - 1.5 &&
        y >= groundY(x, z) + 0.8 &&
        !behindBoard(x, y, z)
      )
    }
    if (!fits(S.desired.x, S.desired.y, S.desired.z)) {
      let lo = 0
      let hi = 1
      for (let it = 0; it < 12; it++) {
        const mid = (lo + hi) / 2
        const x = lx + (S.desired.x - lx) * mid
        const y = ly + (S.desired.y - ly) * mid
        const z = lz + (S.desired.z - lz) * mid
        if (fits(x, y, z)) lo = mid
        else hi = mid
      }
      S.desired.set(
        lx + (S.desired.x - lx) * lo,
        ly + (S.desired.y - ly) * lo,
        lz + (S.desired.z - lz) * lo,
      )
    }
    S.look.set(v.x, v.y + CAMERA_LOOK_HEIGHT, v.z)
    camera.position.copy(S.desired)
    const since = performance.now() - net.punchHitAt
    if (since < SHAKE_MS && !prefersReducedMotion()) {
      const a = 1 - since / SHAKE_MS
      S.look.x += Math.sin(since * 0.9) * SHAKE_M * a
      S.look.y += Math.cos(since * 1.3) * SHAKE_M * a
    }
    camera.lookAt(S.look)
  })

  const Mat = quality.pbr ? 'meshStandardMaterial' : 'meshLambertMaterial'

  return (
    <group>
      {bodyMat ? (
        <instancedMesh
          key="body-tex"
          ref={bodies}
          args={[geos.body, bodyMat, MAX_PLAYERS]}
          frustumCulled={false}
        />
      ) : (
        <instancedMesh
          key="body-plain"
          ref={bodies}
          args={[geos.body, undefined, MAX_PLAYERS]}
          frustumCulled={false}
        >
          <Mat color="#da291c" />
        </instancedMesh>
      )}
      <instancedMesh ref={heads} args={[geos.head, undefined, MAX_PLAYERS]} frustumCulled={false}>
        <Mat key={textures ? 'h1' : 'h0'} map={textures?.face ?? null} />
      </instancedMesh>
      {limbMats && (
        <>
          <instancedMesh
            ref={arms}
            args={[geos.arm, limbMats.arm, MAX_PLAYERS * 2]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={legs}
            args={[geos.leg, limbMats.leg, MAX_PLAYERS * 2]}
            frustumCulled={false}
          />
        </>
      )}
      <instancedMesh ref={stars} args={[geos.star, undefined, STAR_SETS * 3]} frustumCulled={false}>
        <meshBasicMaterial color="#f2c14e" toneMapped={false} />
      </instancedMesh>
      {numberMat && (
        <instancedMesh
          ref={numbers}
          args={[numberGeo, numberMat, MAX_PLAYERS]}
          frustumCulled={false}
        />
      )}
      <instancedMesh
        ref={shadows}
        args={[geos.shadow, undefined, MAX_PLAYERS]}
        frustumCulled={false}
      >
        <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
      </instancedMesh>
      {Array.from({ length: TAG_COUNT }, (_, k) => (
        <sprite
          key={k}
          visible={false}
          ref={(el) => {
            tagSprites.current[k] = el
          }}
        >
          <spriteMaterial
            transparent
            depthWrite={false}
            toneMapped={false}
            sizeAttenuation={false}
          />
        </sprite>
      ))}
      {Array.from({ length: BUBBLE_COUNT }, (_, k) => (
        <sprite
          key={`b${k}`}
          visible={false}
          renderOrder={2}
          ref={(el) => {
            bubbleSprites.current[k] = el
          }}
        >
          <spriteMaterial
            transparent
            depthWrite={false}
            toneMapped={false}
            sizeAttenuation={false}
          />
        </sprite>
      ))}
      <group ref={punchZone}>
        <mesh geometry={zoneGeo.fill} renderOrder={1}>
          <meshBasicMaterial
            ref={zoneFill}
            transparent
            opacity={0.12}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={zoneGeo.edge} renderOrder={1}>
          <meshBasicMaterial
            ref={zoneEdge}
            transparent
            opacity={0.6}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={zoneGeo.near} renderOrder={1}>
          <meshBasicMaterial
            color="#fff2e0"
            transparent
            opacity={0.3}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <mesh ref={aimRing} rotation-x={-Math.PI / 2} visible={false} renderOrder={1}>
        <ringGeometry args={[0.5, 0.64, 28]} />
        <meshBasicMaterial
          color="#ff3a24"
          transparent
          opacity={0.9}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={marker} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.45, 0.56, 28]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  )
}
