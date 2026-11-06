import { useSyncExternalStore } from 'react'
import { net } from './NetClient'

export function useNet() {
  return useSyncExternalStore(net.subscribe, net.getState)
}

export function useNetSelect<T>(select: (s: ReturnType<typeof net.getState>) => T) {
  return useSyncExternalStore(net.subscribe, () => select(net.getState()))
}
