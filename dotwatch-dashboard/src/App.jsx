import { useState, useEffect } from 'react'

import { useAuth } from './context/AuthContext'

import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import History from './pages/History.jsx'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Alarms from './pages/Alarms.jsx'
import NotificationCenter from './pages/NotificationCenter.jsx'
import SystemHealth from './pages/SystemHealth.jsx'
import AlarmToast from './components/AlarmToast.jsx'
import DeviceDetail from './pages/DeviceDetail.jsx'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import VerifyEmail from './pages/VerifyEmail'

function applyUiPreferences() {
  const root = document.documentElement

  const accent = localStorage.getItem('dotwatchAccent') || 'blue'
  const density = localStorage.getItem('dotwatchDensity') || 'comfortable'
  const reduceMotion = localStorage.getItem('dotwatchReduceMotion') === 'true'
  const compactCards = localStorage.getItem('dotwatchCompactCards') === 'true'

  root.setAttribute('data-accent', accent)
  root.setAttribute('data-density', density)
  root.setAttribute('data-reduce-motion', reduceMotion ? 'true' : 'false')
  root.setAttribute('data-compact-cards', compactCards ? 'true' : 'false')
}

function App() {
  const { user, authLoading, logout } = useAuth()

  const [page, setPage] = useState('dashboard')
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen')
    return saved ? JSON.parse(saved) : true
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    applyUiPreferences()

    window.addEventListener('dotwatchUiSettingsChanged', applyUiPreferences)
    window.addEventListener('storage', applyUiPreferences)

    return () => {
      window.removeEventListener('dotwatchUiSettingsChanged', applyUiPreferences)
      window.removeEventListener('storage', applyUiPreferences)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen))
  }, [sidebarOpen])

  const handleLogout = async () => {
    await logout()
    setPage('dashboard')
    setSelectedDeviceId(null)
  }

  function handleSetPage(nextPage) {
    if (nextPage !== 'device-detail') {
      setSelectedDeviceId(null)
    }

    setPage(nextPage)
  }

  function openDeviceDetail(deviceId) {
    setSelectedDeviceId(deviceId)
    setPage('device-detail')
  }

  function backToDashboard() {
    setSelectedDeviceId(null)
    setPage('dashboard')
  }

  if (authLoading) {
    return <div className="loading">Loading...</div>
  }

  if (!user) {
    return <Login />
  }

  if (!user.emailVerified) {
    return <VerifyEmail />
  }

  return (
    <div className={`layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <Sidebar
        page={page}
        setPage={handleSetPage}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <main className="main">
        <Navbar
          user={user}
          onLogout={handleLogout}
          theme={theme}
          setTheme={setTheme}
        />

        {page === 'dashboard' && <Dashboard onOpenDevice={openDeviceDetail} />}

        {page === 'devices' && <Devices />}

        {page === 'history' && <History />}

        {page === 'alarms' && <Alarms />}

        {page === 'notifications' && <NotificationCenter />}

        {page === 'system-health' && <SystemHealth />}

        {page === 'device-detail' && (
          <DeviceDetail deviceId={selectedDeviceId} onBack={backToDashboard} />
        )}

        {page === 'profile' && <Profile />}

        {page === 'settings' && <Settings />}

        <AlarmToast />
      </main>
    </div>
  )
}

export default App
