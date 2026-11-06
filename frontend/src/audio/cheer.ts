import { chantVao } from './chant'
import { sound } from './sound'

const DURATION = 8.5
const PEAK = 0.55

const VOICE_URL = '/sounds/vao.mp3'
const VOICE_GAIN = 1

let ctx: AudioContext | null = null
let voice: Promise<AudioBuffer | null> | null = null

function loadVoice(ac: AudioContext) {
  voice ??= fetch(VOICE_URL)
    .then((r) =>
      r.ok && r.headers.get('content-type')?.startsWith('audio') ? r.arrayBuffer() : null,
    )
    .then((b) => (b ? ac.decodeAudioData(b) : null))
    .catch(() => null)
  return voice
}
let noise: AudioBuffer | null = null

export function context() {
  if (ctx) return ctx
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  return ctx
}

function pinkNoise(ac: AudioContext) {
  if (noise) return noise
  const len = ac.sampleRate * 2
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
  }
  noise = buf
  return buf
}

const level = () => (sound.muted ? 0 : sound.volume / 100)

let current: { master: GainNode; nodes: AudioScheduledSourceNode[]; off: () => void } | null = null

function stopCurrent(ac: AudioContext) {
  const c = current
  if (!c) return
  current = null
  c.off()
  const now = ac.currentTime
  c.master.gain.cancelScheduledValues(now)
  c.master.gain.setTargetAtTime(0, now, 0.05)
  for (const n of c.nodes) {
    n.onended = null
    try {
      n.stop(now + 0.3)
    } catch {}
  }
  setTimeout(() => c.master.disconnect(), 400)
}

export function playCheer() {
  if (level() === 0) return
  const ac = context()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined)
  stopCurrent(ac)
  const t0 = ac.currentTime + 0.02
  const buf = pinkNoise(ac)

  const master = ac.createGain()
  master.gain.value = level()
  master.connect(ac.destination)
  const off = sound.subscribe(() => master.gain.setTargetAtTime(level(), ac.currentTime, 0.05))

  const env = ac.createGain()
  env.gain.setValueAtTime(0, t0)
  env.gain.linearRampToValueAtTime(PEAK, t0 + 0.35)
  env.gain.setValueAtTime(PEAK, t0 + 3.2)
  env.gain.exponentialRampToValueAtTime(0.001, t0 + DURATION)
  env.connect(master)

  const layers = [
    { freq: 420, q: 0.9, gain: 0.9, wobble: 2.1 },
    { freq: 900, q: 1.1, gain: 0.7, wobble: 3.3 },
    { freq: 1900, q: 1.4, gain: 0.35, wobble: 4.7 },
  ]
  const nodes: AudioScheduledSourceNode[] = []
  for (const l of layers) {
    const src = ac.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = l.freq
    bp.Q.value = l.q
    const g = ac.createGain()
    g.gain.value = l.gain
    const lfo = ac.createOscillator()
    lfo.frequency.value = l.wobble
    const depth = ac.createGain()
    depth.gain.value = l.gain * 0.25
    lfo.connect(depth).connect(g.gain)
    src.connect(bp).connect(g).connect(env)
    src.start(t0, Math.random() * 1.5)
    lfo.start(t0)
    src.stop(t0 + DURATION + 0.1)
    lfo.stop(t0 + DURATION + 0.1)
    nodes.push(src, lfo)
  }
  const mine = { master, nodes, off }
  current = mine
  void loadVoice(ac).then((voiceBuf) => {
    if (current !== mine) return
    if (!voiceBuf) {
      chantVao(ac, master, ac.currentTime + 0.02, buf, nodes)
      return
    }
    const src = ac.createBufferSource()
    src.buffer = voiceBuf
    const g = ac.createGain()
    g.gain.value = VOICE_GAIN
    src.connect(g).connect(master)
    src.start()
    nodes.push(src)
  })
  nodes[0]!.onended = () => {
    if (current !== mine) return
    current = null
    off()
    master.disconnect()
  }
}
