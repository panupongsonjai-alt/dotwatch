import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/admin.css'
import './styles/phase11g-admin-dashboard-parity.css'
import './styles/phase11i-admin-comfort-parity.css'

const app = <App />

ReactDOM.createRoot(document.getElementById('root')).render(
  import.meta.env.VITE_REACT_STRICT_MODE === 'true' ? (
    <React.StrictMode>{app}</React.StrictMode>
  ) : (
    app
  )
)
