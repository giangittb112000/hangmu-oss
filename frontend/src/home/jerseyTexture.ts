import * as THREE from 'three'
import { drawClubLogo, loadClubLogo } from '../world/clubLogo'

const W = 1024
const H = 900
export const JERSEY_ASPECT = W / H

const RED = '#da291c'
const RED_DEEP = '#a8150c'
const WHITE = '#f6f3ee'
const TRIM = '#1b1b1b'

function shirtPath(c: CanvasRenderingContext2D) {
  c.beginPath()
  c.moveTo(440, 62)
  c.quadraticCurveTo(512, 128, 584, 62)
  c.lineTo(700, 84)
  c.lineTo(986, 112)
  c.lineTo(994, 300)
  c.lineTo(690, 322)
  c.quadraticCurveTo(700, 600, 672, 862)
  c.quadraticCurveTo(512, 878, 352, 862)
  c.quadraticCurveTo(324, 600, 334, 322)
  c.lineTo(30, 300)
  c.lineTo(38, 112)
  c.lineTo(324, 84)
  c.closePath()
}

export async function createJerseyTexture(): Promise<THREE.CanvasTexture> {
  const logo = await loadClubLogo()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!

  c.save()
  shirtPath(c)
  c.clip()

  c.fillStyle = RED
  c.fillRect(0, 0, W, H)
  const body = c.createRadialGradient(512, 380, 60, 512, 480, 560)
  body.addColorStop(0, 'rgba(255,255,255,0.08)')
  body.addColorStop(1, 'rgba(60,0,0,0.28)')
  c.fillStyle = body
  c.fillRect(0, 0, W, H)

  c.lineCap = 'round'
  const fold = (x1: number, y1: number, x2: number, y2: number, w: number, a: number) => {
    c.strokeStyle = `rgba(90,8,4,${a})`
    c.lineWidth = w
    c.beginPath()
    c.moveTo(x1, y1)
    c.quadraticCurveTo((x1 + x2) / 2 + 18, (y1 + y2) / 2, x2, y2)
    c.stroke()
  }
  c.filter = 'blur(10px)'
  fold(350, 340, 420, 840, 26, 0.35)
  fold(676, 340, 610, 840, 26, 0.35)
  fold(470, 420, 455, 850, 16, 0.22)
  fold(560, 430, 585, 850, 16, 0.22)
  fold(120, 140, 300, 300, 14, 0.25)
  fold(904, 140, 724, 300, 14, 0.25)
  c.filter = 'none'

  for (const [x0, dir] of [
    [30, 1],
    [994, -1],
  ] as const) {
    c.fillStyle = WHITE
    c.beginPath()
    c.moveTo(x0, 100)
    c.lineTo(x0 + dir * 46, 104)
    c.lineTo(x0 + dir * 46, 304)
    c.lineTo(x0, 304)
    c.closePath()
    c.fill()
    c.strokeStyle = TRIM
    c.lineWidth = 6
    c.beginPath()
    c.moveTo(x0 + dir * 50, 104)
    c.lineTo(x0 + dir * 50, 304)
    c.stroke()
  }

  c.fillStyle = RED_DEEP
  c.fillRect(0, 836, W, 60)
  c.restore()

  c.lineCap = 'round'
  c.strokeStyle = WHITE
  c.lineWidth = 26
  c.beginPath()
  c.moveTo(436, 60)
  c.quadraticCurveTo(512, 136, 588, 60)
  c.stroke()
  c.strokeStyle = TRIM
  c.lineWidth = 5
  c.beginPath()
  c.moveTo(442, 78)
  c.quadraticCurveTo(512, 150, 582, 78)
  c.stroke()

  if (logo) drawClubLogo(c, logo, 612, 250, 128)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  return tex
}
