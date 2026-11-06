import * as THREE from 'three'
import { rng } from '../world/rock'
import { drawClubLogo, loadClubLogo } from '../world/clubLogo'

export const STELE_ASPECT = 1.32

const W = 1584
const H = Math.round(W / STELE_ASPECT)

const STONE = '#b9ad98'
const CUT_DARK = 'rgba(52, 40, 30, 0.88)'
const CUT_LIGHT = 'rgba(255, 248, 236, 0.55)'
const CUT_SHADOW = 'rgba(30, 22, 15, 0.55)'

function paintStone(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = STONE
  ctx.fillRect(0, 0, W, H)
  const r = rng(42)

  for (let i = 0; i < 60; i++) {
    const x = r() * W
    const y = r() * H
    const rad = 80 + r() * 260
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    const dark = r() > 0.5
    g.addColorStop(0, dark ? 'rgba(90,72,55,0.10)' : 'rgba(240,230,212,0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }

  for (let i = 0; i < 9000; i++) {
    const x = r() * W
    const y = r() * H
    const s = r() * 2.2 + 0.4
    ctx.fillStyle = r() > 0.55 ? 'rgba(70,55,40,0.35)' : 'rgba(250,244,232,0.35)'
    ctx.fillRect(x, y, s, s)
  }

  for (let i = 0; i < 140; i++) {
    const x = r() * W
    const y = r() * H
    const rad = r() * 7 + 2
    ctx.beginPath()
    ctx.ellipse(x, y, rad * 1.3, rad, r() * Math.PI, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(60,46,34,0.45)'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + 1.5, y + 1.5, rad * 1.1, rad * 0.8, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,248,236,0.25)'
    ctx.fill()
  }
}

function engrave(
  ctx: CanvasRenderingContext2D,
  draw: (c: CanvasRenderingContext2D) => void,
  { fill = true } = {},
) {
  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const o = off.getContext('2d')!

  const pass = (color: string, dx: number, dy: number, blur = 0) => {
    o.clearRect(0, 0, W, H)
    o.save()
    o.filter = blur ? `blur(${blur}px)` : 'none'
    draw(o)
    o.restore()
    o.globalCompositeOperation = 'source-in'
    o.fillStyle = color
    o.fillRect(0, 0, W, H)
    o.globalCompositeOperation = 'source-over'
    ctx.drawImage(off, dx, dy)
  }

  pass(CUT_LIGHT, 3, 3)
  if (fill) pass(CUT_DARK, 0, 0)
  pass(CUT_SHADOW, -2, -2, 2)
}

export async function createSteleTexture(): Promise<THREE.CanvasTexture> {
  await Promise.all([
    document.fonts.load('800 120px Bitter', 'DI TÍCH LỊCH SỬ HANG MU'),
    document.fonts.load('700 120px Bitter', 'DI TÍCH LỊCH SỬ'),
  ]).catch(() => undefined)
  const logo = await loadClubLogo()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  paintStone(ctx)

  const cx = W / 2
  const logoSize = H * 0.42
  const logoY = H * 0.265

  if (logo) {
    engrave(ctx, (c) => drawClubLogo(c, logo, cx, logoY, logoSize), { fill: false })
    drawClubLogo(ctx, logo, cx, logoY, logoSize)
  }

  engrave(ctx, (c) => {
    c.textAlign = 'center'
    c.textBaseline = 'alphabetic'
    c.font = `700 ${H * 0.085}px Bitter`
    c.letterSpacing = `${H * 0.006}px`
    c.fillText('DI TÍCH LỊCH SỬ', cx, H * 0.6)
    c.font = `800 ${H * 0.2}px Bitter`
    c.letterSpacing = `${H * 0.01}px`
    c.fillText('HANG MU', cx, H * 0.83)
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  tex.repeat.set(1 / (2 * STELE_ASPECT), 1 / 2)
  tex.offset.set(0.5, 0.5)
  return tex
}
