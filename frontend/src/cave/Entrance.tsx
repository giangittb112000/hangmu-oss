import { useMemo } from 'react'
import * as THREE from 'three'
import { rockify } from '../world/rock'
import { RockMaterial } from '../world/RockMaterial'
import { useQuality } from '../world/useQuality'
import { CAVE, CAVE_ROCK } from './dimensions'

const DAYLIGHT = '#f4e7cf'

export function Entrance() {
  const { extraLights } = useQuality()
  const { arch, tunnel } = useMemo(() => {
    const arch = rockify(new THREE.TorusGeometry(6.2, 2.4, 10, 24, Math.PI), {
      amp: 1.1,
      freq: 0.35,
      seed: 61,
      strata: 1.6,
      ...CAVE_ROCK,
    })
    const tunnel = new THREE.CylinderGeometry(5.6, 4.6, 18, 18, 10, true)
    tunnel.rotateX(Math.PI / 2)
    rockify(tunnel, { amp: 0.6, freq: 0.4, seed: 63, ...CAVE_ROCK })
    const pos = tunnel.attributes.position as THREE.BufferAttribute
    const col = tunnel.attributes.color as THREE.BufferAttribute
    const dark = new THREE.Color('#2b241e')
    const light = new THREE.Color(DAYLIGHT)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getZ(i) + 9) / 18, 0, 1)
      c.copy(dark).lerp(light, Math.pow(t, 2.2))
      col.setXYZ(i, c.r, c.g, c.b)
    }
    return { arch, tunnel }
  }, [])

  const z = CAVE.radius - 2.5

  return (
    <group position={[0, 0, z]}>
      <mesh geometry={arch} scale={[1.1, 1.05, 1.2]}>
        <RockMaterial repeat={7} roughness={0.95} />
      </mesh>
      <mesh geometry={tunnel} position={[0, 2.6, 9]}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 3, 17.5]}>
        <planeGeometry args={[14, 10]} />
        <meshBasicMaterial color={DAYLIGHT} side={THREE.DoubleSide} fog={false} />
      </mesh>
      {extraLights && (
        <pointLight position={[0, 5, 1]} color="#ffe2b8" intensity={30} distance={22} decay={1.6} />
      )}
    </group>
  )
}
