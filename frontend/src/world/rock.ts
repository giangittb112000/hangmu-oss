import * as THREE from 'three'

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(x: number, y: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453
  return s - Math.floor(s)
}

export function noise3(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed)
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u)
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u)
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u)
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1
}

export function fbm3(x: number, y: number, z: number, seed = 0) {
  return (
    noise3(x, y, z, seed) * 0.6 +
    noise3(x * 2.1, y * 2.1, z * 2.1, seed + 3) * 0.28 +
    noise3(x * 4.3, y * 4.3, z * 4.3, seed + 5) * 0.12
  )
}

export const LIMESTONE = {
  base: '#d3cab9',
  shade: '#a99e8b',
  dark: '#5f564c',
  warm: '#d9c39c',
}

type RockOptions = {
  amp?: number
  freq?: number
  seed?: number
  strata?: number
  base?: string
  shade?: string
  dark?: string
  warm?: string
  streaks?: number
}

export function rockify(geo: THREE.BufferGeometry, opts: RockOptions = {}) {
  const {
    amp = 0.35,
    freq = 0.6,
    seed = 1,
    strata = 0,
    streaks = 0.6,
    base = LIMESTONE.base,
    shade = LIMESTONE.shade,
    dark = LIMESTONE.dark,
    warm = LIMESTONE.warm,
  } = opts
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const cBase = new THREE.Color(base)
  const cShade = new THREE.Color(shade)
  const cDark = new THREE.Color(dark)
  const cWarm = new THREE.Color(warm)
  const c = new THREE.Color()
  const radial = new THREE.Vector3()
  const off = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const fx = x * freq
    const fy = y * freq
    const fz = z * freq

    off.set(fbm3(fx, fy, fz, seed), fbm3(fx, fy, fz, seed + 7), fbm3(fx, fy, fz, seed + 13))
    off.multiplyScalar(amp)

    radial.set(x, y, z)
    if (radial.lengthSq() > 1e-6) radial.normalize()
    if (strata > 0) {
      const band = Math.sin(y * strata + noise3(fx, fy * 0.3, fz, seed + 17) * 1.5)
      off.addScaledVector(radial, Math.sign(band) * Math.pow(Math.abs(band), 3) * amp * 0.35)
    }
    pos.setXYZ(i, x + off.x, y + off.y, z + off.z)

    const tone = (fbm3(fx * 1.7, fy * 1.7, fz * 1.7, seed + 29) + 1) / 2
    c.copy(cBase).lerp(cShade, tone * 0.9)
    const warmth = Math.max(0, noise3(fx * 0.8, fy * 0.8, fz * 0.8, seed + 31))
    c.lerp(cWarm, warmth * 0.45)
    const inward = THREE.MathUtils.clamp(-off.dot(radial) / (amp || 1), 0, 1)
    c.lerp(cDark, inward * 0.55)
    const streak = noise3(fx * 3.2, fy * 0.35, fz * 3.2, seed + 37)
    if (streak > 0.25) c.lerp(cDark, Math.min(1, (streak - 0.25) * 2.2) * streaks)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}
