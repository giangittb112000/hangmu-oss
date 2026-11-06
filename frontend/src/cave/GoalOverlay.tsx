import { useCelebration } from './celebration'

const WORD = 'VÀOOOO!'

export function GoalOverlay() {
  const goal = useCelebration()
  if (!goal) return null
  const who = [goal.minute, goal.scorer].filter(Boolean).join(' ')
  return (
    <div key={goal.id} className="goal-overlay" role="status" aria-live="assertive">
      <div className="goal-vignette" aria-hidden="true" />
      <div className="goal-card">
        <p className="goal-word" aria-label="Vào!">
          {Array.from(WORD, (ch, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} aria-hidden="true">
              {ch}
            </span>
          ))}
        </p>
        <p className="goal-who">{who ? `⚽ ${who}` : 'Glory Glory Man United!'}</p>
        {goal.scoreLine && <p className="goal-score">{goal.scoreLine}</p>}
      </div>
    </div>
  )
}
