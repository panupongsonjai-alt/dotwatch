import { useEffect, useMemo, useState } from 'react'
import AdminLayout from './components/layout/AdminLayout'
import AuthGate from './components/auth/AuthGate'
import AdminOverview from './pages/AdminOverview'
import AdminUsers from './pages/AdminUsers'
import AdminDevices from './pages/AdminDevices'
import AdminModels from './pages/AdminModels'
import AdminSubscriptions from './pages/AdminSubscriptions'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminSystem from './pages/AdminSystem'
import AdminSettings from './pages/AdminSettings'
import {
  getAdminAuditLogs,
  getAdminCommercialSummary,
  getAdminDevices,
  getAdminDeviceModels,
  getAdminMe,
  getAdminPlans,
  getAdminUsers,
  updateAdminUserPlan,
  updateAdminUserStatus,
} from './services/adminApi'

const PAGE_COMPONENTS = {
  overview: AdminOverview,
  users: AdminUsers,
  devices: AdminDevices,
  models: AdminModels,
  subscriptions: AdminSubscriptions,
  audit: AdminAuditLogs,
  system: AdminSystem,
  settings: AdminSettings,
}

const ADMIN_PAGE_STORAGE_KEY = 'dotwatchAdminActivePage'

function getStoredAdminPage() {
  const storedPage = window.localStorage.getItem(ADMIN_PAGE_STORAGE_KEY)

  return PAGE_COMPONENTS[storedPage] ? storedPage : 'overview'
}

function buildNotice(type, message) {
  return {
    id: `${type}-${Date.now()}`,
    type,
    message,
  }
}

function App() {
  const [activePage, setActivePage] = useState(getStoredAdminPage)
  const [adminUser, setAdminUser] = useState(null)
  const [users, setUsers] = useState([])
  const [devices, setDevices] = useState([])
  const [deviceModels, setDeviceModels] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [plans, setPlans] = useState([])
  const [commercialSummary, setCommercialSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!adminUser) return undefined

    let active = true

    async function loadAdminData() {
      try {
        setLoading(true)

        const [
          nextUsers,
          nextDevices,
          nextAuditLogs,
          nextPlans,
          nextDeviceModels,
          nextCommercialSummary,
        ] = await Promise.all([
          getAdminUsers(),
          getAdminDevices(),
          getAdminAuditLogs(),
          getAdminPlans(),
          getAdminDeviceModels(),
          getAdminCommercialSummary(),
        ])

        if (!active) return

        setUsers(nextUsers)
        setDevices(nextDevices)
        setAuditLogs(nextAuditLogs)
        setPlans(nextPlans)
        setDeviceModels(Array.isArray(nextDeviceModels) ? nextDeviceModels : [])
        setCommercialSummary(nextCommercialSummary)
      } catch (error) {
        console.error(error)
        setNotice(buildNotice('error', error.message || 'Failed to load admin data'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAdminData()

    return () => {
      active = false
    }
  }, [adminUser, reloadKey])

  useEffect(() => {
    window.localStorage.setItem(ADMIN_PAGE_STORAGE_KEY, activePage)
  }, [activePage])

  useEffect(() => {
    function handleApiEvent(event) {
      setNotice(
        buildNotice(
          event.type === 'dotwatchAdminApiTimeout' ? 'warning' : 'error',
          event.detail?.message || 'Admin API connection issue'
        )
      )
    }

    window.addEventListener('dotwatchAdminApiTimeout', handleApiEvent)
    window.addEventListener('dotwatchAdminApiAuthError', handleApiEvent)

    return () => {
      window.removeEventListener('dotwatchAdminApiTimeout', handleApiEvent)
      window.removeEventListener('dotwatchAdminApiAuthError', handleApiEvent)
    }
  }, [])

  function refreshAdminData() {
    setReloadKey((current) => current + 1)
  }

  const stats = useMemo(() => {
    const totalUsers = users.length
    const activeUsers = users.filter((user) => user.status === 'active').length
    const suspendedUsers = users.filter(
      (user) => user.status === 'suspended'
    ).length
    const totalDevices = devices.length
    const onlineDevices = devices.filter(
      (device) => device.status === 'online'
    ).length
    const offlineDevices = devices.filter(
      (device) => device.status === 'offline'
    ).length

    return {
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalDevices,
      onlineDevices,
      offlineDevices,
    }
  }, [devices, users])

  async function handleUpdateUserStatus(userId, status) {
    try {
      const updatedUser = await updateAdminUserStatus(userId, status)

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          String(user.id) === String(userId)
            ? {
                ...user,
                ...updatedUser,
              }
            : user
        )
      )

      setNotice(buildNotice('success', `User status changed to ${status}`))
    } catch (error) {
      console.error(error)
      setNotice(buildNotice('error', error.message || 'Failed to update user status'))
    }
  }

  async function handleUpdateUserPlan(userId, data) {
    try {
      const updatedUser = await updateAdminUserPlan(userId, data)

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          String(user.id) === String(userId)
            ? {
                ...user,
                ...updatedUser,
              }
            : user
        )
      )

      setNotice(buildNotice('success', `User plan changed to ${data.plan}`))
    } catch (error) {
      console.error(error)
      setNotice(buildNotice('error', error.message || 'Failed to update user plan'))
    }
  }

  const ActivePage = PAGE_COMPONENTS[activePage] || AdminOverview

  return (
    <AuthGate onReady={setAdminUser} getAdminMe={getAdminMe}>
      <AdminLayout
        activePage={activePage}
        adminUser={adminUser}
        onNavigate={(page) => setActivePage(PAGE_COMPONENTS[page] ? page : 'overview')}
      >
        {notice ? (
          <div className={`admin-notice ${notice.type || 'info'}`}>
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="admin-page-toolbar">
          <button type="button" className="ghost-button" onClick={refreshAdminData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh admin data'}
          </button>
        </div>

        <ActivePage
          users={users}
          devices={devices}
          auditLogs={auditLogs}
          stats={stats}
          plans={plans}
          deviceModels={deviceModels}
          commercialSummary={commercialSummary}
          loading={loading}
          adminUser={adminUser}
          onUpdateUserStatus={handleUpdateUserStatus}
          onUpdateUserPlan={handleUpdateUserPlan}
        />
      </AdminLayout>
    </AuthGate>
  )
}

export default App
