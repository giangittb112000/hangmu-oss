import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { noise3 } from '../world/rock'
import { prefersReducedMotion } from '../world/quality'
import { useQuality } from '../world/useQuality'

const MU_RED = '#da291c'

function useGlowTexture() {
  return useMemo(() => {
    const S = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const ctx = canvas.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(240,70,45,1)')
    g.addColorStop(0.25, 'rgba(218,41,28,0.75)')
    g.addColorStop(0.6, 'rgba(160,20,12,0.25)')
    g.addColorStop(1, 'rgba(120,10,5,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

export function CaveGlow() {
  const tex = useGlowTexture()
  const light = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.PointLight>(null)
  const core = useRef<THREE.SpriteMaterial>(null)
  const haze = useRef<THREE.SpriteMaterial>(null)
  const { flicker: flickerOn, extraLights } = useQuality()

  useFrame(({ clock }) => {
    if (!flickerOn || prefersReducedMotion()) return
    const t = clock.elapsedTime
    const flicker = 0.82 + noise3(t * 0.9, 0, 0, 3) * 0.14 + Math.sin(t * 7.3) * 0.03
    if (light.current) light.current.intensity = 12 * flicker
    if (fill.current) fill.current.intensity = 2.5 * flicker
    if (core.current) core.current.opacity = 0.42 * flicker
    if (haze.current) haze.current.opacity = 0.12 * flicker
  })

  return (
    <group>
      <pointLight
        ref={light}
        position={[0, 1.6, -5.5]}
        color={MU_RED}
        intensity={10}
        distance={14}
        decay={1.6}
      />
      {extraLights && (
        <pointLight
          ref={fill}
          position={[0, 0.8, -1.2]}
          color="#ff4a2e"
          intensity={2.2}
          distance={6}
          decay={2}
        />
      )}

      <sprite position={[0, 2.3, -12]} scale={[5, 3.4, 1]}>
        <spriteMaterial
          ref={core}
          map={tex}
          transparent
          opacity={0.38}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
      <sprite position={[0, 2.0, -3.5]} scale={[6, 3.2, 1]}>
        <spriteMaterial
          ref={haze}
          map={tex}
          transparent
          opacity={0.11}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
    </group>
  )
}
