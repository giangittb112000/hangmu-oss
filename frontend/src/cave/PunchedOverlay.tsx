import { useNet } from '../net/useNet'

export function PunchedOverlay() {
  const { punched } = useNet()
  if (!punched) return null
  return (
    <div key={punched.seq} className="punched" role="status" aria-live="assertive">
      <div className="punched-daze" aria-hidden="true" />
      <p className="punched-text">
        <span aria-hidden="true">💥 </span>
        Bạn bị <strong>{punched.by}</strong> đấm!
      </p>
    </div>
  )
}
