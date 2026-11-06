import * as THREE from 'three'

const CACHE_MAX = 128
const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

export function nameTagTexture(name: string, number: number | null = null) {
  const key = `${number ?? ''}|${name}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const H = 64
  const font = '600 30px "Be Vietnam Pro", system-ui, sans-serif'
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const numFont = '800 30px Bitter, Georgia, serif'
  const numText = number == null ? '' : String(number)
  measure.font = numFont
  const badge = numText ? Math.ceil(measure.measureText(numText).width) + 22 : 0
  measure.font = font
  const textW = Math.ceil(measure.measureText(name).width)
  const W = Math.min(512, textW + 32 + badge)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(15, 10, 8, 0.62)'
  g.beginPath()
  g.roundRect(0, 6, W, H - 12, 14)
  g.fill()
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (badge) {
    g.fillStyle = '#c8102e'
    g.beginPath()
    g.roundRect(5, 11, badge, H - 22, 10)
    g.fill()
    g.font = numFont
    g.fillStyle = '#ffffff'
    g.fillText(numText, 5 + badge / 2, H / 2 + 2)
    g.font = font
  }
  g.fillStyle = '#fff6ec'
  const textLeft = badge ? badge + 5 : 0
  g.fillText(name, textLeft + (W - textLeft) / 2, H / 2 + 1, W - 20 - textLeft)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const out = { tex, aspect: W / H }
  cache.set(key, out)
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string
    cache.get(oldest)?.tex.dispose()
    cache.delete(oldest)
  }
  return out
}
