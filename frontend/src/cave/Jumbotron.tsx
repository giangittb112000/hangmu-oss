import { useEffect, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { ArenaSign, SIGN_H } from './ArenaSign'
import { domeY } from './dimensions'
import { useQuality } from '../world/useQuality'
import { matchTracker } from '../match'
import { useCelebration } from './celebration'
import { prefersReducedMotion } from '../world/quality'
import {
  drawGoalScreen,
  drawScoreboard,
  loadScoreboardAssets,
  SCREEN_H,
  SCREEN_W,
  type GoalScreen,
  type ScoreboardAssets,
  type ScoreboardState,
} from './scoreboard'

const FACE_W = 15
const FACE_H = FACE_W * (SCREEN_H / SCREEN_W)
const HALF = FACE_W / 2 + 0.35
const BOTTOM = 10
const CENTER_Y = BOTTOM + FACE_H / 2
const SIGN_HANG = 0.7

const REDRAW_EVERY_MS = 10_000
const GOAL_FLASH_MS = 380

function createSurface() {
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_W
  canvas.height = SCREEN_H
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 16
  return {
    texture,
    draw(state: ScoreboardState, assets: ScoreboardAssets, now: number) {
      drawScoreboard(canvas, state, assets, now)
      texture.needsUpdate = true
    },
    drawGoal(goal: GoalScreen, flash: boolean, assets: ScoreboardAssets) {
      drawGoalScreen(canvas, goal, flash, assets)
      texture.needsUpdate = true
    },
    dispose: () => texture.dispose(),
  }
}

export function Jumbotron() {
  const { extraLights } = useQuality()
  const match = useSyncExternalStore(matchTracker.subscribe, matchTracker.getSnapshot)
  const [assets, setAssets] = useState<ScoreboardAssets>()
  const [now, setNow] = useState(Date.now)
  const goal = useCelebration()
  const [flash, setFlash] = useState(false)

  const [surface] = useState(createSurface)
  useEffect(() => () => surface.dispose(), [surface])

  useEffect(() => {
    let alive = true
    void loadScoreboardAssets().then((a) => alive && setAssets(a))
    return () => {
      alive = false
    }
  }, [])

  const ticking = match != null && match.state !== 'post'
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), REDRAW_EVERY_MS)
    return () => clearInterval(id)
  }, [ticking])

  useEffect(() => {
    if (!goal || prefersReducedMotion()) return
    const id = setInterval(() => setFlash((f) => !f), GOAL_FLASH_MS)
    return () => clearInterval(id)
  }, [goal])

  useEffect(() => {
    if (!assets) return
    if (goal) surface.drawGoal(goal, flash, assets)
    else surface.draw(match ? { kind: 'match', match } : { kind: 'idle' }, assets, Date.now())
  }, [assets, surface, match, now, goal, flash])

  const ready = assets != null

  const ceiling = domeY(0) - 0.5
  const cableLen = ceiling - (CENTER_Y + FACE_H / 2)

  return (
    <group position={[0, CENTER_Y, 0]}>
      <mesh>
        <boxGeometry args={[FACE_W + 0.6, FACE_H + 0.6, FACE_W + 0.6]} />
        <meshStandardMaterial color="#1c1612" roughness={0.6} metalness={0.4} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
        <mesh key={a} position={[Math.sin(a) * HALF, 0, Math.cos(a) * HALF]} rotation-y={a}>
          <planeGeometry args={[FACE_W, FACE_H]} />
          <meshBasicMaterial
            key={ready ? 'on' : 'off'}
            map={ready ? surface.texture : null}
            color={ready ? '#ffffff' : '#120808'}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[FACE_H / 2 + 0.38, -FACE_H / 2 - 0.38].flatMap((y) =>
        [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
          <mesh
            key={`${y}-${a}`}
            position={[Math.sin(a) * (HALF + 0.02), y, Math.cos(a) * (HALF + 0.02)]}
            rotation-y={a}
          >
            <boxGeometry args={[FACE_W + 0.9, 0.18, 0.12]} />
            <meshBasicMaterial color="#da291c" toneMapped={false} />
          </mesh>
        )),
      )}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([x, z]) => (
        <mesh
          key={`${x}${z}`}
          position={[x! * (HALF - 0.6), FACE_H / 2 + cableLen / 2, z! * (HALF - 0.6)]}
        >
          <cylinderGeometry args={[0.05, 0.05, cableLen, 5]} />
          <meshStandardMaterial color="#2b2622" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group position={[0, -FACE_H / 2 - 0.3 - SIGN_HANG - SIGN_H / 2, 0]}>
        <ArenaSign hangLen={SIGN_HANG} />
      </group>
      {extraLights && (
        <pointLight
          position={[0, -FACE_H / 2 - 0.3 - SIGN_HANG - SIGN_H - 0.5, 0]}
          color="#ffd9c8"
          intensity={30}
          distance={26}
          decay={1.4}
        />
      )}
    </group>
  )
}
