import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { canvasTexture } from '../world/canvasTexture'
import { useTouchMode } from './players/useTouchMode'

const textsFor = (touch: boolean) => [
  'Vào đây giao lưu võ thuật 👊',
  touch
    ? '🍅 Phòng xả giận · lại gần hình nộm, bấm “Vào phòng”'
    : '🍅 Phòng xả giận · lại gần hình nộm, nhấn E',
]
const SWAP_MS = 6000
const FONT = '800 92px Bitter, Georgia, serif'
const TEX_W = 1024
const TEX_H = 168

export const SIGN_W = 10.4
export const SIGN_H = SIGN_W * (TEX_H / TEX_W)

function drawSign(g: CanvasRenderingContext2D, text: string) {
  const w = TEX_W
  const h = TEX_H
  const bg = g.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#d4202f')
  bg.addColorStop(1, '#9e0b1f')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#fbe122'
  g.lineWidth = 8
  g.strokeRect(14, 14, w - 28, h - 28)
  g.font = FONT
  const maxW = w - 90
  const scale = Math.min(1, maxW / g.measureText(text).width)
  g.save()
  g.translate(w / 2, h / 2 + 4)
  g.scale(scale, scale)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgb(0 0 0 / 0.55)'
  g.shadowBlur = 6
  g.shadowOffsetY = 3
  g.fillStyle = '#fff6ec'
  g.fillText(text, 0, 0)
  g.restore()
}

export function ArenaSign({ hangLen }: { hangLen: number }) {
  const touch = useTouchMode()
  const [texs, setTexs] = useState<THREE.CanvasTexture[]>()
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const shown = useRef(0)

  useEffect(() => {
    let alive = true
    let made: THREE.CanvasTexture[] = []
    const texts = textsFor(touch)
    void document.fonts
      .load(FONT, texts.join(' '))
      .catch(() => undefined)
      .then(() => {
        if (!alive) return
        made = texts.map((t) => canvasTexture(TEX_W, TEX_H, (g) => drawSign(g, t)))
        shown.current = -1
        setTexs(made)
      })
    return () => {
      alive = false
      made.forEach((t) => t.dispose())
    }
  }, [touch])

  useFrame(() => {
    if (!texs) return
    const w = Math.floor(performance.now() / SWAP_MS) % texs.length
    if (w === shown.current) return
    shown.current = w
    for (const m of mats.current) if (m) m.map = texs[w]!
  })
  const tex = texs?.[0]

  const half = SIGN_W / 2 + 0.06
  const sides = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

  return (
    <group>
      <mesh>
        <boxGeometry args={[SIGN_W, SIGN_H, SIGN_W]} />
        <meshStandardMaterial color="#1c1612" roughness={0.7} />
      </mesh>
      {sides.map((a, i) => (
        <mesh key={a} position={[Math.sin(a) * half, 0, Math.cos(a) * half]} rotation-y={a}>
          <planeGeometry args={[SIGN_W, SIGN_H]} />
          <meshBasicMaterial
            ref={(m) => {
              mats.current[i] = m
            }}
            key={tex ? 'on' : 'off'}
            map={tex ?? null}
            color={tex ? '#ffffff' : '#9e0b1f'}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([x, z]) => (
        <mesh
          key={`${x}${z}`}
          position={[x! * (half - 0.5), SIGN_H / 2 + hangLen / 2, z! * (half - 0.5)]}
        >
          <cylinderGeometry args={[0.04, 0.04, hangLen, 5]} />
          <meshStandardMaterial color="#2b2622" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}
