import { useSyncExternalStore } from 'react'
import GAME from '../../shared/game-constants.json'
import { findNearestInArc, PunchAim } from './punchAim'
import type { PlayerEntry, PlayerStore } from './store'

export const TALK_REACH = GAME.talkRange - 1
const TALK_NEAR = TALK_REACH / 2
const ARC_COS = Math.cos((80 * Math.PI) / 180)

export const findTalkTarget = (
  store: PlayerStore,
  me: PlayerEntry,
  busy: ReadonlySet<number>,
): PlayerEntry | null => findNearestInArc(store, me, TALK_REACH, TALK_NEAR, ARC_COS, busy)

export const talkAim = new PunchAim()

export const useTalkAim = () => useSyncExternalStore(talkAim.subscribe, talkAim.getSnapshot)
