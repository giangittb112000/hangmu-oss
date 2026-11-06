import { useEffect, useState } from 'react'
import { InstallNudge } from '../pwa/InstallNudge'
import { RageHud } from './rage/RageHud'
import { useRage } from './rage/rageState'
import { DonateButton } from '../DonateButton'
import { openLegal } from '../legal/legal'
import { sound, useSound } from '../audio/sound'
import { matchTracker } from '../match'
import { useNet } from '../net/useNet'
import { CaveInteriorScene } from './CaveInteriorScene'
import { ChatPanel } from './ChatPanel'
import { celebrateNow, celebration } from './celebration'
import { GoalOverlay } from './GoalOverlay'
import { NoticeOverlay } from './NoticeOverlay'
import { PollCard } from './PollCard'
import { PunchedOverlay } from './PunchedOverlay'
import { ControlsHelp } from './ControlsHelp'
import { TelegramInvite } from './TelegramInvite'
import { PunchIntro } from './PunchIntro'
import { TalkLayer } from './talk/TalkUi'
import { usePunchAim } from './players/punchAim'
import { net } from '../net/NetClient'
import { ControlsContext, createControls } from './players/controls'
import { Joystick } from './players/Joystick'
import { useCameraDrag, usePointerLocked } from './players/useCameraDrag'
import { useControls } from './players/controls'
import { isTyping, useKeyboardBinding } from './players/useKeyboard'
import { useTouchMode } from './players/useTouchMode'
import { LEGENDS } from './legends'
import './cave.css'

export default function CaveScreen({ onLeave }: { onLeave: () => void }) {
  const [controls] = useState(createControls)
  useEffect(() => {
    matchTracker.start()
    return () => {
      matchTracker.stop()
      celebration.stop()
    }
  }, [])
  return (
    <ControlsContext.Provider value={controls}>
      <CaveView onLeave={onLeave} />
    </ControlsContext.Provider>
  )
}

function SoundControl() {
  const { muted, volume } = useSound()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      sound.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const label = muted ? 'Bật tiếng' : 'Tắt tiếng'
  const shown = muted ? 0 : volume
  return (
    <div className="cave-sound" data-muted={muted || undefined}>
      <button
        type="button"
        className="cave-sound-btn"
        aria-pressed={muted}
        aria-label={label}
        title={`${label} (M)`}
        onClick={(e) => {
          sound.toggle()
          if (e.detail > 0) e.currentTarget.blur()
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {muted ? (
            <path
              d="M16 9l5 6M21 9l-5 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d={
                volume < 50
                  ? 'M16 8.5a5 5 0 0 1 0 7'
                  : 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12'
              }
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </svg>
      </button>
      <input
        type="range"
        className="cave-sound-range"
        min={0}
        max={100}
        step={5}
        value={shown}
        aria-label="Âm lượng"
        aria-valuetext={muted ? 'Đang tắt tiếng' : `${volume}%`}
        title={muted ? 'Đang tắt tiếng' : `Âm lượng ${volume}%`}
        style={{ '--fill': `${shown}%` } as React.CSSProperties}
        onChange={(e) => sound.setVolume(Number(e.currentTarget.value))}
        onPointerUp={(e) => e.currentTarget.blur()}
      />
    </div>
  )
}

const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - performance.now()) / 1000))

function ReconnectOverlay({
  until,
  queue,
  onLeave,
}: {
  until: number
  queue?: number
  onLeave: () => void
}) {
  const [sec, setSec] = useState(() => secondsLeft(until))
  useEffect(() => {
    const t = setInterval(() => setSec(secondsLeft(until)), 250)
    return () => clearInterval(t)
  }, [until])
  return (
    <div
      className="cave-reconnect"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Mất kết nối"
    >
      <div className="cave-reconnect-box">
        <span className="cave-reconnect-spin" aria-hidden="true" />
        <p className="cave-reconnect-title">Mất kết nối với hang</p>
        <p className="cave-reconnect-sub">
          {queue != null
            ? `Đang vào lại… (thứ ${queue})`
            : `Đang kết nối lại… ${sec > 0 ? `${sec}s` : ''}`}
          <br />
          <small>Vào lại kịp thì về đúng chỗ cũ.</small>
        </p>
        <button type="button" className="cave-leave" onClick={onLeave}>
          Ra hang
        </button>
      </div>
    </div>
  )
}

function VideoSoundButton() {
  const { muted, videoMuted } = useSound()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyV' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      sound.toggleVideo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const label = videoMuted ? 'Bật tiếng video' : 'Tắt tiếng video'
  return (
    <button
      type="button"
      className="cave-video-btn"
      aria-pressed={videoMuted}
      aria-label={label}
      title={muted ? `${label} (V) — đang tắt tiếng chung` : `${label} (V)`}
      data-muted={videoMuted || undefined}
      data-global-muted={muted || undefined}
      onClick={(e) => {
        sound.toggleVideo()
        if (e.detail > 0) e.currentTarget.blur()
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect
          x="3"
          y="5"
          width="18"
          height="12"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M10 8.5v5l4-2.5z" fill="currentColor" />
        <path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {videoMuted && (
          <path d="M4 3l16 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
      <span className="cave-video-label">{videoMuted ? 'Video đã tắt tiếng' : 'Tiếng video'}</span>
    </button>
  )
}

function CelebrateButton({ touch }: { touch: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyG' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      celebrateNow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <button
      type="button"
      className="cave-celebrate"
      title={touch ? undefined : 'Ăn mừng (G)'}
      onClick={(e) => {
        celebrateNow()
        if (e.detail > 0) e.currentTarget.blur()
      }}
    >
      <span aria-hidden="true">🎉</span> Ăn mừng
      {!touch && <kbd className="cave-celebrate-key">G</kbd>}
    </button>
  )
}

function PunchControl({ touch }: { touch: boolean }) {
  const aim = usePunchAim()
  const locked = usePointerLocked()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      net.punch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!touch) {
    if (!aim) return null
    return (
      <p className="cave-punch-hint" role="status">
        <kbd>{locked ? 'Click' : 'F'}</kbd>
        <span aria-hidden="true">👊</span> đấm <strong>{aim.name}</strong>
      </p>
    )
  }
  return (
    <button
      type="button"
      className="cave-punch"
      data-ready={aim ? '' : undefined}
      aria-label={aim ? `Đấm ${aim.name}` : 'Đấm (chưa có ai trong vòng)'}
      onClick={() => net.punch()}
    >
      <span className="cave-punch-icon" aria-hidden="true">
        👊
      </span>
      <span className="cave-punch-label">{aim ? aim.name : 'Đấm'}</span>
    </button>
  )
}

function CaveView({ onLeave }: { onLeave: () => void }) {
  const drag = useCameraDrag()
  const imeOn = useKeyboardBinding(useControls().keyboard)
  const touch = useTouchMode()
  const locked = usePointerLocked()
  const { inRoom, unstable, reconnectUntil, reconnectQueue } = useNet()
  const rageActive = useRage().active
  return (
    <main className={rageActive ? 'cave is-rage' : 'cave'}>
      <h1 className="visually-hidden">Trong Hang MU</h1>
      <div className="cave-scene" {...drag}>
        <CaveInteriorScene />
      </div>

      <header className="cave-bar">
        <div className="cave-bar-left">
          <button type="button" className="cave-leave" onClick={onLeave}>
            Ra hang
          </button>
          <SoundControl />
          <VideoSoundButton />
          <TelegramInvite touch={touch} />
        </div>
        <div className="cave-room">
          <p className="cave-room-name">Hang chung</p>
          <p className="cave-room-meta">
            {inRoom ?? 1} anh em
            <span className="cave-room-extra"> trong hang</span>
          </p>
        </div>
      </header>

      <GoalOverlay />
      <NoticeOverlay />
      <CelebrateButton touch={touch} />
      <PollCard touch={touch} />
      <PunchedOverlay />
      <PunchControl touch={touch} />
      <TalkLayer touch={touch} />

      {touch && <Joystick />}

      <RageHud touch={touch} />
      <ChatPanel touch={touch} />

      {locked && <div className="cave-crosshair" aria-hidden="true" />}

      {reconnectUntil != null && (
        <ReconnectOverlay until={reconnectUntil} queue={reconnectQueue} onLeave={onLeave} />
      )}

      {unstable && (
        <p className="cave-net" role="alert">
          Mạng đang chập chờn, đang chờ kết nối lại… Người khác có thể tạm đứng yên.
        </p>
      )}

      {imeOn && (
        <p className="cave-ime" role="status">
          Bộ gõ tiếng Việt đang bật. Chuyển sang EN để đi bằng W A S D mượt hơn, hoặc dùng phím mũi
          tên.
        </p>
      )}

      <ControlsHelp touch={touch} locked={locked} />
      <PunchIntro touch={touch} />
      <InstallNudge />

      <details className="cave-credits">
        <summary aria-label="Nguồn ảnh huyền thoại" title="Nguồn ảnh huyền thoại">
          ©
        </summary>
        <div className="cave-credits-body">
          <p className="cave-credits-title">Nguồn ảnh huyền thoại</p>
          <ul>
            {LEGENDS.map((l) => (
              <li key={l.key}>
                {l.name}: ảnh của{' '}
                <a href={l.credit.source} target="_blank" rel="noreferrer">
                  {l.credit.author}
                </a>
                ,{' '}
                <a href={l.credit.licenseUrl} target="_blank" rel="noreferrer">
                  {l.credit.license}
                </a>
              </li>
            ))}
          </ul>
          <p>Ảnh từ Wikimedia Commons, đã cắt khung.</p>
          <p>
            Trang của người hâm mộ, không liên kết chính thức với Manchester United. ·{' '}
            <button type="button" className="legal-link" onClick={openLegal}>
              Điều khoản &amp; quyền riêng tư
            </button>
          </p>
        </div>
      </details>
      <DonateButton />
    </main>
  )
}
