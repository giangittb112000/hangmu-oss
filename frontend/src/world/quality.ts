export type Tier = 'low' | 'high'

export type Quality = {
  tier: Tier
  dpr: [number, number]
  antialias: boolean
  shadows: boolean
  maxFps: number | null
  extraLights: boolean
  pbr: boolean
  embers: number
  domeSegments: [number, number]
  flicker: boolean
}

const DEVICE_DPR =
  typeof window !== 'undefined' ? Math.min(Math.max(window.devicePixelRatio || 1, 1), 2.5) : 1

export const QUALITY: Record<Tier, Quality> = {
  high: {
    tier: 'high',
    dpr: [1, DEVICE_DPR],
    antialias: true,
    shadows: true,
    maxFps: null,
    extraLights: true,
    pbr: true,
    embers: 140,
    domeSegments: [110, 44],
    flicker: true,
  },
  low: {
    tier: 'low',
    dpr: [1, Math.min(DEVICE_DPR, 1.5)],
    antialias: false,
    shadows: false,
    maxFps: null,
    extraLights: false,
    pbr: false,
    embers: 50,
    domeSegments: [64, 26],
    flicker: false,
  },
}

const WEAK_GPU =
  /swiftshader|llvmpipe|software|mali-[2-4]\d\d|mali-t[0-9]{3}|mali-g(31|51|52|57)\b|adreno \(tm\) [2-5]\d\d|powervr|intel\(r\) (hd|uhd) graphics( [0-9]{3})?$|intel\(r\) hd graphics [2-5]\d{3}/i

function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return 'none'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return String(name)
  } catch {
    return ''
  }
}

const SESSION_KEY = 'hangmu.quality.v2'

export function readOverride(): Tier | null {
  const q = new URLSearchParams(window.location.search).get('q')
  if (q === 'low' || q === 'high') return q
  try {
    const s = sessionStorage.getItem(SESSION_KEY)
    if (s === 'low') return 'low'
  } catch {}
  return null
}

export function rememberDowngrade() {
  try {
    sessionStorage.setItem(SESSION_KEY, 'low')
  } catch {}
}

export function detectTier(): Tier {
  const override = readOverride()
  if (override) return override

  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  if (nav.connection?.saveData) return 'low'
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return 'low'
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) return 'low'
  if (WEAK_GPU.test(gpuName())) return 'low'
  return 'high'
}

const reducedMotionQuery =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export const prefersReducedMotion = () => reducedMotionQuery?.matches ?? false
