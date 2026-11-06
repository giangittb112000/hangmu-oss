import * as THREE from 'three'
import { rng } from './rock'

let canvasCache: HTMLCanvasElement | undefined
const cache = new Map<number, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }>()

export function stoneTextures(repeat = 7) {
  const hit = cache.get(repeat)
  if (hit) return hit
  canvasCache ??= paintStoneCanvas()
  const map = new THREE.CanvasTexture(canvasCache)
  map.colorSpace = THREE.NoColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(repeat, repeat)
  map.anisotropy = 16
  const bump = map.clone()
  bump.needsUpdate = true
  const out = { map, bump }
  cache.set(repeat, out)
  return out
}

function paintStoneCanvas() {
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const r = rng(77)

  ctx.fillStyle = '#e2e2e2'
  ctx.fillRect(0, 0, S, S)

  for (const [cells, alpha] of [
    [8, 0.45],
    [24, 0.3],
    [64, 0.14],
  ] as const) {
    const small = document.createElement('canvas')
    small.width = small.height = cells
    const sc = small.getContext('2d')!
    const img = sc.createImageData(cells, cells)
    for (let i = 0; i < cells * cells; i++) {
      const v = 190 + r() * 65
      img.data.set([v, v, v, 255], i * 4)
    }
    sc.putImageData(img, 0, 0)
    ctx.globalAlpha = alpha
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(small, 0, 0, S, S)
  }
  ctx.globalAlpha = 1

  for (let i = 0; i < 140; i++) {
    const x = r() * S
    const y = r() * S
    const rad = r() * 1.6 + 0.5
    ctx.fillStyle = `rgba(150,150,150,${0.12 + r() * 0.15})`
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    let x = r() * S
    let y = r() * S
    ctx.strokeStyle = `rgba(120,120,120,${0.15 + r() * 0.2})`
    ctx.lineWidth = 0.5 + r() * 0.6
    ctx.beginPath()
    ctx.moveTo(x, y)
    const steps = 4 + Math.floor(r() * 6)
    for (let s = 0; s < steps; s++) {
      x += (r() - 0.5) * 40
      y += r() * 30
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  return canvas
}
