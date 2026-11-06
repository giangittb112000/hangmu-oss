import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SceneLayout } from './layout'
import { prefersReducedMotion } from '../world/quality'

const INTRO_SECONDS = 2.6

export function CameraRig({ layout }: { layout: SceneLayout }) {
  const started = useRef<number | null>(null)
  const desired = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera
    if (camera.fov !== layout.fov) {
      camera.fov = layout.fov
      camera.updateProjectionMatrix()
    }
    target.current.set(...layout.target)
    const [bx, by, bz] = layout.camera

    if (prefersReducedMotion()) {
      camera.position.set(bx, by, bz)
      camera.lookAt(target.current)
      return
    }

    if (started.current === null) started.current = state.clock.elapsedTime
    const t = Math.min((state.clock.elapsedTime - started.current) / INTRO_SECONDS, 1)
    const ease = 1 - Math.pow(1 - t, 3)

    desired.current.set(
      bx + state.pointer.x * 0.6,
      by + state.pointer.y * 0.25 + (1 - ease) * 0.8,
      bz + (1 - ease) * 4.5,
    )
    if (t < 1) camera.position.copy(desired.current)
    else camera.position.lerp(desired.current, 0.05)
    camera.lookAt(target.current)
  })

  return null
}
