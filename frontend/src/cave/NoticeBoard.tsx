import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { useNetSelect } from '../net/useNet'
import { mountYouTube } from './youtube'
import { drawClubLogo, loadClubLogo } from '../world/clubLogo'
import { rng, rockify } from '../world/rock'
import { BOARD_Z, CAVE_ROCK } from './dimensions'
import { useQuality } from '../world/useQuality'

const BOARD_W = 24
const BOARD_H = 14
const PX_PER_M = 80
const TEX_W = BOARD_W * PX_PER_M
const TEX_H = BOARD_H * PX_PER_M
const px = (m: number) => Math.round(m * PX_PER_M)

const PANEL = { x: 0.6, y: 1.95, w: BOARD_W - 1.2, h: BOARD_H - 1.95 - 0.5 }
const VIDEO_H = 11
const VIDEO_W = (VIDEO_H * 16) / 9
const VIDEO_Y = BOARD_H / 2 - (PANEL.y + PANEL.h / 2)
const VIDEO_PX_W = 960
const VIDEO_PX_H = (VIDEO_PX_W * 9) / 16
const VIDEO_Z = 0.58
const NOTE = 'Thông báo của anh em sẽ hiện ở đây'

function carveText(c: CanvasRenderingContext2D, text: string, x: number, y: number) {
  c.fillStyle = 'rgba(255,240,220,0.22)'
  c.fillText(text, x + 3, y + 3)
  c.fillStyle = 'rgba(20,14,10,0.85)'
  c.fillText(text, x, y)
}

async function createBoardTexture() {
  const titleFont = `800 ${px(1.05)}px Bitter`
  const noteFont = `600 ${px(0.5)}px "Be Vietnam Pro"`
  await document.fonts.load(titleFont, 'BẢNG TIN HANG MU').catch(() => undefined)
  await document.fonts.load(noteFont, NOTE).catch(() => undefined)
  const logo = await loadClubLogo()

  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  const c = canvas.getContext('2d')!
  c.fillStyle = '#6f665a'
  c.fillRect(0, 0, TEX_W, TEX_H)
  const r = rng(303)
  for (let i = 0; i < 12000; i++) {
    c.fillStyle = r() > 0.5 ? 'rgba(30,24,18,0.3)' : 'rgba(220,210,190,0.18)'
    const s = r() * 2.4 + 0.5
    c.fillRect(r() * TEX_W, r() * TEX_H, s, s)
  }

  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = titleFont
  const titleY = px(1.05)
  carveText(c, 'BẢNG TIN HANG MU', TEX_W / 2 + px(0.7), titleY)
  if (logo) drawClubLogo(c, logo, TEX_W / 2 - px(6.3), titleY, px(1.6))

  const [bx, by, bw, bh] = [px(PANEL.x), px(PANEL.y), px(PANEL.w), px(PANEL.h)]
  c.fillStyle = '#2b2620'
  c.fillRect(bx, by, bw, bh)
  c.strokeStyle = 'rgba(255,240,220,0.25)'
  c.lineWidth = 6
  c.strokeRect(bx + 3, by + 3, bw, bh)
  c.strokeStyle = 'rgba(10,8,6,0.9)'
  c.strokeRect(bx, by, bw, bh)

  c.font = noteFont
  c.fillStyle = 'rgba(230,215,195,0.55)'
  c.fillText(NOTE, TEX_W / 2, by + bh / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  return tex
}

const holeMaterial = new THREE.ShaderMaterial({
  fog: true,
  uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  vertexShader: `
    varying float vDepth;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    varying float vDepth;
    void main() {
      float f = smoothstep(fogNear, fogFar, vDepth);
      float a = 1.0 - pow(1.0 - f, 1.0 / 2.2);
      vec3 fog = linearToOutputTexel(vec4(fogColor, 1.0)).rgb;
      gl_FragColor = vec4(fog * a, a);
    }`,
})

const CORNERS = [
  [-VIDEO_PX_W / 2, -VIDEO_PX_H / 2],
  [VIDEO_PX_W / 2, -VIDEO_PX_H / 2],
  [VIDEO_PX_W / 2, VIDEO_PX_H / 2],
  [-VIDEO_PX_W / 2, VIDEO_PX_H / 2],
].map(([x, y]) => new THREE.Vector3(x, y, 0))

class VideoLayer {
  readonly el = document.createElement('div')
  private renderer = new CSS3DRenderer()
  private scene = new THREE.Scene()
  private object = new CSS3DObject(this.el)
  private corners = CORNERS.map((c) => c.clone())
  private tmp = new THREE.Vector3()

  constructor() {
    this.el.className = 'board-video'
    this.el.style.width = `${VIDEO_PX_W}px`
    this.el.style.height = `${VIDEO_PX_H}px`
    this.scene.add(this.object)
  }

  attach(canvas: HTMLCanvasElement) {
    const layer = this.renderer.domElement
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0'
    canvas.parentElement?.insertBefore(layer, canvas)
    const { position, zIndex } = canvas.style
    canvas.style.position = 'relative'
    canvas.style.zIndex = '1'
    return () => {
      layer.remove()
      canvas.style.position = position
      canvas.style.zIndex = zIndex
    }
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h)
  }

  place(anchor: THREE.Object3D) {
    anchor.updateWorldMatrix(true, false)
    anchor.matrixWorld.decompose(this.object.position, this.object.quaternion, this.object.scale)
    this.object.scale.setScalar(VIDEO_W / VIDEO_PX_W)
    this.object.updateMatrixWorld()
    this.corners = CORNERS.map((c) => c.clone().applyMatrix4(this.object.matrixWorld))
  }

  render(camera: THREE.Camera) {
    this.object.visible = this.corners.some(
      (c) => this.tmp.copy(c).applyMatrix4(camera.matrixWorldInverse).z < 0,
    )
    this.renderer.render(this.scene, camera)
  }
}

function BoardVideo({ videoIds }: { videoIds: string }) {
  const { gl, size } = useThree()
  const anchor = useRef<THREE.Group>(null)
  const hole = useRef<THREE.Mesh>(null)
  const [layer] = useState(() => new VideoLayer())

  useEffect(() => layer.attach(gl.domElement), [gl, layer])
  useEffect(() => mountYouTube(layer.el, videoIds), [layer, videoIds])
  useEffect(() => layer.setSize(size.width, size.height), [layer, size])
  useEffect(() => layer.place(anchor.current!), [layer])
  useEffect(() => {
    const mesh = hole.current!
    mesh.onAfterRender = (_r, _s, cam) => layer.render(cam)
    return () => {
      mesh.onAfterRender = () => {}
    }
  }, [layer])

  return (
    <group ref={anchor} position={[0, VIDEO_Y, VIDEO_Z]}>
      <mesh ref={hole} material={holeMaterial}>
        <planeGeometry args={[VIDEO_W, VIDEO_H]} />
      </mesh>
    </group>
  )
}

export function NoticeBoard() {
  const { extraLights } = useQuality()
  const video = useNetSelect((s) => (s.phase === 'inCave' ? s.boardVideo : undefined))
  const [face, setFace] = useState<THREE.CanvasTexture>()

  useEffect(() => {
    let tex: THREE.CanvasTexture | undefined
    let cancelled = false
    createBoardTexture().then((t) => {
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

  const frame = useMemo(
    () =>
      rockify(new THREE.BoxGeometry(BOARD_W + 1.4, BOARD_H + 1.4, 1.2, 10, 6, 2), {
        amp: 0.22,
        freq: 0.6,
        seed: 91,
        streaks: 0.4,
        ...CAVE_ROCK,
      }),
    [],
  )

  const z = BOARD_Z
  const y = BOARD_H / 2 + 0.3

  return (
    <group position={[0, y, z]}>
      <mesh geometry={frame} position={[0, 0, -0.45]}>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, 0.55]}>
        <planeGeometry args={[BOARD_W, BOARD_H]} />
        <meshStandardMaterial
          key={face ? 'face' : 'blank'}
          map={face ?? null}
          color={face ? '#ffffff' : '#6f665a'}
          roughness={0.9}
        />
      </mesh>
      {video && <BoardVideo videoIds={video} />}
      {[-BOARD_W / 2 + 1.5, BOARD_W / 2 - 1.5].map((x) => (
        <mesh key={x} position={[x, -y / 2 - BOARD_H / 4, -0.4]}>
          <boxGeometry args={[1.4, y, 1.4]} />
          <meshStandardMaterial color="#5e564c" flatShading roughness={1} />
        </mesh>
      ))}
      {extraLights && (
        <pointLight position={[0, 1, 5]} color="#ffb070" intensity={30} distance={16} decay={1.8} />
      )}
    </group>
  )
}
