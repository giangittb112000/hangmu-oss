import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { drawClubLogo } from '../../world/clubLogo'
import { canvasTexture } from '../../world/canvasTexture'
import { AV } from './avatarRig'

function flatUv(g: THREE.BufferGeometry, u: number, v: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v)
  return g
}

export function createAvatarGeometries(lowDetail: boolean) {
  const seg = lowDetail ? 8 : 14
  const limbSeg = lowDetail ? 6 : 10
  const arm = new THREE.CapsuleGeometry(AV.armR, AV.armLen - AV.armR * 2, 3, limbSeg).translate(
    0,
    -AV.armLen / 2,
    0,
  )
  const hand = flatUv(
    new THREE.SphereGeometry(AV.handR, limbSeg, lowDetail ? 5 : 8).translate(0, -AV.armLen, 0),
    0.5,
    0.04,
  )
  const leg = new THREE.CapsuleGeometry(AV.legR, AV.legLen - AV.legR * 2, 3, limbSeg).translate(
    0,
    -AV.legLen / 2,
    0,
  )
  const foot = flatUv(
    new THREE.SphereGeometry(AV.footR, limbSeg, lowDetail ? 5 : 8)
      .scale(1, 0.62, 1.55)
      .translate(0, -AV.legLen + 0.01, 0.06),
    0.5,
    0.02,
  )
  const merged = {
    arm: mergeGeometries([arm, hand])!,
    leg: mergeGeometries([leg, foot])!,
  }
  for (const g of [arm, hand, leg, foot]) g.dispose()
  return {
    body: new THREE.CapsuleGeometry(AV.torsoR, AV.torsoLen, lowDetail ? 3 : 5, seg + 2),
    head: new THREE.SphereGeometry(AV.headR, seg, lowDetail ? 6 : 10),
    ...merged,
    shadow: new THREE.CircleGeometry(AV.torsoR * 1.3, 12).rotateX(-Math.PI / 2),
    star: new THREE.OctahedronGeometry(0.07),
  }
}

export const BOT_STRIPE = { from: 0.53, to: 0.6 } as const
export const SHIRT_RED = 0xda291c
export const BOT_STRIPE_WHITE = 0xf6f3ee

export function createBodyTexture(logo: HTMLImageElement | null) {
  const W = 512
  const H = 256
  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = '#da291c'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#f6f3ee'
    g.fillRect(0, H * 0.06, W, H * 0.05)
    g.fillStyle = '#1d1b1a'
    g.fillRect(0, H * 0.72, W, H * 0.025)
    g.fillStyle = '#f4f1ec'
    g.fillRect(0, H * 0.745, W, H * 0.255)
    if (logo) drawClubLogo(g, logo, W / 2 + 26, H * 0.36, H * 0.22)
    g.clearRect(0, H * BOT_STRIPE.from, W, H * (BOT_STRIPE.to - BOT_STRIPE.from))
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.offset.x = 0.25
  return tex
}

function limbTexture(bands: [number, number, string][]) {
  return canvasTexture(16, 128, (g) => {
    g.clearRect(0, 0, 16, 128)
    for (const [from, to, color] of bands) {
      g.fillStyle = color
      g.fillRect(0, from * 128, 16, (to - from) * 128)
    }
  })
}

export const createArmTexture = () =>
  limbTexture([
    [0, 0.42, '#da291c'],
    [0.42, 0.47, '#f6f3ee'],
  ])

export const createLegTexture = () =>
  limbTexture([
    [0, 0.34, '#f4f1ec'],
    [0.5, 0.56, '#da291c'],
    [0.56, 1, '#1d1b1a'],
  ])

export function createLimbMaterial(map: THREE.Texture, pbr: boolean, roughness = 0.75) {
  const mat = pbr
    ? new THREE.MeshStandardMaterial({ map, roughness })
    : new THREE.MeshLambertMaterial({ map })
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 limbTex = texture2D( map, vMapUv );
  #ifdef USE_COLOR
    diffuseColor.rgb *= mix( vColor.rgb, limbTex.rgb / max( limbTex.a, 0.001 ), limbTex.a );
  #else
    diffuseColor.rgb *= limbTex.rgb;
  #endif
#endif`,
      )
      .replace('#include <color_fragment>', '')
  }
  mat.customProgramCacheKey = () => 'avatar-limb'
  return mat
}

export function createFaceTexture() {
  const W = 256
  const H = 128
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    const fx = W * 0.25
    g.fillStyle = '#1b130e'
    for (const dx of [-11, 11]) {
      g.beginPath()
      g.ellipse(fx + dx, H * 0.5, 4.5, 6.5, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = '#3a2016'
    g.lineWidth = 3
    g.lineCap = 'round'
    g.beginPath()
    g.arc(fx, H * 0.6, 8, 0.2 * Math.PI, 0.8 * Math.PI)
    g.stroke()
    g.fillStyle = '#2b1d14'
    g.fillRect(0, 0, W, H * 0.3)
    g.beginPath()
    g.ellipse(fx, H * 0.3, 34, 8, 0, 0, Math.PI)
    g.fillStyle = '#ffffff'
    g.fill()
  })
}
