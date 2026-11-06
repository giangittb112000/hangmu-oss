import { useMemo } from 'react'
import * as THREE from 'three'
import { noise3, rng, rockify } from '../world/rock'
import { RockMaterial } from '../world/RockMaterial'
import { useQuality } from '../world/useQuality'
import { ARENA_RADIUS, CAVE, CAVE_ROCK, domeY, PORTRAIT_ANGLES, tierY } from './dimensions'

function useDome([segW, segH]: [number, number]) {
  return useMemo(() => {
    const R = CAVE.radius
    const sphere = new THREE.SphereGeometry(R, segW, segH, 0, Math.PI * 2, 0, Math.PI / 2 + 0.1)
    const src = sphere.toNonIndexed()
    sphere.dispose()

    const scaleY = CAVE.height / R
    const HOLE_HALF_W = 7.5
    const HOLE_H = 7.6
    const p = src.attributes.position as THREE.BufferAttribute
    const kept: number[] = []
    for (let t = 0; t < p.count; t += 3) {
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3
      const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3
      const wy = cy * scaleY
      const inHole = cz > 0 && (cx / HOLE_HALF_W) ** 2 + (wy / HOLE_H) ** 2 < 1
      if (inHole) continue
      for (let k = 0; k < 3; k++) kept.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k))
    }
    src.dispose()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3))
    rockify(geo, { amp: 2.4, freq: 0.1, seed: 5, strata: 0.85, streaks: 0.55, ...CAVE_ROCK })
    geo.scale(1, CAVE.height / R, 1)
    geo.computeVertexNormals()
    return geo
  }, [segW, segH])
}

function useArena() {
  return useMemo(() => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, -CAVE.pitDepth)]
    for (let i = 1; i <= CAVE.tiers; i++) {
      const r = CAVE.pitRadius + (i - 1) * CAVE.tierWidth
      pts.push(new THREE.Vector2(r, tierY(i - 1)))
      pts.push(new THREE.Vector2(r + 0.05, tierY(i)))
    }
    pts.push(new THREE.Vector2(ARENA_RADIUS, 0))
    const geo = new THREE.LatheGeometry(pts, 72)
    return rockify(geo, {
      amp: 0.08,
      freq: 0.8,
      seed: 12,
      streaks: 0.15,
      base: '#7b7164',
      shade: '#5e564c',
      dark: '#2a2520',
      warm: '#85725e',
    })
  }, [])
}

function useFloor() {
  return useMemo(() => {
    const geo = new THREE.RingGeometry(ARENA_RADIUS, CAVE.radius + 3, 120, 10)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const edge = THREE.MathUtils.smoothstep(r, ARENA_RADIUS + 0.5, ARENA_RADIUS + 2)
      pos.setY(i, noise3(x * 0.25, 0, z * 0.25, 8) * 0.04 * edge)
    }
    return rockify(geo, {
      amp: 0.03,
      freq: 0.7,
      seed: 14,
      streaks: 0,
      base: '#76695a',
      shade: '#564c42',
      dark: '#2a2520',
      warm: '#847058',
    })
  }, [])
}

function useSpeleothems() {
  return useMemo(() => {
    const r = rng(99)
    const stalactites: THREE.Matrix4[] = []
    const stalagmites: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    const s = new THREE.Vector3()
    const v = new THREE.Vector3()

    for (let i = 0; i < 200; i++) {
      const a = r() * Math.PI * 2
      const rad = 4 + Math.sqrt(r()) * (CAVE.radius - 8)
      const len = 0.8 + r() * r() * 4.5
      const w = 0.25 + r() * 0.5
      const y = domeY(rad) - 0.6
      v.set(Math.sin(a) * rad, y - len / 2, Math.cos(a) * rad)
      q.copy(flip)
      s.set(w, len, w)
      stalactites.push(m.compose(v, q, s).clone())
    }
    for (let i = 0; i < 110; i++) {
      const a = r() * Math.PI * 2
      const wa = Math.atan2(Math.sin(a), Math.cos(a))
      const blocked =
        Math.abs(wa) < CAVE.entranceHalfAngle + 0.12 ||
        Math.abs(wa) > Math.PI - 0.3 ||
        PORTRAIT_ANGLES.some((p) => Math.abs(Math.atan2(Math.sin(a - p), Math.cos(a - p))) < 0.09)
      if (blocked) continue
      const rad = CAVE.radius - 2 - r() * 2.5
      const len = 0.6 + r() * 2.6
      const w = 0.35 + r() * 0.6
      v.set(Math.sin(a) * rad, len / 2 - 0.1, Math.cos(a) * rad)
      q.identity()
      s.set(w, len, w)
      stalagmites.push(m.compose(v, q, s).clone())
    }

    const cone = rockify(new THREE.ConeGeometry(1, 1, 7, 3), {
      amp: 0.12,
      freq: 2,
      seed: 31,
      streaks: 0.3,
      ...CAVE_ROCK,
    })
    return { cone, stalactites, stalagmites }
  }, [])
}

function Instanced({ geo, mats }: { geo: THREE.BufferGeometry; mats: THREE.Matrix4[] }) {
  return (
    <instancedMesh
      args={[geo, undefined, mats.length]}
      ref={(mesh) => {
        if (!mesh) return
        mats.forEach((mat, i) => mesh.setMatrixAt(i, mat))
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      }}
    >
      <RockMaterial repeat={0} roughness={0.95} />
    </instancedMesh>
  )
}

export function Cavern() {
  const { domeSegments } = useQuality()
  const dome = useDome(domeSegments)
  const arena = useArena()
  const floor = useFloor()
  const { cone, stalactites, stalagmites } = useSpeleothems()

  return (
    <group>
      <mesh geometry={dome}>
        <RockMaterial repeat={10} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={arena}>
        <RockMaterial repeat={10} side={THREE.DoubleSide} roughness={1} />
      </mesh>
      <mesh geometry={floor}>
        <RockMaterial repeat={12} roughness={1} />
      </mesh>
      <Instanced geo={cone} mats={stalactites} />
      <Instanced geo={cone} mats={stalagmites} />
    </group>
  )
}
