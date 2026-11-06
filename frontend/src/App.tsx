import { lazy, Suspense, useEffect, useRef } from 'react'
import { HomeScreen } from './home/HomeScreen'
import { net } from './net/NetClient'
import { useNet } from './net/useNet'
import { talk } from './net/talk'
import { FpsBadge } from './world/FpsBadge'
import { navigate, useHashRoute } from './useHashRoute'
import { useUpdateReady } from './version'
import { ConsentBanner } from './legal/ConsentBanner'
import { LegalDialog } from './legal/LegalDialog'

const CaveScreen = lazy(() => import('./cave/CaveScreen'))

const BACK_CONFIRM_MS = 4000

function useBackGuard(active: boolean) {
  useEffect(() => {
    if (!active) return
    const isGuard = (s: unknown) => (s as { hangGuard?: boolean } | null)?.hangGuard === true
    if (!isGuard(history.state)) history.pushState({ hangGuard: true }, '', location.href)
    let lastBack = 0
    const onPop = (e: PopStateEvent) => {
      if (isGuard(e.state) || location.hash !== '#/hang') return
      if (talk.overlay) {
        history.pushState({ hangGuard: true }, '', location.href)
        talk.askEnd()
        return
      }
      const now = Date.now()
      if (now - lastBack < BACK_CONFIRM_MS) {
        console.info('[net] rời hang: bấm Back 2 lần')
        navigate('home')
        return
      }
      lastBack = now
      history.pushState({ hangGuard: true }, '', location.href)
      net.chat.notify('Bấm Back thêm lần nữa nếu muốn ra hang (hoặc dùng nút "Ra hang").')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [active])
}

export default function App() {
  const route = useHashRoute()
  const { phase } = useNet()
  const prevRoute = useRef(route)
  useBackGuard(route === 'cave' && phase === 'inCave')

  useEffect(() => {
    const was = prevRoute.current
    prevRoute.current = route
    if (was === 'cave' && route === 'home') {
      if (net.state.phase === 'inCave') {
        console.info('[net] rời hang: địa chỉ đổi về Home (nút Ra hang / Back)')
        net.leave()
      }
      return
    }
    if (phase === 'inCave' && route !== 'cave') navigate('cave')
    else if (phase !== 'inCave' && route === 'cave') navigate('home')
  }, [phase, route])

  return (
    <>
      {route === 'cave' && phase === 'inCave' ? (
        <Suspense fallback={<div className="screen-loading">Đang vào hang…</div>}>
          <CaveScreen onLeave={() => navigate('home')} />
        </Suspense>
      ) : (
        <HomeScreen />
      )}
      <FpsBadge />
      <UpdateBanner />
      <ConsentBanner />
      <LegalDialog />
    </>
  )
}

function UpdateBanner() {
  if (!useUpdateReady()) return null
  return (
    <div className="update-banner" role="status">
      <span>Hang MU vừa có bản mới.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Tải lại
      </button>
    </div>
  )
}
