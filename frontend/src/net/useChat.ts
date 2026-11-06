import { useSyncExternalStore } from 'react'
import { net } from './NetClient'

export function useChat() {
  return useSyncExternalStore(net.chat.subscribe, net.chat.getSnapshot)
}
