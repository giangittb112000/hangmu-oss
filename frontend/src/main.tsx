import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/bitter/700.css'
import '@fontsource/bitter/800.css'
import App from './App'
import { QualityProvider } from './world/QualityProvider'
import './index.css'
import { startVersionWatch } from './version'
import { pwa } from './pwa/pwa'

startVersionWatch()
pwa.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QualityProvider>
      <App />
    </QualityProvider>
  </StrictMode>,
)
