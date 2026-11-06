import { matchTracker } from './tracker'

export { matchTracker, projectedMinute } from './tracker'
export type * from './types'

declare global {
  interface Window {
    __match?: typeof matchTracker
  }
}

if (import.meta.env.DEV) window.__match = matchTracker
