import { Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { Banners } from './Banners'
import { Benches } from './Benches'
import { Bonfire } from './Bonfire'
import { Cavern } from './Cavern'
import { Entrance } from './Entrance'
import { GoalFireworks } from './GoalFireworks'
import { PunchFx } from './PunchFx'
import { Jumbotron } from './Jumbotron'
import { LegendsWall } from './LegendsWall'
import { NoticeBoard } from './NoticeBoard'
import { Torches } from './Torches'
import { Players } from './players/Players'
import { RageBooth } from './rage/RageBooth'
import { SPAWN } from './dimensions'
import { Performance } from '../world/Performance'
import { useQuality } from '../world/useQuality'

const DARK = '#0d0907'

function ResponsiveFov() {
  useFrame(({ camera, size }) => {
    const cam = camera as PerspectiveCamera
    const fov = size.width / size.height < 0.85 ? 74 : 55
    if (cam.fov !== fov) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  })
  return null
}

export function CaveInteriorScene() {
  const q = useQuality()
  const fill = q.extraLights ? 1 : 1.45
  return (
    <Canvas
      dpr={q.dpr}
      frameloop={q.maxFps ? 'demand' : 'always'}
      camera={{
        position: [SPAWN.x, 8, SPAWN.z + 9],
        fov: 55,
        near: 0.1,
        far: 200,
      }}
      gl={{ antialias: q.antialias, powerPreference: 'high-performance' }}
      aria-label="Bên trong Hang MU: đấu trường đá quanh đống lửa đỏ, bảng tin và cờ đỏ trên vách"
    >
      <color attach="background" args={[DARK]} />
      <fog attach="fog" args={[DARK, 45, 130]} />
      <hemisphereLight args={['#b39a80', '#3a2a1e', 1.5 * fill]} />
      <ambientLight intensity={0.35 * fill} color="#ffe2c2" />

      <Cavern />
      <Entrance />
      <Benches />
      <Bonfire />
      <Torches />
      <NoticeBoard />
      <Banners />
      <Jumbotron />
      <GoalFireworks />
      <Suspense fallback={null}>
        <LegendsWall />
      </Suspense>
      <RageBooth />
      <ResponsiveFov />
      <Performance />

      <Players />
      <PunchFx />
    </Canvas>
  )
}
