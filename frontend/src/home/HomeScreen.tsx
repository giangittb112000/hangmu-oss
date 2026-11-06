import { useEffect, useRef, useState } from 'react'
import { getMe, saveMe, type Me } from '../api/me'
import { InstallButton } from '../pwa/InstallButton'
import { net } from '../net/NetClient'
import { useNet } from '../net/useNet'
import { DonateButton } from '../DonateButton'
import { openLegal } from '../legal/legal'
import { HomeScene } from './HomeScene'
import { NameDialog } from './NameDialog'
import { QuizDialog } from './QuizDialog'
import { useRoomStatus } from './useRoomStatus'
import { config } from '../config'
import { PaperPlane } from '../PaperPlane'
import './home.css'

type Asking = null | { mode: 'new' } | { mode: 'rename' }

const RENAME_FAILED = 'Chưa đổi được tên (đổi nhiều quá hoặc mạng lỗi) — thử lại sau ít phút.'

export function HomeScreen() {
  const [asking, setAsking] = useState<Asking>(null)
  const [quizFor, setQuizFor] = useState<Me | null>(null)
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const saving = useRef<Promise<boolean> | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const s = useNet()
  const room = useRoomStatus()

  useEffect(() => {
    const ctrl = new AbortController()
    void getMe(ctrl.signal).then((m) => {
      if (!ctrl.signal.aborted) setMe(m)
    })
    return () => ctrl.abort()
  }, [])

  const submitName = (name: string, number: number | null) => {
    const mode = asking?.mode
    setAsking(null)
    setNameError(null)
    const save = saveMe(name, number).then(
      (m) => {
        if (m) setMe(m)
        return true
      },
      (e: unknown) => {
        console.warn('[me] không lưu được tài khoản', e)
        return false
      },
    )
    if (mode === 'rename') {
      void save.then((ok) => {
        if (!ok) setNameError(RENAME_FAILED)
      })
      return
    }
    saving.current = save
    setQuizFor({ name, number })
  }

  const enterNow = async (who: Me) => {
    const pending = saving.current
    saving.current = null
    if (pending && !(await pending)) {
      const cur = await getMe()
      if (cur && (cur.name !== who.name || cur.number !== who.number)) {
        setMe(cur)
        setNameError(
          `Chưa lưu được tên mới — bạn vẫn là “${cur.name}”. Bấm “Vào hang” để vào với tên này, hoặc thử đổi tên lại sau.`,
        )
        return
      }
    }
    net.enter(who.name, who.number)
  }

  return (
    <main className="home">
      <h1 className="visually-hidden">Di tích lịch sử Hang MU</h1>
      <div className="home-scene">
        <HomeScene />
      </div>

      <section className="home-panel">
        <p className="home-lede">
          Nơi anh em trú sau mỗi trận thua, và cùng ra hang khi đội thắng.
        </p>
        {room && (
          <p className="home-count">
            Trong hang: {room.inRoom} anh em
            {room.waiting > 0 && `, ${room.waiting} người đang chờ ngoài cửa`}
          </p>
        )}

        {s.phase === 'queued' ? (
          <div className="home-queue" role="status">
            <p>
              Hang đã đủ người. Bạn đang đứng thứ <strong>{s.position}</strong> ngoài cửa, tới lượt
              sẽ tự vào.
            </p>
            <button type="button" className="name-cancel" onClick={() => net.leave()}>
              Thôi không chờ
            </button>
          </div>
        ) : s.phase === 'connecting' ? (
          <p className="home-queue" role="status">
            {s.retryIn
              ? `Hang đang đông, tự gõ cửa lại sau ${s.retryIn} giây…`
              : 'Đang gõ cửa hang…'}
          </p>
        ) : (
          <>
            {nameError && (
              <p className="home-error" role="alert">
                {nameError}
              </p>
            )}
            {s.phase === 'closed' && s.error && (
              <p className="home-error" role="alert">
                {s.error}
              </p>
            )}
            <button
              type="button"
              className="home-enter"
              disabled={me === undefined}
              aria-busy={me === undefined}
              onClick={() => {
                setNameError(null)
                if (me) setQuizFor(me)
                else setAsking({ mode: 'new' })
              }}
            >
              {me === undefined
                ? 'Đang tải…'
                : me
                  ? `Vào hang · ${me.name}${me.number ? ` #${me.number}` : ''}`
                  : 'Vào hang'}
            </button>
            {me && (
              <p className="home-me">
                <button
                  type="button"
                  className="legal-link"
                  onClick={() => setAsking({ mode: 'rename' })}
                >
                  Đổi tên
                </button>
              </p>
            )}
          </>
        )}
        {config.telegramUrl && (
          <a
            className="home-tele"
            href={config.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Tham gia group Telegram HangMu (mở tab mới)"
          >
            <PaperPlane size={16} /> Tham gia group Telegram
          </a>
        )}
        <InstallButton />
      </section>

      <DonateButton />

      <footer className="home-footer">
        Trang của người hâm mộ, không liên kết chính thức với Manchester United. ·{' '}
        <button type="button" className="legal-link" onClick={openLegal}>
          Điều khoản &amp; quyền riêng tư
        </button>
      </footer>

      {asking && (
        <NameDialog
          initial={asking.mode === 'rename' && me ? me : undefined}
          onCancel={() => setAsking(null)}
          onSubmit={submitName}
        />
      )}
      {quizFor != null && (
        <QuizDialog
          onCancel={() => {
            setQuizFor(null)
          }}
          onDone={() => {
            const who = quizFor
            setQuizFor(null)
            void enterNow(who)
          }}
        />
      )}
    </main>
  )
}
