import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { noise3, rockify } from '../world/rock'
import { createJerseyTexture, JERSEY_ASPECT } from './jerseyTexture'

const POST_HEIGHT = 3.3
const BAR_LENGTH = 2.75
const SHIRT_W = 2.5
const SHIRT_H = SHIRT_W / JERSEY_ASPECT
const WOOD = '#7a5434'
const WOOD_DARK = '#5a3b22'

function useShirtGeometry() {
  return useMemo(() => {
    const geo = new THREE.PlaneGeometry(SHIRT_W, SHIRT_H, 48, 42)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const down = THREE.MathUtils.clamp((SHIRT_H / 2 - y) / SHIRT_H, 0, 1)
      const z =
        Math.sin(x * 7.5) * 0.035 * down +
        noise3(x * 1.8, y * 1.8, 0, 9) * 0.05 * down +
        Math.pow(down, 1.6) * 0.12 -
        Math.abs(x) * 0.04
      pos.setZ(i, z)
    }
    geo.computeVertexNormals()
    return geo
  }, [])
}

type Props = ThreeElements['group']

export function JerseyPost(props: Props) {
  const [shirt, setShirt] = useState<THREE.CanvasTexture>()
  const shirtGeo = useShirtGeometry()

  useEffect(() => {
    let tex: THREE.CanvasTexture | undefined
    let cancelled = false
    createJerseyTexture().then((t) => {
      if (cancelled) {
        t.dispose()
        return
      }
      tex = t
      setShirt(t)
    })
    return () => {
      cancelled = true
      tex?.dispose()
    }
  }, [])

  const mound = useMemo(
    () =>
      rockify(new THREE.IcosahedronGeometry(0.55, 1), {
        amp: 0.12,
        freq: 2.2,
        seed: 21,
        base: '#cdbfa6',
        shade: '#a8977d',
      }),
    [],
  )

  const shirtY = POST_HEIGHT - 0.06 - SHIRT_H * (0.5 - 0.095)

  return (
    <group {...props}>
      <mesh
        geometry={mound}
        position={[0, 0.05, 0]}
        scale={[1.2, 0.45, 1]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>

      <mesh position={[0, POST_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.11, POST_HEIGHT, 7]} />
        <meshStandardMaterial color={WOOD} flatShading roughness={1} />
      </mesh>
      <mesh position={[0, POST_HEIGHT - 0.12, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.07, 0.075, BAR_LENGTH, 7]} />
        <meshStandardMaterial color={WOOD} flatShading roughness={1} />
      </mesh>
      <mesh position={[0, POST_HEIGHT - 0.12, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.12, 0.025, 5, 10]} />
        <meshStandardMaterial color={WOOD_DARK} flatShading roughness={1} />
      </mesh>

      {shirt && (
        <mesh geometry={shirtGeo} position={[0, shirtY, 0.13]} castShadow>
          <meshStandardMaterial
            map={shirt}
            alphaTest={0.5}
            side={THREE.DoubleSide}
            roughness={0.85}
          />
        </mesh>
      )}
    </group>
  )
}
