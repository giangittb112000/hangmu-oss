import { useSyncExternalStore } from 'react'
import { loadLocal, saveLocal } from '../storage'

const MUTED_KEY = 'hangmu.muted'
const VOLUME_KEY = 'hangmu.volume'
const VIDEO_MUTED_KEY = 'hangmu.videoMuted'
export const DEFAULT_VOLUME = 35

const clampVolume = (v: number) =>
  Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : DEFAULT_VOLUME

export type SoundState = {
  muted: boolean
  volume: number
  videoMuted: boolean
}

class SoundSwitch {
  state: SoundState = {
    muted: loadLocal(MUTED_KEY) === '1',
    volume: clampVolume(Number(loadLocal(VOLUME_KEY) ?? DEFAULT_VOLUME)),
    videoMuted: loadLocal(VIDEO_MUTED_KEY) === '1',
  }
  private listeners = new Set<() => void>()

  get muted() {
    return this.state.muted
  }

  get volume() {
    return this.state.volume
  }

  get videoSilent() {
    return this.state.muted || this.state.videoMuted
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState = () => this.state

  private update(patch: Partial<SoundState>) {
    const next = { ...this.state, ...patch }
    if (
      next.muted === this.state.muted &&
      next.volume === this.state.volume &&
      next.videoMuted === this.state.videoMuted
    )
      return
    this.state = next
    saveLocal(MUTED_KEY, next.muted ? '1' : '0')
    saveLocal(VOLUME_KEY, String(next.volume))
    saveLocal(VIDEO_MUTED_KEY, next.videoMuted ? '1' : '0')
    this.listeners.forEach((l) => l())
  }

  toggleVideo = () => this.update({ videoMuted: !this.state.videoMuted })

  setMuted(muted: boolean) {
    const volume = !muted && this.state.volume === 0 ? DEFAULT_VOLUME : this.state.volume
    this.update({ muted, volume })
  }

  toggle = () => this.setMuted(!this.state.muted)

  setVolume = (v: number) => {
    const volume = clampVolume(v)
    this.update({ muted: volume === 0, volume })
  }
}

export const sound = new SoundSwitch()

export const useSound = () => useSyncExternalStore(sound.subscribe, sound.getState)
