import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { net } from '../net/NetClient'
import { prefersReducedMotion } from '../world/quality'
import { canvasTexture } from '../world/canvasTexture'
import { glowTexture } from './glow'

const FIST_OUT_MS = 130
const FIST_BACK_MS = 300
const MISS_AFTER_MS = 420
const BURST_MS = 560
const CHEST_Y = 1.05
const HEAD_Y = 2.05
const MISS_REACH = 1.6

function drawBurst(g: CanvasRenderingContext2D, text: string, fill: string, size: number) {
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, 256, 256)
  g.translate(128, 128)
  g.beginPath()
  const spikes = 12
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 120 : i % 4 === 1 ? 88 : 78
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = fill
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#c8102e'
  g.lineJoin = 'round'
  g.stroke()
  g.rotate(-0.12)
  g.font = `800 ${size}px Bitter, Georgia, serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 10
  g.strokeStyle = '#ffffff'
  g.strokeText(text, 0, 6)
  g.fillStyle = '#c8102e'
  g.fillText(text, 0, 6)
}

type PunchTextures = { fist: THREE.Texture; hit: THREE.CanvasTexture; miss: THREE.CanvasTexture }
let cache: PunchTextures | null = null

function punchTextures(): PunchTextures {
  if (cache) return cache
  const draw = (tex: THREE.CanvasTexture, text: string, fill: string, size: number) => {
    drawBurst((tex.image as HTMLCanvasElement).getContext('2d')!, text, fill, size)
    tex.needsUpdate = true
  }
  const hit = canvasTexture(256, 256, (g) => drawBurst(g, 'BỐP!', '#ffd23a', 78))
  const miss = canvasTexture(256, 256, (g) => drawBurst(g, 'Hụt!', '#f3e7d8', 70))
  const fist = canvasTexture(128, 128, (g) => {
    g.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('👊', 64, 70)
  })
  void document.fonts
    .load('800 78px Bitter', 'BỐP! Hụt')
    .then(() => {
      draw(hit, 'BỐP!', '#ffd23a', 78)
      draw(miss, 'Hụt!', '#f3e7d8', 70)
    })
    .catch(() => undefined)
  cache = { fist, hit, miss }
  return cache
}

const easeOut = (k: number) => 1 - (1 - k) ** 3

export function PunchFx() {
  const fist = useRef<THREE.Sprite>(null)
  const burst = useRef<THREE.Sprite>(null)
  const ring = useRef<THREE.Sprite>(null)
  const [tex] = useState(punchTextures)
  const S = useRef({ from: new THREE.Vector3(), to: new THREE.Vector3() })

  useFrame(() => {
    const f = fist.current
    const b = burst.current
    const r = ring.current
    if (!f || !b || !r) return
    const now = performance.now()
    const store = net.store
    const me = store?.local
    const at = net.punchAnimAt
    const t = now - at
    if (!store || !me || t < 0 || t > MISS_AFTER_MS + BURST_MS) {
      f.visible = b.visible = r.visible = false
      return
    }
    const calm = prefersReducedMotion()
    const { from, to } = S.current
    from.set(me.drawX, me.drawY + CHEST_Y, me.drawZ)
    const aimed = net.punchTargetId ? store.players.get(net.punchTargetId) : undefined
    if (aimed) to.set(aimed.drawX, aimed.drawY + CHEST_Y, aimed.drawZ)
    else
      to.set(
        me.drawX + Math.sin(me.curr.heading) * MISS_REACH,
        me.drawY + CHEST_Y,
        me.drawZ + Math.cos(me.curr.heading) * MISS_REACH,
      )

    if (t < FIST_BACK_MS && !calm) {
      const k =
        t < FIST_OUT_MS
          ? easeOut(t / FIST_OUT_MS)
          : 1 - (t - FIST_OUT_MS) / (FIST_BACK_MS - FIST_OUT_MS)
      f.visible = true
      f.position.lerpVectors(from, to, k * 0.92)
      const s = 0.45 + 0.35 * k
      f.scale.set(s, s, 1)
      ;(f.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.4 + k)
    } else {
      f.visible = false
    }

    const hit = net.punchHitAt >= at
    const hitEntry = hit && net.punchHitId ? store.players.get(net.punchHitId) : undefined
    const k = hit ? (now - net.punchHitAt) / BURST_MS : (t - MISS_AFTER_MS) / BURST_MS
    if (k < 0 || k >= 1) {
      b.visible = r.visible = false
      return
    }
    if (hitEntry) to.set(hitEntry.drawX, hitEntry.drawY + CHEST_Y, hitEntry.drawZ)
    const bm = b.material as THREE.SpriteMaterial
    const map = hit ? tex.hit : tex.miss
    if (bm.map !== map) {
      bm.map = map
      bm.needsUpdate = true
    }
    b.visible = true
    b.position.set(to.x, to.y - CHEST_Y + HEAD_Y, to.z)
    const pop = calm
      ? 1
      : k < 0.25
        ? 1.35 * easeOut(k / 0.25)
        : 1.35 - 0.25 * Math.min(1, (k - 0.25) / 0.3)
    const size = (hit ? 1.5 : 0.9) * pop
    b.scale.set(size, size, 1)
    bm.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4
    bm.rotation = calm ? 0 : -0.15 + 0.1 * Math.sin(k * 8)

    r.visible = hit && !calm
    if (r.visible) {
      r.position.copy(to)
      const rs = 0.6 + 2.4 * easeOut(Math.min(1, k * 1.6))
      r.scale.set(rs, rs, 1)
      ;(r.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.9 - k * 1.5)
    }
  })

  return (
    <group>
      <sprite ref={fist} visible={false} renderOrder={10}>
        <spriteMaterial
          map={tex.fist}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={ring} visible={false} renderOrder={9}>
        <spriteMaterial
          map={glowTexture('rgba(255,210,58,0)', 'rgba(255,90,40,0.9)')}
          transparent
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={burst} visible={false} renderOrder={11}>
        <spriteMaterial transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}
