import { createContext, useContext } from 'react'
import { CAMERA_PITCH_DEFAULT, CAMERA_PITCH_MAX, CAMERA_PITCH_MIN } from './constants'
import { KeyboardInput } from './useKeyboard'

export class CameraRig {
  yaw = 0
  pitch = CAMERA_PITCH_DEFAULT

  edge = 0

  setEdge(v: number) {
    this.edge = v
  }

  rotate(dx: number, dy: number) {
    this.yaw -= dx * 0.006
    this.pitch = Math.min(CAMERA_PITCH_MAX, Math.max(CAMERA_PITCH_MIN, this.pitch + dy * 0.004))
  }

  tick(dt: number) {
    if (this.edge !== 0) this.yaw -= this.edge * EDGE_TURN_SPEED * dt
  }
}

const EDGE_TURN_SPEED = 1.8

export class VirtualStick {
  x = 0
  y = 0

  set(x: number, y: number) {
    this.x = x
    this.y = y
  }

  release() {
    this.x = 0
    this.y = 0
  }
}

export type PlayerControls = { rig: CameraRig; stick: VirtualStick; keyboard: KeyboardInput }

export const createControls = (): PlayerControls => ({
  rig: new CameraRig(),
  stick: new VirtualStick(),
  keyboard: new KeyboardInput(),
})

export const ControlsContext = createContext<PlayerControls>(createControls())
export const useControls = () => useContext(ControlsContext)
