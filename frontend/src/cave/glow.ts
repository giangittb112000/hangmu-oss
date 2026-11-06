import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

export function glowTexture(inner: string, mid: string) {
  const key = inner + mid
  const hit = cache.get(key)
  if (hit) return hit
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.3, mid)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}

export { prefersReducedMotion } from '../world/quality'
