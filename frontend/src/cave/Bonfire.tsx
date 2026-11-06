import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { noise3, rng, rockify } from '../world/rock'
import { CAVE, CAVE_ROCK, MU_RED } from './dimensions'
import { glowTexture, prefersReducedMotion } from './glow'
import { RockMaterial } from '../world/RockMaterial'
import { useQuality } from '../world/useQuality'
import { celebration } from './celebration'

export function Bonfire() {
  const { embers: EMBERS, flicker: flickerOn } = useQuality()
  const flames = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const redLight = useRef<THREE.PointLight>(null)
  const glow = useRef<THREE.SpriteMaterial>(null)
  const embers = useRef<THREE.Points>(null)

  const ring = useMemo(() => {
    const g = new THREE.TorusGeometry(2.1, 0.5, 6, 16)
    g.rotateX(Math.PI / 2)
    return rockify(g, { amp: 0.18, freq: 1.4, seed: 81, streaks: 0.2, ...CAVE_ROCK })
  }, [])

  const emberGeo = useMemo(() => {
    const r = rng(5)
    const arr = new Float32Array(EMBERS * 3)
    for (let i = 0; i < EMBERS; i++) {
      arr[i * 3] = (r() - 0.5) * 2.4
      arr[i * 3 + 1] = r() * 8
      arr[i * 3 + 2] = (r() - 0.5) * 2.4
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [EMBERS])

  const tongues = useMemo(() => {
    const r = rng(17)
    return Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + r()
      const d = i === 0 ? 0 : 0.45 + r() * 0.5
      return {
        x: Math.sin(a) * d,
        z: Math.cos(a) * d,
        h: i === 0 ? 3.6 : 1.6 + r() * 1.6,
        w: i === 0 ? 0.95 : 0.4 + r() * 0.3,
        color: i === 0 ? '#ff6a22' : i % 2 === 1 ? MU_RED : '#ff3b1f',
        seed: r() * 100,
      }
    })
  }, [])

  useFrame(({ clock }, dt) => {
    if (prefersReducedMotion()) return
    const t = clock.elapsedTime
    const flicker = flickerOn
      ? 0.85 + noise3(t * 1.3, 0, 0, 2) * 0.12 + Math.sin(t * 9.1) * 0.03
      : 0.9
    const boost = celebration.level()
    if (light.current) light.current.intensity = 120 * flicker * (1 + 0.8 * boost)
    if (redLight.current) redLight.current.intensity = 38 * flicker * (1 + 2.2 * boost)
    if (glow.current) glow.current.opacity = Math.min(1, 0.75 * flicker * (1 + 0.6 * boost))
    const tall = 1 + 1.1 * boost
    const wide = 1 + 0.35 * boost
    flames.current?.children.forEach((f, i) => {
      const tg = tongues[i]!
      const n = noise3(t * (2.2 + 2 * boost), tg.seed, 0, 4)
      const h = tg.h * (0.85 + n * 0.25) * tall
      f.scale.set(tg.w * (1 + n * 0.12) * wide, h, tg.w * (1 + n * 0.12) * wide)
      f.position.y = h / 2
      f.rotation.y += dt * (0.6 + 2 * boost)
    })
    const pos = embers.current?.geometry.attributes.position as THREE.BufferAttribute | undefined
    if (pos) {
      for (let i = 0; i < EMBERS; i++) {
        let y = pos.getY(i) + dt * (1.2 + (i % 5) * 0.35) * (1 + 2.5 * boost)
        if (y > 8) y = 0.5
        pos.setY(i, y)
        pos.setX(i, pos.getX(i) + Math.sin(t * 1.5 + i) * dt * 0.25)
      }
      pos.needsUpdate = true
    }
  })

  return (
    <group position={[0, -CAVE.pitDepth, 0]}>
      <mesh geometry={ring} position={[0, 0.25, 0]}>
        <RockMaterial repeat={0} roughness={1} />
      </mesh>
      {[0, 1.1, 2.2].map((a) => (
        <mesh key={a} position={[0, 0.25, 0]} rotation={[0.25, a, Math.PI / 2]}>
          <cylinderGeometry args={[0.14, 0.18, 2.6, 6]} />
          <meshStandardMaterial
            color="#2a1a10"
            emissive="#5a0e05"
            emissiveIntensity={0.8}
            flatShading
          />
        </mesh>
      ))}

      <group ref={flames} position={[0, 0.3, 0]}>
        {tongues.map((tg, i) => (
          <mesh key={i} position={[tg.x, tg.h / 2, tg.z]} scale={[tg.w, tg.h, tg.w]}>
            <coneGeometry args={[1, 1, 7, 1, true]} />
            <meshBasicMaterial
              color={tg.color}
              transparent
              opacity={i === 0 ? 0.7 : 0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              fog={false}
            />
          </mesh>
        ))}
      </group>

      <sprite position={[0, 2.2, 0]} scale={[10, 10, 1]}>
        <spriteMaterial
          ref={glow}
          map={glowTexture('rgba(255,120,60,1)', 'rgba(218,41,28,0.55)')}
          transparent
          opacity={0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>

      <points ref={embers} geometry={emberGeo}>
        <pointsMaterial
          color="#ff7a3a"
          size={0.12}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </points>

      <pointLight
        ref={light}
        position={[0, 3, 0]}
        color="#ffc08a"
        intensity={120}
        distance={80}
        decay={1.5}
      />
      <pointLight
        ref={redLight}
        position={[0, 5, 0]}
        color={MU_RED}
        intensity={38}
        distance={55}
        decay={1.2}
      />
    </group>
  )
}
