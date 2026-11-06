import GAME from '../shared/game-constants.json'

export const CAVE = {
  radius: GAME.caveRadius,
  height: 30,
  pitRadius: 7,
  pitDepth: 2.4,
  tiers: 5,
  tierWidth: 3.2,
  entranceHalfAngle: 0.15,
  entranceHeight: 8,
} as const

export const ARENA_RADIUS = CAVE.pitRadius + CAVE.tiers * CAVE.tierWidth
export const TIER_RISE = CAVE.pitDepth / CAVE.tiers

export const tierY = (i: number) => -CAVE.pitDepth + i * TIER_RISE

export const domeY = (r: number) => CAVE.height * Math.sqrt(Math.max(0, 1 - (r / CAVE.radius) ** 2))

export const CAVE_ROCK = {
  base: '#a39886',
  shade: '#776d5f',
  dark: '#3a332b',
  warm: '#ab9473',
}

export const BOARD_Z = -(GAME.caveRadius - 10.5)
export const BOARD_TOP = 15

export const PORTRAIT_ANGLES = [0.55, 1.08, 1.61, 2.14, 2.67].flatMap((a) => [a, -a])

export const BETWEEN_ANGLES = [0.815, 1.345, 1.875, 2.405].flatMap((a) => [a, -a])

export const MU_RED = '#da291c'

export const SPAWN = { x: GAME.spawnX, y: 0, z: GAME.spawnZ } as const
