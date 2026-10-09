import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './auth.css'
import './dialogs.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const splash = document.getElementById('app-splash')
if (splash) {
  window.setTimeout(() => {
    splash.classList.add('app-splash-hide')
    window.setTimeout(() => splash.remove(), 400)
  }, 700)
}
