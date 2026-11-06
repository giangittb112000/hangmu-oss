import { useEffect, useState } from 'react'
import { api } from '../api/client'

export type RoomStatus = { inRoom: number; capacity: number; waiting: number }

export function useRoomStatus() {
  const [status, setStatus] = useState<RoomStatus>()
  useEffect(() => {
    const ctrl = new AbortController()
    const load = () =>
      api<RoomStatus>('/room/status', { signal: ctrl.signal })
        .then(setStatus)
        .catch(() => {})
    load()
    const t = setInterval(load, 10_000)
    return () => {
      ctrl.abort()
      clearInterval(t)
    }
  }, [])
  return status
}
