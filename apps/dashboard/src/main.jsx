import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AlarmProvider } from './context/AlarmContext.jsx'
import UiFeedbackHost from './components/common/UiFeedbackHost.jsx'
import { applyLanguage, readLanguage } from './utils/languagePreferences.js'
import './styles.css'
import 'leaflet/dist/leaflet.css'

applyLanguage(readLanguage())

const app = (
  <>
    <AuthProvider>
      <AlarmProvider>
        <App />
      </AlarmProvider>
    </AuthProvider>
    <UiFeedbackHost />
  </>
)

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Unable to start dotWatch: #root element was not found.')
}

const root = createRoot(rootElement)

root.render(
  import.meta.env.VITE_REACT_STRICT_MODE === 'true' ? (
    <StrictMode>{app}</StrictMode>
  ) : (
    app
  )
)
