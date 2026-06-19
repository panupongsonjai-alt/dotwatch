import { useState, useEffect } from 'react'

import { useAuth } from './context/AuthContext'

import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Alarms from './pages/Alarms.jsx'
import AlarmToast from './components/AlarmToast.jsx'
import AlarmRules from './pages/AlarmRules.jsx'
import DeviceDetail from './pages/DeviceDetail.jsx'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import VerifyEmail from './pages/VerifyEmail'
import DemoCenter from './pages/DemoCenter'

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
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen))
  }, [sidebarOpen])

  const handleLogout = async () => {
    await logout()
    setPage('dashboard')
    setSelectedDeviceId(null)
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
        setPage={setPage}
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

        {page === 'alarms' && <Alarms />}

        {page === 'alarm-rules' && <AlarmRules />}

        {page === 'device-detail' && (
          <DeviceDetail deviceId={selectedDeviceId} onBack={backToDashboard} />
        )}

        {page === 'demo-center' && <DemoCenter />}

        {page === 'profile' && <Profile />}

        {page === 'settings' && <Settings />}

        <AlarmToast />
      </main>
    </div>
  )
}

export default App
