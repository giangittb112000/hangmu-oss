const VOICES = 8
const PHRASES: [number, number][] = [
  [0, 0.42],
  [0.62, 1.75],
]
const FORMANTS: [number, number, number, number][] = [
  [750, 480, 6, 1],
  [1200, 820, 9, 0.55],
  [2550, 2400, 12, 0.22],
]
const CHANT_GAIN = 1.4

export function chantVao(
  ac: BaseAudioContext,
  out: AudioNode,
  t0: number,
  noise: AudioBuffer,
  nodes: AudioScheduledSourceNode[],
): number {
  const bus = ac.createGain()
  bus.gain.value = CHANT_GAIN / Math.sqrt(VOICES)
  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 4
  bus.connect(comp).connect(out)
  const echo = ac.createDelay(1)
  echo.delayTime.value = 0.13
  const fb = ac.createGain()
  fb.gain.value = 0.32
  const tone = ac.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 1800
  const wet = ac.createGain()
  wet.gain.value = 0.35
  comp.connect(echo)
  echo.connect(tone).connect(fb).connect(echo)
  tone.connect(wet).connect(out)

  let end = t0
  for (let v = 0; v < VOICES; v++) {
    const f0 = 165 + Math.random() * 95
    const lag = Math.random() * 0.09
    const pan = ac.createStereoPanner()
    pan.pan.value = (Math.random() * 2 - 1) * 0.75
    pan.connect(bus)
    for (const [start, dur] of PHRASES) {
      const t = t0 + start + lag
      const d = dur * (0.92 + Math.random() * 0.16)
      syllable(ac, pan, t, d, f0 * (start > 0 ? 1.06 : 1), noise, nodes)
      end = Math.max(end, t + d)
    }
  }
  return end + 0.8
}

function syllable(
  ac: BaseAudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  f0: number,
  noise: AudioBuffer,
  nodes: AudioScheduledSourceNode[],
) {
  const glide = Math.min(0.35, dur * 0.5)

  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f0 * 0.82, t)
  osc.frequency.linearRampToValueAtTime(f0 * 1.12, t + 0.1)
  osc.frequency.linearRampToValueAtTime(f0, t + dur * 0.75)
  osc.frequency.linearRampToValueAtTime(f0 * 0.78, t + dur)
  const vib = ac.createOscillator()
  vib.frequency.value = 5 + Math.random() * 1.5
  const vibDepth = ac.createGain()
  vibDepth.gain.value = f0 * 0.025
  vib.connect(vibDepth).connect(osc.frequency)

  const env = ac.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(1, t + 0.05)
  env.gain.setValueAtTime(1, t + Math.max(0.06, dur - 0.25))
  env.gain.linearRampToValueAtTime(0, t + dur)
  env.connect(out)

  for (const [fa, fo, q, gain] of FORMANTS) {
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = q
    bp.frequency.setValueAtTime(fa === FORMANTS[0]![0] ? 320 : fa, t)
    bp.frequency.linearRampToValueAtTime(fa, t + 0.06)
    bp.frequency.setValueAtTime(fa, t + glide * 0.4)
    bp.frequency.linearRampToValueAtTime(fo, t + glide)
    const g = ac.createGain()
    g.gain.value = gain
    osc.connect(bp).connect(g).connect(env)
  }

  const fric = ac.createBufferSource()
  fric.buffer = noise
  const hp = ac.createBiquadFilter()
  hp.type = 'bandpass'
  hp.frequency.value = 3800
  hp.Q.value = 0.8
  const fg = ac.createGain()
  fg.gain.setValueAtTime(0, t - 0.05)
  fg.gain.linearRampToValueAtTime(0.5, t - 0.01)
  fg.gain.linearRampToValueAtTime(0, t + 0.04)
  fric.connect(hp).connect(fg).connect(out)

  const startAt = Math.max(0, t - 0.06)
  osc.start(t)
  vib.start(t)
  fric.start(startAt, Math.random())
  osc.stop(t + dur + 0.05)
  vib.stop(t + dur + 0.05)
  fric.stop(t + 0.06)
  nodes.push(osc, vib, fric)
}
