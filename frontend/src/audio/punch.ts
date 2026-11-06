import { context } from './cheer'
import { sound } from './sound'

let snapBuf: AudioBuffer | null = null

function snapBuffer(ac: AudioContext) {
  if (snapBuf) return snapBuf
  const len = Math.floor(ac.sampleRate * 0.05)
  snapBuf = ac.createBuffer(1, len, ac.sampleRate)
  const d = snapBuf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  return snapBuf
}

export function playPunch() {
  if (sound.muted || sound.volume === 0) return
  const ac = context()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined)
  const t = ac.currentTime + 0.01
  const out = ac.createGain()
  out.gain.value = (sound.volume / 100) * 0.9
  out.connect(ac.destination)

  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(140, t)
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.22)
  const body = ac.createGain()
  body.gain.setValueAtTime(1, t)
  body.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
  osc.connect(body).connect(out)

  const noise = ac.createBufferSource()
  noise.buffer = snapBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1200
  bp.Q.value = 0.9
  const snap = ac.createGain()
  snap.gain.value = 0.6
  noise.connect(bp).connect(snap).connect(out)

  osc.start(t)
  noise.start(t)
  osc.stop(t + 0.3)
  osc.onended = () => out.disconnect()
}
