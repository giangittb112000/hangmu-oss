import { useEffect, useId, useRef, useState } from 'react'
import {
  nextQuestion,
  putBack,
  submitAnswer,
  type QuizQuestion,
  type QuizResult,
} from '../api/quiz'

const RIGHT = [
  'Chuẩn fan Quỷ đỏ! Mời vào hang.',
  'Chính xác! Sir Alex mà biết chắc cũng gật gù.',
  'Đúng rồi! Glory Glory Man United!',
]
const WRONG = [
  'Trượt mất rồi! Không sao, vào hang anh em kể thêm cho.',
  'Sai một chút thôi, hang vẫn mở cửa chào bạn.',
  'Hụt như sút phạt đền vọt xà! Đáp án đúng tô xanh đó.',
]
const pick = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)]!

const FOCUSABLE = 'button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])'

type State =
  | { step: 'loading' }
  | { step: 'asking'; q: QuizQuestion; chosen?: number }
  | { step: 'result'; q: QuizQuestion; chosen: number; res: QuizResult; message: string }

export function QuizDialog({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [s, setS] = useState<State>({ step: 'loading' })
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  const cancel = useRef(onCancel)
  const alive = useRef<AbortController | null>(null)

  useEffect(() => {
    done.current = onDone
    cancel.current = onCancel
  })

  useEffect(() => {
    const ctrl = new AbortController()
    alive.current = ctrl
    nextQuestion(ctrl.signal)
      .then((q) => {
        if (ctrl.signal.aborted) {
          if (q) putBack(q)
          return
        }
        if (q) setS({ step: 'asking', q })
        else done.current()
      })
      .catch(() => {
        if (!ctrl.signal.aborted) done.current()
      })
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const target =
      s.step === 'result'
        ? el.querySelector<HTMLElement>('.home-enter')
        : el.querySelector<HTMLElement>('.quiz-answer:not(:disabled)')
    ;(target ?? el).focus()
  }, [s.step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const choose = async (q: QuizQuestion, answerId: number) => {
    const ctrl = alive.current
    if (!ctrl) return
    setS({ step: 'asking', q, chosen: answerId })
    try {
      const res = await submitAnswer(q.id, answerId, ctrl.signal)
      if (ctrl.signal.aborted) return
      setS({
        step: 'result',
        q,
        chosen: answerId,
        res,
        message: pick(res.correct ? RIGHT : WRONG),
      })
    } catch {
      if (!ctrl.signal.aborted) done.current()
    }
  }

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return e.preventDefault()
    const first = items[0]!
    const last = items.at(-1)!
    if (
      e.shiftKey &&
      (document.activeElement === first || document.activeElement === box.current)
    ) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const answerClass = (answerId: number) => {
    if (s.step === 'loading') return 'quiz-answer'
    if (s.step === 'asking') return `quiz-answer${s.chosen === answerId ? ' is-chosen' : ''}`
    if (answerId === s.res.correctAnswerId) return 'quiz-answer is-right'
    return `quiz-answer${answerId === s.chosen ? ' is-wrong' : ''}`
  }

  return (
    <div
      className="name-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && s.step !== 'result' && onCancel()}
    >
      <div
        ref={box}
        className="name-dialog quiz-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-busy={s.step === 'loading'}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <p className="quiz-kicker" id={s.step === 'loading' ? `${id}-title` : undefined}>
          Câu hỏi vui trước khi vào hang
        </p>
        {s.step === 'loading' ? (
          <p className="quiz-loading" role="status">
            Đang lấy câu hỏi…
          </p>
        ) : (
          <>
            <h2 id={`${id}-title`}>{s.q.q}</h2>
            <div className="quiz-answers" role="group" aria-labelledby={`${id}-title`}>
              {s.q.answers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={answerClass(a.id)}
                  disabled={s.step === 'result' || s.chosen != null}
                  onClick={() => void choose(s.q, a.id)}
                >
                  {a.text}
                </button>
              ))}
            </div>
          </>
        )}

        {s.step === 'result' ? (
          <>
            <p className={`quiz-result ${s.res.correct ? 'is-right' : 'is-wrong'}`} role="status">
              {s.message}
            </p>
            <div className="name-actions">
              <button type="button" className="home-enter" onClick={onDone}>
                Vào hang
              </button>
            </div>
          </>
        ) : (
          <div className="name-actions">
            <button type="button" className="name-cancel" onClick={onCancel}>
              Huỷ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
