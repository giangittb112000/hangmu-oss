import { useEffect } from 'react'
import { rage } from './rage/rageState'
import { net } from '../net/NetClient'
import { useNet } from '../net/useNet'
import { isTyping } from './players/useKeyboard'

export function PollCard({ touch }: { touch: boolean }) {
  const { poll, pollVoted } = useNet()
  const open = poll != null && !pollVoted

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (rage.active) return
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
      if (m) net.vote(Number(m[1]) - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <section className="cave-poll" aria-labelledby="cave-poll-q">
      <p id="cave-poll-q" className="cave-poll-q">
        <span aria-hidden="true">🗳️ </span>
        {poll.q}
      </p>
      <div className="cave-poll-options">
        {poll.options.map((label, i) => (
          <button key={i} type="button" className="cave-poll-option" onClick={() => net.vote(i)}>
            {!touch && <kbd>{i + 1}</kbd>}
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
