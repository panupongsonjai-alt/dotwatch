import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/admin.css'
import './styles/phase11g-admin-dashboard-parity.css'
import './styles/phase11i-admin-comfort-parity.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Unable to start dotWatch Admin: #root element was not found.')
}

const app = <App />
const root = createRoot(rootElement)

root.render(
  import.meta.env.VITE_REACT_STRICT_MODE === 'true' ? (
    <StrictMode>{app}</StrictMode>
  ) : (
    app
  )
)
