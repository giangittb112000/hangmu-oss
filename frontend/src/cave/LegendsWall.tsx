import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { CAVE, PORTRAIT_ANGLES } from './dimensions'
import { glowTexture } from './glow'
import { LEGENDS, type Legend } from './legends'

const PHOTO_W = 4.6
const PHOTO_H = 5.75
const R = CAVE.radius - 4.6
const CENTER_Y = 6.2

function usePlaque(legend: Legend) {
  return useMemo(() => {
    const W = 768
    const H = 180
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const c = canvas.getContext('2d')!
    c.fillStyle = '#2a211a'
    c.fillRect(0, 0, W, H)
    c.strokeStyle = '#b08d4a'
    c.lineWidth = 6
    c.strokeRect(8, 8, W - 16, H - 16)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#f2e6cf'
    c.font = '800 62px Bitter, Georgia, serif'
    c.fillText(legend.name.toUpperCase(), W / 2, 72)
    c.fillStyle = '#d9b46a'
    c.font = '600 38px "Be Vietnam Pro", system-ui, sans-serif'
    c.fillText(legend.years, W / 2, 132)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 16
    return tex
  }, [legend])
}

function Portrait({
  legend,
  photo,
  angle,
}: {
  legend: Legend
  photo: THREE.Texture
  angle: number
}) {
  const plaque = usePlaque(legend)
  return (
    <group
      position={[Math.sin(angle) * R, CENTER_Y, Math.cos(angle) * R]}
      rotation-y={angle + Math.PI}
    >
      <mesh position={[0, 0, -0.12]}>
        <boxGeometry args={[PHOTO_W + 0.5, PHOTO_H + 0.5, 0.22]} />
        <meshStandardMaterial color="#4a2f1a" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[PHOTO_W + 0.22, PHOTO_H + 0.22]} />
        <meshStandardMaterial color="#b08d4a" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[PHOTO_W, PHOTO_H]} />
        <meshBasicMaterial map={photo} color="#ece4da" toneMapped={false} />
      </mesh>
      <mesh position={[0, -PHOTO_H / 2 - 0.75, 0.02]}>
        <planeGeometry args={[PHOTO_W + 0.4, (PHOTO_W + 0.4) * (180 / 768)]} />
        <meshBasicMaterial map={plaque} toneMapped={false} />
      </mesh>
      <mesh position={[0, PHOTO_H / 2 + 0.45, 0.35]} rotation-x={0.6}>
        <boxGeometry args={[1.4, 0.12, 0.2]} />
        <meshStandardMaterial color="#2a2018" metalness={0.5} roughness={0.5} />
      </mesh>
      <sprite position={[0, PHOTO_H / 2 + 0.2, 0.5]} scale={[4.2, 2.4, 1]}>
        <spriteMaterial
          map={glowTexture('rgba(255,230,190,0.9)', 'rgba(255,200,140,0.25)')}
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  )
}

export function LegendsWall() {
  const photos = useTexture(
    LEGENDS.map((l) => l.photo),
    (loaded) => {
      for (const t of [loaded].flat()) {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 16
      }
    },
  )
  return (
    <group>
      {LEGENDS.map((legend, i) => (
        <Portrait key={legend.key} legend={legend} photo={photos[i]!} angle={PORTRAIT_ANGLES[i]!} />
      ))}
    </group>
  )
}
