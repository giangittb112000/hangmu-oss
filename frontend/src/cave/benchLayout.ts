import { CAVE, tierY } from './dimensions'

export const AISLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
const AISLE_HALF = 0.06
export const BENCH_LEN = 2.2
export const BENCH_DEPTH = 0.75
export const BENCH_HEIGHT = 0.46
const SPACING = 2.45

export type BenchSpot = { x: number; y: number; z: number; angle: number }

function computeBenches(): BenchSpot[] {
  const out: BenchSpot[] = []
  for (let i = 1; i <= CAVE.tiers; i++) {
    const r = CAVE.pitRadius + (i - 1) * CAVE.tierWidth + 1.25
    const y = tierY(i) + BENCH_HEIGHT / 2
    const n = Math.floor((2 * Math.PI * r) / SPACING)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (i % 2) * (Math.PI / n)
      const inAisle = AISLES.some((d) => {
        const diff = Math.atan2(Math.sin(a - d), Math.cos(a - d))
        return Math.abs(diff) < AISLE_HALF + 1.0 / r
      })
      if (inAisle) continue
      out.push({ x: Math.sin(a) * r, y, z: Math.cos(a) * r, angle: a })
    }
  }
  return out
}

export const BENCHES: readonly BenchSpot[] = computeBenches()
