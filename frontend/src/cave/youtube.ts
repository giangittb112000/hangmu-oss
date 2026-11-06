import { sound } from '../audio/sound'

export const isYouTubeId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v)

type YTPlayer = {
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  setVolume(volume: number): void
  destroy(): void
}
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string
      videoId: string
      width?: number | string
      height?: number | string
      playerVars?: Record<string, string | number>
      events?: Record<string, (e: { target: YTPlayer; data?: number }) => void>
    },
  ) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const ENDED = 0
const PLAYING = 1
const PAUSED = 2
const AUTOPLAY_CHECK_MS = 1500
const AUTOPLAY_CHECK_MAX = 10
const GESTURE_RETRY_MAX = 2
const API_TIMEOUT_MS = 15_000

const PROGRESS_KEY = 'hangmu.board.progress'
const SAVE_EVERY_MS = 5_000
const NEAR_END_S = 15

type Progress = { list: string; i: number; t: number }

function loadProgress(list: string, count: number): { i: number; t: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null') as Partial<Progress> | null
    if (
      p?.list === list &&
      Number.isInteger(p.i) &&
      p.i! >= 0 &&
      p.i! < count &&
      typeof p.t === 'number' &&
      Number.isFinite(p.t) &&
      p.t >= 0
    ) {
      return { i: p.i!, t: p.t }
    }
  } catch {}
  return { i: 0, t: 0 }
}

function saveProgress(list: string, i: number, t: number) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ list, i, t: Math.floor(t) }))
  } catch {}
}

let api: Promise<YTNamespace> | null = null

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  api ??= new Promise<YTNamespace>((resolve, reject) => {
    const s = document.createElement('script')
    const fail = (msg: string) => {
      clearTimeout(timer)
      api = null
      s.remove()
      reject(new Error(msg))
    }
    const timer = setTimeout(() => fail('Tải YouTube IFrame API quá lâu'), API_TIMEOUT_MS)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      clearTimeout(timer)
      if (window.YT) resolve(window.YT)
    }
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => fail('Không tải được YouTube IFrame API')
    document.head.appendChild(s)
  })
  return api
}

export function mountYouTube(host: HTMLElement, list: string): () => void {
  const videoIds = list.split(',')
  const resume = loadProgress(list, videoIds.length)
  let index = resume.i
  const broken = new Set<number>()
  let started = false
  let checkNearEnd = resume.t > 0
  let player: YTPlayer | null = null
  let ready = false
  let disposed = false
  let playing: boolean | null = null
  let needGesture = false
  let gestureRetries = 0
  let checkTimer: ReturnType<typeof setTimeout> | undefined
  let appliedMuted: boolean | null = null

  const shouldPlay = () => !document.hidden

  const syncPlayback = () => {
    if (!player || !ready) return
    const want = shouldPlay()
    if (want === playing) return
    playing = want
    if (want) player.playVideo()
    else player.pauseVideo()
  }

  const checkAudible = (attempt: number) => {
    checkTimer = setTimeout(() => {
      if (!player || disposed || sound.videoSilent || !playing) return
      const s = player.getPlayerState()
      if (s === PLAYING && !player.isMuted()) return
      if (s === PLAYING || s === PAUSED) {
        player.mute()
        player.playVideo()
        needGesture = gestureRetries < GESTURE_RETRY_MAX
        return
      }
      if (attempt < AUTOPLAY_CHECK_MAX) checkAudible(attempt + 1)
    }, AUTOPLAY_CHECK_MS)
  }

  const applySound = () => {
    if (!player || !ready) return
    clearTimeout(checkTimer)
    appliedMuted = sound.videoSilent
    if (sound.videoSilent) {
      needGesture = false
      player.mute()
    } else {
      player.unMute()
    }
    syncPlayback()
    if (!sound.videoSilent && playing) checkAudible(0)
  }

  const onSoundChange = () => {
    if (!player || !ready) return
    player.setVolume(sound.volume)
    if (appliedMuted !== sound.videoSilent) {
      gestureRetries = 0
      applySound()
    }
  }

  const onGesture = () => {
    if (!needGesture || sound.videoSilent) return
    needGesture = false
    gestureRetries++
    applySound()
  }

  const save = () => {
    if (!player || !ready || !started) return
    const t = player.getCurrentTime()
    if (Number.isFinite(t) && t > 0) saveProgress(list, index, t)
  }

  const next = () => {
    if (!player || disposed) return
    let k = index
    for (let n = 0; n < videoIds.length; n++) {
      k = (k + 1) % videoIds.length
      if (!broken.has(k)) break
    }
    if (broken.has(k)) return
    index = k
    started = false
    saveProgress(list, index, 0)
    player.loadVideoById({ videoId: videoIds[index]!, startSeconds: 0 })
    playing = null
    syncPlayback()
  }

  const onVisibility = () => {
    if (document.hidden) save()
    syncPlayback()
    if (!document.hidden && !sound.videoSilent && playing) {
      clearTimeout(checkTimer)
      checkAudible(0)
    }
  }

  const mount = document.createElement('div')
  host.appendChild(mount)
  const saveTimer = setInterval(() => {
    if (playing && player?.getPlayerState() === PLAYING) save()
  }, SAVE_EVERY_MS)
  window.addEventListener('pagehide', save)
  const unsubscribe = sound.subscribe(onSoundChange)
  window.addEventListener('pointerdown', onGesture, true)
  window.addEventListener('keydown', onGesture, true)
  document.addEventListener('visibilitychange', onVisibility)

  loadApi()
    .then((YT) => {
      if (disposed) return
      player = new YT.Player(mount, {
        host: 'https://www.youtube-nocookie.com',
        videoId: videoIds[index]!,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          mute: 1,
          start: Math.floor(resume.t),
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          rel: 0,
          playsinline: 1,
          origin: location.origin,
        },
        events: {
          onReady: (e) => {
            ready = true
            e.target.setVolume(sound.volume)
            applySound()
          },
          onStateChange: (e) => {
            if (e.data === PLAYING) {
              started = true
              if (checkNearEnd) {
                checkNearEnd = false
                const d = e.target.getDuration()
                if (d > 0 && e.target.getCurrentTime() > d - NEAR_END_S) next()
              }
            }
            if (e.data === ENDED) next()
          },
          onError: () => {
            broken.add(index)
            next()
          },
          onAutoplayBlocked: () => {
            needGesture = gestureRetries < GESTURE_RETRY_MAX
          },
        },
      })
    })
    .catch((err) => console.warn('[board]', err))

  return () => {
    save()
    disposed = true
    clearInterval(saveTimer)
    window.removeEventListener('pagehide', save)
    clearTimeout(checkTimer)
    unsubscribe()
    window.removeEventListener('pointerdown', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
    document.removeEventListener('visibilitychange', onVisibility)
    player?.destroy()
    player = null
    host.replaceChildren()
  }
}
