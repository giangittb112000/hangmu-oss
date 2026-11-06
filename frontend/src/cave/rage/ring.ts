import RAGE from '../../shared/rage-room.json'

export const SLOTS = RAGE.slots
export const RING_R = RAGE.ringR

export const DUMMY_RADIUS = 0.45

export const slotAngle = (k: number) => RAGE.ringAngle0 + (k * Math.PI * 2) / SLOTS

export const slotXZ = (k: number) => {
  const a = slotAngle(k)
  return { x: Math.sin(a) * RING_R, z: Math.cos(a) * RING_R }
}
