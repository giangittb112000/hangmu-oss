import * as THREE from 'three'

export function canvasTexture(
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!, canvas)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  return tex
}
