import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AlarmProvider } from './context/AlarmContext.jsx'
import './styles.css'
import 'leaflet/dist/leaflet.css'

const app = (
  <AuthProvider>
    <AlarmProvider>
      <App />
    </AlarmProvider>
  </AuthProvider>
)

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  import.meta.env.VITE_REACT_STRICT_MODE === 'true' ? (
    <React.StrictMode>{app}</React.StrictMode>
  ) : (
    app
  )
)
