import { context } from './cheer'
import { sound } from './sound'

let buf: AudioBuffer | null = null

function noise(ac: AudioContext) {
  if (buf) return buf
  const len = Math.floor(ac.sampleRate * 0.12)
  buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  return buf
}

export function playSplat(item: number, gain = 1) {
  if (sound.muted || sound.volume === 0 || gain <= 0.02) return
  const ac = context()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined)
  const t = ac.currentTime + 0.005
  const src = ac.createBufferSource()
  src.buffer = noise(ac)
  src.playbackRate.value = 0.8 + Math.random() * 0.4
  const f = ac.createBiquadFilter()
  f.type = item === 1 ? 'bandpass' : 'lowpass'
  f.frequency.value = item === 1 ? 1500 : item === 3 ? 2400 : 700
  const g = ac.createGain()
  g.gain.value = (sound.volume / 100) * (item === 3 ? 0.25 : 0.6) * gain
  src.connect(f).connect(g).connect(ac.destination)
  src.start(t)
  src.onended = () => g.disconnect()
}
