import * as THREE from 'three'
import { canvasTexture } from '../../world/canvasTexture'
import { AV } from './avatarRig'

const COLS = 10
const ROWS = 10
const CELL_W = 128
const CELL_H = 100
const SPAN = 1.3
const PATCH_H = 0.3
const PATCH_LIFT = 0.02
const PATCH_R = AV.torsoR + 0.006

const FONT = '800 84px Bitter, Georgia, serif'

export async function createJerseyAtlas(): Promise<THREE.CanvasTexture> {
  await document.fonts.load(FONT, '0123456789').catch(() => undefined)
  return canvasTexture(COLS * CELL_W, ROWS * CELL_H, (g) => {
    g.font = FONT
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    for (let n = 0; n < COLS * ROWS; n++) {
      const cx = (n % COLS) * CELL_W + CELL_W / 2
      const cy = Math.floor(n / COLS) * CELL_H + CELL_H / 2 + 4
      const text = String(n)
      g.lineWidth = 7
      g.strokeStyle = '#7a0d06'
      g.strokeText(text, cx, cy, CELL_W - 22)
      g.fillStyle = '#ffffff'
      g.fillText(text, cx, cy, CELL_W - 22)
    }
  })
}

export function createNumberPatch(capacity: number, lowDetail: boolean) {
  const g = new THREE.CylinderGeometry(
    PATCH_R,
    PATCH_R,
    PATCH_H,
    lowDetail ? 6 : 10,
    1,
    true,
    Math.PI - SPAN / 2,
    SPAN,
  )
  g.translate(0, PATCH_LIFT, 0)
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
  cell.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute('aCell', cell)
  return g
}

export function setNumberCell(attr: THREE.InstancedBufferAttribute, i: number, n: number | null) {
  if (n == null) return
  const col = n % COLS
  const row = Math.floor(n / COLS)
  attr.setXY(i, col / COLS, 1 - (row + 1) / ROWS)
}

export function flushNumberCells(attr: THREE.InstancedBufferAttribute) {
  attr.needsUpdate = true
}

export function createNumberMaterial(map: THREE.Texture, pbr: boolean) {
  const params = {
    map,
    alphaTest: 0.5,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }
  const mat = pbr
    ? new THREE.MeshStandardMaterial({ ...params, roughness: 0.8 })
    : new THREE.MeshLambertMaterial(params)
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\nvMapUv = vMapUv * vec2(${(1 / COLS).toFixed(4)}, ${(1 / ROWS).toFixed(4)}) + aCell;`,
      )
  }
  mat.customProgramCacheKey = () => 'jersey-number'
  return mat
}
