import GAME from '../../shared/game-constants.json'

export const MAX_PLAYERS = GAME.roomCapacity
export const SIM_HZ = GAME.simHz
export const SIM_DT = 1 / SIM_HZ
export const MOVE_SPEED = GAME.moveSpeed
export const WALK_SPEED = MOVE_SPEED
export const RUN_SPEED = MOVE_SPEED
export const ACCEL = GAME.accel
export const MAX_SUBSTEP = GAME.maxSubstep
export const TURN_RATE = GAME.turnRate

export const CAMERA_DISTANCE = 14
export const CAMERA_PITCH_DEFAULT = 0.24
export const CAMERA_PITCH_MIN = -0.75
export const CAMERA_PITCH_MAX = 1.1
export const CAMERA_LOOK_HEIGHT = 4
