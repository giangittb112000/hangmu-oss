export type SceneLayout = {
  stele: [number, number, number]
  steleRotY: number
  post: [number, number, number]
  postRotY: number
  postScale: number
  camera: [number, number, number]
  target: [number, number, number]
  fov: number
}

export function sceneLayout(aspect: number): SceneLayout {
  if (aspect < 0.85) {
    return {
      stele: [-0.3, 0, 4.4],
      steleRotY: 0.1,
      post: [3.1, 0, 2.4],
      postRotY: -0.15,
      postScale: 0.85,
      camera: [1.0, 3.6, 19.5],
      target: [1.2, 2.3, 0],
      fov: 50,
    }
  }
  return {
    stele: [-3.1, 0, 3.6],
    steleRotY: 0.32,
    post: [5.7, 0, 2.6],
    postRotY: -0.28,
    postScale: 1.05,
    camera: [-0.4, 2.1, 13.2],
    target: [0.4, 2.3, 0],
    fov: 44,
  }
}
