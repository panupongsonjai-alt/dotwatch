import { useEffect, useMemo, useState } from 'react'
import AdminLayout from './components/layout/AdminLayout'
import AuthGate from './components/auth/AuthGate'
import AdminOverview from './pages/AdminOverview'
import AdminUsers from './pages/AdminUsers'
import AdminDevices from './pages/AdminDevices'
import AdminSubscriptions from './pages/AdminSubscriptions'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminSystem from './pages/AdminSystem'
import AdminSettings from './pages/AdminSettings'
import {
  getAdminAuditLogs,
  getAdminDevices,
  getAdminMe,
  getAdminUsers,
  updateAdminUserStatus,
} from './services/adminApi'

const PAGE_COMPONENTS = {
  overview: AdminOverview,
  users: AdminUsers,
  devices: AdminDevices,
  subscriptions: AdminSubscriptions,
  audit: AdminAuditLogs,
  system: AdminSystem,
  settings: AdminSettings,
}

function App() {
  const [activePage, setActivePage] = useState('overview')
  const [adminUser, setAdminUser] = useState(null)
  const [users, setUsers] = useState([])
  const [devices, setDevices] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!adminUser) return undefined

    let active = true

    async function loadAdminData() {
      try {
        setLoading(true)

        const [nextUsers, nextDevices, nextAuditLogs] = await Promise.all([
          getAdminUsers(),
          getAdminDevices(),
          getAdminAuditLogs(),
        ])

        if (!active) return

        setUsers(nextUsers)
        setDevices(nextDevices)
        setAuditLogs(nextAuditLogs)
      } catch (error) {
        console.error(error)
        setNotice(error.message || 'Failed to load admin data')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAdminData()

    return () => {
      active = false
    }
  }, [adminUser])

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
          user.id === userId
            ? {
                ...user,
                ...updatedUser,
              }
            : user
        )
      )

      setNotice(`User status changed to ${status}`)
    } catch (error) {
      console.error(error)
      setNotice(error.message || 'Failed to update user status')
    }
  }

  const ActivePage = PAGE_COMPONENTS[activePage] || AdminOverview

  return (
    <AuthGate onReady={setAdminUser} getAdminMe={getAdminMe}>
      <AdminLayout
        activePage={activePage}
        adminUser={adminUser}
        onNavigate={setActivePage}
      >
        {notice ? (
          <div className="admin-notice">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')}>
              Dismiss
            </button>
          </div>
        ) : null}

        <ActivePage
          users={users}
          devices={devices}
          auditLogs={auditLogs}
          stats={stats}
          loading={loading}
          adminUser={adminUser}
          onUpdateUserStatus={handleUpdateUserStatus}
        />
      </AdminLayout>
    </AuthGate>
  )
}

export default App
