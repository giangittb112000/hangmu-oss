import { useMemo } from 'react'
import * as THREE from 'three'
import { rockify } from '../world/rock'
import { RockMaterial } from '../world/RockMaterial'
import { BENCH_DEPTH, BENCH_HEIGHT, BENCH_LEN, BENCHES } from './benchLayout'

export function Benches() {
  const { geo, mats } = useMemo(() => {
    const geo = rockify(new THREE.BoxGeometry(BENCH_LEN, BENCH_HEIGHT, BENCH_DEPTH, 5, 1, 2), {
      amp: 0.05,
      freq: 1.6,
      seed: 71,
      streaks: 0.1,
      base: '#9a8f80',
      shade: '#776d61',
      dark: '#3a342d',
      warm: '#a08a70',
    })
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const one = new THREE.Vector3(1, 1, 1)
    const p = new THREE.Vector3()
    const mats = BENCHES.map((b) =>
      m.compose(p.set(b.x, b.y, b.z), q.setFromAxisAngle(up, b.angle), one).clone(),
    )
    return { geo, mats }
  }, [])

  return (
    <instancedMesh
      args={[geo, undefined, mats.length]}
      ref={(mesh) => {
        if (!mesh) return
        mats.forEach((mat, i) => mesh.setMatrixAt(i, mat))
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      }}
    >
      <RockMaterial repeat={0} roughness={0.95} />
    </instancedMesh>
  )
}
