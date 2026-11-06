import { FPS_ELEMENT_ID } from './FpsMeter'
import './fps.css'

export function FpsBadge() {
  return (
    <output id={FPS_ELEMENT_ID} className="fps-badge" aria-live="off">
      … FPS
    </output>
  )
}
