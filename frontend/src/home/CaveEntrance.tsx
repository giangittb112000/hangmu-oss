import { useMemo } from 'react'
import * as THREE from 'three'
import { CaveGlow } from './CaveGlow'
import { noise3, rng, rockify } from '../world/rock'
import { RockMaterial } from '../world/RockMaterial'

const SAND = '#e4d8c3'
const CAVE_DARK = '#15100c'
const MOUTH_X = 1.2

function useGround() {
  return useMemo(() => {
    const geo = new THREE.PlaneGeometry(70, 50, 70, 50)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const sand = new THREE.Color(SAND)
    const shade = new THREE.Color('#c9b99f')
    const dark = new THREE.Color(CAVE_DARK)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const n = noise3(x * 0.35, 0, z * 0.35, 5)
      pos.setY(i, n * 0.12 + Math.max(0, -z - 9) * 0.25)
      c.copy(sand).lerp(shade, (n + 1) * 0.3)
      const inside =
        THREE.MathUtils.smoothstep(-z, 0.2, 4.5) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(x - MOUTH_X), 2.8, 5))
      c.lerp(dark, inside * 0.9)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])
}

function useTunnel() {
  return useMemo(() => {
    const geo = new THREE.CylinderGeometry(4.0, 2.8, 16, 20, 10, true)
    geo.rotateX(Math.PI / 2)
    rockify(geo, { amp: 0.5, freq: 0.5, seed: 11 })
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = geo.attributes.color as THREE.BufferAttribute
    const mouth = new THREE.Color('#2a1f18')
    const mid = new THREE.Color('#0d0806')
    const deep = new THREE.Color('#3d0805')
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((8 - pos.getZ(i)) / 16, 0, 1)
      if (t < 0.45) c.copy(mouth).lerp(mid, t / 0.45)
      else c.copy(mid).lerp(deep, Math.pow((t - 0.45) / 0.55, 1.4))
      const n = noise3(pos.getX(i) * 0.9, pos.getY(i) * 0.9, pos.getZ(i) * 0.9, 41)
      c.multiplyScalar(0.8 + n * 0.25)
      colors.setXYZ(i, c.r, c.g, c.b)
    }
    return geo
  }, [])
}

function useCliff() {
  return useMemo(() => {
    const arch = rockify(new THREE.TorusGeometry(4.7, 2.0, 12, 30, Math.PI), {
      amp: 1.0,
      freq: 0.38,
      seed: 4,
      strata: 2.2,
      streaks: 0.75,
    })

    const r = rng(7)
    const boulders: {
      geo: THREE.BufferGeometry
      pos: [number, number, number]
      scale: [number, number, number]
      rot: number
    }[] = []
    const place = (x: number, y: number, z: number, s: number, sy = 1, detail = 3) => {
      boulders.push({
        geo: rockify(new THREE.IcosahedronGeometry(1, detail), {
          amp: 0.26,
          freq: 1.25,
          seed: Math.floor(r() * 1000),
          strata: s > 3 ? 9 : 0,
          streaks: s > 3 ? 0.7 : 0.35,
        }),
        pos: [x, y, z],
        scale: [s * (0.9 + r() * 0.5), s * sy, s * (0.8 + r() * 0.4)],
        rot: r() * Math.PI,
      })
    }
    place(-8.5, 3.5, -2.5, 5.2, 1.2)
    place(10.5, 4, -2.8, 5.6, 1.25)
    place(1.2, 10.2, -3.2, 6.5, 0.85)
    place(-5, 9, -4, 5.5)
    place(8, 10, -4.5, 6)
    place(-14, 6, -5, 6.5)
    place(16, 6.5, -5.5, 7)
    place(-2.5, 14, -6, 7)
    place(-2.4, 0.35, 0.4, 0.75, 0.7, 2)
    place(-1.7, 0.2, 1.3, 0.4, 0.7, 2)
    place(5.4, 0.45, 0.6, 0.9, 0.75, 2)
    place(6.6, 0.3, 1.8, 0.5, 1, 2)
    place(9.5, 0.4, 3.5, 0.6, 0.6, 2)

    return { arch, boulders }
  }, [])
}

export function CaveEntrance() {
  const ground = useGround()
  const tunnel = useTunnel()
  const { arch, boulders } = useCliff()
  const rockMaterial = <RockMaterial repeat={7} roughness={0.95} />

  return (
    <group>
      <mesh geometry={ground} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>

      <group position={[MOUTH_X, 0, -1.5]}>
        <mesh geometry={arch} scale={[1.15, 1.05, 1.1]} castShadow receiveShadow>
          {rockMaterial}
        </mesh>
        <mesh geometry={tunnel} position={[0, 1.6, -7.5]} scale={[1.05, 1, 1]}>
          <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} />
        </mesh>
        <mesh position={[0, 2, -15]}>
          <planeGeometry args={[16, 12]} />
          <meshBasicMaterial color="#240403" fog={false} />
        </mesh>
        <CaveGlow />
      </group>

      {boulders.map((b, i) => (
        <mesh
          key={i}
          geometry={b.geo}
          position={b.pos}
          scale={b.scale}
          rotation-y={b.rot}
          castShadow
          receiveShadow
        >
          {rockMaterial}
        </mesh>
      ))}
    </group>
  )
}
