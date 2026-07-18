import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import UiFeedbackHost from './components/common/UiFeedbackHost.jsx'
import './styles/admin.css'
import './styles/phase11g-admin-dashboard-parity.css'
import './styles/phase11i-admin-comfort-parity.css'
import './styles/statcard-single-row.css'
import './styles/dropdown-unify.css'
import './styles/responsive-all-devices.css'
import './styles/admin-sidebar-dashboard-indicator.css'
import './styles/statcard-dashboard-parity.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(
    'Unable to start dotWatch Admin: #root element was not found.'
  )
}

const app = (
  <>
    <App />
    <UiFeedbackHost />
  </>
)
const root = createRoot(rootElement)

root.render(
  import.meta.env.VITE_REACT_STRICT_MODE === 'true' ? (
    <StrictMode>{app}</StrictMode>
  ) : (
    app
  )
)
