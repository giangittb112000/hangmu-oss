import * as THREE from 'three'

const CACHE_MAX = 16
const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number; heightUnits: number }>()

const FONT = '500 26px "Be Vietnam Pro", system-ui, sans-serif'
const MAX_W = 420
const PAD_X = 18
const LINE_H = 34
const MAX_LINES = 3
const TAIL = 12
const BUBBLE_UNIT = 64

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = []
  let line = ''
  const fits = (s: string) => g.measureText(s).width <= maxW
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (fits(next)) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const ch of Array.from(word)) {
      if (fits(line + ch)) line += ch
      else {
        lines.push(line)
        line = ch
      }
    }
  }
  if (line) lines.push(line)
  if (lines.length > MAX_LINES) {
    let last = lines[MAX_LINES - 1]!
    while (last && !fits(`${last}…`)) last = Array.from(last).slice(0, -1).join('')
    lines.length = MAX_LINES
    lines[MAX_LINES - 1] = `${last}…`
  }
  return lines
}

export function keepBubbleTextures(picks: readonly { text: string }[], count: number) {
  for (let k = 0; k < Math.min(count, picks.length); k++) {
    const t = picks[k]!.text
    const hit = cache.get(t)
    if (hit) {
      cache.delete(t)
      cache.set(t, hit)
    }
  }
}

export function chatBubbleTexture(text: string) {
  const hit = cache.get(text)
  if (hit) {
    cache.delete(text)
    cache.set(text, hit)
    return hit
  }
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = FONT
  const lines = wrap(measure, text, MAX_W - PAD_X * 2)
  const textW = Math.max(...lines.map((l) => measure.measureText(l).width))
  const W = Math.ceil(Math.min(MAX_W, textW + PAD_X * 2))
  const boxH = lines.length * LINE_H + 22
  const H = boxH + TAIL
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(255, 246, 236, 0.94)'
  g.beginPath()
  g.roundRect(0, 0, W, boxH, 16)
  g.moveTo(W / 2 - TAIL, boxH - 1)
  g.lineTo(W / 2, H)
  g.lineTo(W / 2 + TAIL, boxH - 1)
  g.fill()
  g.font = FONT
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#2a1712'
  lines.forEach((l, k) => g.fillText(l, W / 2, 11 + LINE_H * (k + 0.5) + 1))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const out = { tex, aspect: W / H, heightUnits: H / BUBBLE_UNIT }
  cache.set(text, out)
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string
    cache.get(oldest)?.tex.dispose()
    cache.delete(oldest)
  }
  return out
}
