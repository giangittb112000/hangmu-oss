import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'cave'

const toRoute = (hash: string): Route => (hash === '#/hang' ? 'cave' : 'home')

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useHashRoute(): Route {
  return useSyncExternalStore(subscribe, () => toRoute(window.location.hash))
}

export const navigate = (route: Route) => {
  window.location.hash = route === 'cave' ? '#/hang' : '#/'
}
