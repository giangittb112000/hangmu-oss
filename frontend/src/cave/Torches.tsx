import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { noise3 } from '../world/rock'
import { BETWEEN_ANGLES, CAVE } from './dimensions'
import { glowTexture, prefersReducedMotion } from './glow'
import { useQuality } from '../world/useQuality'

const R = CAVE.radius - 2.6
const Y = 3.4

const ANGLES = [...BETWEEN_ANGLES, 0.33, -0.33, 2.78, -2.78]

export function Torches() {
  const { extraLights, flicker } = useQuality()
  const sprites = useRef<(THREE.SpriteMaterial | null)[]>([])
  const lights = useRef<(THREE.PointLight | null)[]>([])

  const items = useMemo(
    () =>
      ANGLES.map((a) => ({
        a,
        pos: [Math.sin(a) * R, Y, Math.cos(a) * R] as [number, number, number],
        lit: Math.abs(a) > 2.75 || Math.abs(a) < 0.5,
      })),
    [],
  )

  useFrame(({ clock }) => {
    if (!flicker || prefersReducedMotion()) return
    const t = clock.elapsedTime
    items.forEach((_, i) => {
      const f = 0.8 + noise3(t * 2.5, i * 3.1, 0, 6) * 0.2
      const s = sprites.current[i]
      if (s) s.opacity = 0.75 * f
      const l = lights.current[i]
      if (l) l.intensity = 34 * f
    })
  })

  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={it.pos} rotation-y={it.a}>
          <mesh position={[0, -0.5, 0.25]} rotation-x={-0.35}>
            <cylinderGeometry args={[0.07, 0.09, 1.4, 6]} />
            <meshStandardMaterial color="#3b2616" flatShading roughness={1} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <coneGeometry args={[0.22, 0.65, 6, 1, true]} />
            <meshBasicMaterial
              color="#ff7a2a"
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <sprite position={[0, 0.35, 0]} scale={[2.6, 2.6, 1]}>
            <spriteMaterial
              ref={(m) => {
                sprites.current[i] = m
              }}
              map={glowTexture('rgba(255,170,90,1)', 'rgba(255,90,30,0.45)')}
              transparent
              opacity={0.75}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
          {extraLights && it.lit && (
            <pointLight
              ref={(l) => {
                lights.current[i] = l
              }}
              position={[0, 0.6, -0.8]}
              color="#ffc490"
              intensity={32}
              distance={18}
              decay={1.8}
            />
          )}
        </group>
      ))}
    </group>
  )
}
