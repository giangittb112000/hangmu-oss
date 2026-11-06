import * as THREE from 'three'
import { useQuality } from './useQuality'
import { stoneTextures } from './stoneTexture'

type Props = {
  repeat?: number
  side?: THREE.Side
  roughness?: number
}

export function RockMaterial({ repeat = 7, side = THREE.FrontSide, roughness = 0.97 }: Props) {
  const { pbr } = useQuality()
  const tex = repeat > 0 ? stoneTextures(repeat) : null
  if (!pbr) {
    return <meshLambertMaterial vertexColors flatShading side={side} map={tex?.map ?? null} />
  }
  return (
    <meshStandardMaterial
      vertexColors
      flatShading
      side={side}
      roughness={roughness}
      map={tex?.map ?? null}
      bumpMap={tex?.bump ?? null}
      bumpScale={0.3}
    />
  )
}
