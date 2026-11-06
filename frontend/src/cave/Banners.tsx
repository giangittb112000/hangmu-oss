import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { drawClubLogo, loadClubLogo } from '../world/clubLogo'
import { noise3 } from '../world/rock'
import { BETWEEN_ANGLES, CAVE, domeY, MU_RED } from './dimensions'

const W = 2.2
const H = 5.2
const TEX_W = 440
const TEX_H = 1040

async function createBannerTexture() {
  const logo = await loadClubLogo()
  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  const c = canvas.getContext('2d')!

  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(TEX_W, 0)
  c.lineTo(TEX_W, TEX_H)
  c.lineTo(TEX_W / 2, TEX_H - 150)
  c.lineTo(0, TEX_H)
  c.closePath()
  c.save()
  c.clip()
  c.fillStyle = MU_RED
  c.fillRect(0, 0, TEX_W, TEX_H)
  const g = c.createLinearGradient(0, 0, TEX_W, 0)
  g.addColorStop(0, 'rgba(0,0,0,0.25)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.06)')
  g.addColorStop(1, 'rgba(0,0,0,0.25)')
  c.fillStyle = g
  c.fillRect(0, 0, TEX_W, TEX_H)
  c.fillStyle = '#f6f3ee'
  c.fillRect(22, 0, 16, TEX_H)
  c.fillRect(TEX_W - 38, 0, 16, TEX_H)
  c.fillStyle = '#111'
  c.fillRect(38, 0, 6, TEX_H)
  c.fillRect(TEX_W - 44, 0, 6, TEX_H)
  c.restore()
  if (logo) drawClubLogo(c, logo, TEX_W / 2, 330, 280)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  return tex
}

const ANGLES = BETWEEN_ANGLES

export function Banners() {
  const [tex, setTex] = useState<THREE.CanvasTexture>()

  useEffect(() => {
    let t: THREE.CanvasTexture | undefined
    let cancelled = false
    createBannerTexture().then((x) => {
      if (cancelled) {
        x.dispose()
        return
      }
      t = x
      setTex(x)
    })
    return () => {
      cancelled = true
      t?.dispose()
    }
  }, [])

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, 12, 24)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const down = (H / 2 - y) / H
      pos.setZ(i, Math.sin(x * 2.4 + y * 0.8) * 0.06 + noise3(x, y, 0, 3) * 0.08 * down)
    }
    g.computeVertexNormals()
    return g
  }, [])

  if (!tex) return null
  const r = CAVE.radius - 5.2
  const top = Math.min(11.5, domeY(r + 1.5) - 0.6)

  return (
    <group>
      {ANGLES.map((a) => (
        <group key={a} position={[Math.sin(a) * r, top, Math.cos(a) * r]} rotation-y={a + Math.PI}>
          <mesh rotation-z={Math.PI / 2} position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.06, 0.06, W + 0.5, 6]} />
            <meshStandardMaterial color="#3b2616" roughness={1} />
          </mesh>
          <mesh geometry={geo} position={[0, -H / 2, 0]}>
            <meshStandardMaterial
              map={tex}
              alphaTest={0.5}
              side={THREE.DoubleSide}
              roughness={0.85}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}
