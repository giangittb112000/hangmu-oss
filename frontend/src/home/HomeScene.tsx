import { Canvas, useThree } from '@react-three/fiber'
import { Performance } from '../world/Performance'
import { useQuality } from '../world/useQuality'
import { CameraRig } from './CameraRig'
import { CaveEntrance } from './CaveEntrance'
import { Stele } from './Stele'
import { JerseyPost } from './JerseyPost'
import { sceneLayout } from './layout'

const HAZE = '#dcd0bb'

function Scene() {
  const { shadows } = useQuality()
  const aspect = useThree((s) => s.size.width / s.size.height)
  const layout = sceneLayout(aspect)

  return (
    <>
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, 22, 55]} />

      <hemisphereLight args={['#fffaf0', '#d8c8ad', 1.6]} />
      <ambientLight intensity={0.25} color="#fff3e0" />
      <directionalLight
        position={[-6, 12, 14]}
        intensity={2.4}
        color="#fff1d8"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={12}
        shadow-camera-bottom={-6}
        shadow-camera-far={45}
        shadow-bias={-0.0005}
      />

      <CaveEntrance />
      <Stele position={layout.stele} rotation-y={layout.steleRotY} />
      <JerseyPost position={layout.post} rotation-y={layout.postRotY} scale={layout.postScale} />
      <CameraRig layout={layout} />
      <Performance />
    </>
  )
}

export function HomeScene() {
  const q = useQuality()
  return (
    <Canvas
      shadows={q.shadows}
      dpr={q.dpr}
      frameloop={q.maxFps ? 'demand' : 'always'}
      camera={{ position: [0, 2, 16], fov: 44, near: 0.1, far: 120 }}
      gl={{ antialias: q.antialias, powerPreference: 'high-performance' }}
      aria-label="Cửa hang động với bia đá khắc chữ Di tích lịch sử Hang MU"
    >
      <Scene />
    </Canvas>
  )
}
