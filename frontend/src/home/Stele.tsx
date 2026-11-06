import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { rockify } from '../world/rock'
import { createSteleTexture, STELE_ASPECT } from './steleTexture'

type Props = ThreeElements['group']

export function Stele(props: Props) {
  const [face, setFace] = useState<THREE.CanvasTexture>()

  useEffect(() => {
    let tex: THREE.CanvasTexture | undefined
    let cancelled = false
    createSteleTexture().then((t) => {
      if (cancelled) {
        t.dispose()
        return
      }
      tex = t
      setFace(t)
    })
    return () => {
      cancelled = true
      tex?.dispose()
    }
  }, [])

  const body = useMemo(() => {
    const shape = new THREE.Shape()
    shape.absellipse(0, 0, STELE_ASPECT, 1, 0, Math.PI * 2, false, 0)
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.08,
      bevelSegments: 4,
      curveSegments: 64,
    })
    geo.translate(0, 0, -0.13)
    return geo
  }, [])

  const plinth = useMemo(
    () =>
      rockify(new THREE.BoxGeometry(3.6, 0.42, 1.5, 6, 1, 3), {
        amp: 0.05,
        freq: 1.4,
        seed: 3,
        base: '#d6ccbb',
        shade: '#b3a690',
        streaks: 0.1,
      }),
    [],
  )

  return (
    <group {...props}>
      <mesh geometry={plinth} position={[0, 0.21, 0]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>

      <group position={[0, 0.42 + 1.02, 0]} rotation={[-0.06, 0, 0]}>
        <mesh geometry={body} castShadow receiveShadow>
          <meshStandardMaterial
            key={face ? 'engraved' : 'blank'}
            attach="material-0"
            map={face ?? null}
            color={face ? '#ffffff' : '#b9ad98'}
            roughness={0.92}
          />
          <meshStandardMaterial attach="material-1" color="#d6ccba" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}
