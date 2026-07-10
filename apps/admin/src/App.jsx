import { lazy, Suspense, useEffect, useMemo, useState } from 'react'

import AdminLayout from './components/layout/AdminLayout'
import AuthGate from './components/auth/AuthGate'
import AdminCommandPalette from './components/workspace/AdminCommandPalette'
import AdminWorkspaceHelp from './components/workspace/AdminWorkspaceHelp'
import AdminWorkspaceRouteBar from './components/workspace/AdminWorkspaceRouteBar'
import {
  AppErrorBoundary,
  LoadingState,
  NoticeBanner,
} from './components/common'
import {
  ADMIN_PAGE_KEYS,
  ADMIN_PAGE_META,
  ADMIN_PAGE_STORAGE_KEY,
  ADMIN_SIDEBAR_STORAGE_KEY,
} from './config/adminPages'
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

const AdminOverview = lazy(() => import('./pages/AdminOverview'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminDevices = lazy(() => import('./pages/AdminDevices'))
const AdminModels = lazy(() => import('./pages/AdminModels'))
const AdminSubscriptions = lazy(() => import('./pages/AdminSubscriptions'))
const AdminAuditLogs = lazy(() => import('./pages/AdminAuditLogs'))
const AdminSystem = lazy(() => import('./pages/AdminSystem'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))

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

function readStorageValue(key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeStorageValue(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can fail in private browsing. The in-memory state still works.
  }
}

function getStoredAdminPage() {
  const storedPage = readStorageValue(ADMIN_PAGE_STORAGE_KEY, 'overview')

  return ADMIN_PAGE_KEYS.includes(storedPage) ? storedPage : 'overview'
}

function getStoredSidebarOpen() {
  const storedValue = readStorageValue(ADMIN_SIDEBAR_STORAGE_KEY, 'true')

  if (storedValue === 'false') return false
  return true
}

function buildNotice(type, message, title) {
  return {
    id: `${type}-${Date.now()}`,
    type,
    title,
    message,
  }
}

function PageLoading({ title = 'Loading admin page...' }) {
  return (
    <LoadingState
      title={title}
      description="Preparing admin workspace..."
      rows={2}
      compact
    />
  )
}

function App() {
  const [activePage, setActivePage] = useState(getStoredAdminPage)
  const [theme, setTheme] = useState(readStorageValue('theme', 'dark'))
  const [sidebarOpen, setSidebarOpen] = useState(getStoredSidebarOpen)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [workspaceHelpOpen, setWorkspaceHelpOpen] = useState(false)

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

  const currentPageMeta = useMemo(
    () => ADMIN_PAGE_META[activePage] || ADMIN_PAGE_META.overview,
    [activePage]
  )

  useEffect(() => {
    writeStorageValue(ADMIN_PAGE_STORAGE_KEY, activePage)
  }, [activePage])

  useEffect(() => {
    writeStorageValue(ADMIN_SIDEBAR_STORAGE_KEY, String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    writeStorageValue('theme', theme)
  }, [theme])

  useEffect(() => {
    document.title = `${currentPageMeta.title} · dotWatch Admin`
  }, [currentPageMeta.title])

  useEffect(() => {
    function handleOpenCommandPalette() {
      setCommandPaletteOpen(true)
    }

    function handleKeyDown(event) {
      const isCommandShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'

      if (isCommandShortcut) {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
      }

      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener(
      'dotwatchAdminOpenCommandPalette',
      handleOpenCommandPalette
    )

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(
        'dotwatchAdminOpenCommandPalette',
        handleOpenCommandPalette
      )
    }
  }, [])

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
        setNotice(
          buildNotice(
            'error',
            error.message || 'Failed to load admin data',
            'Admin data failed to load'
          )
        )
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
    function handleApiEvent(event) {
      setNotice(
        buildNotice(
          event.type === 'dotwatchAdminApiTimeout' ? 'warning' : 'error',
          event.detail?.message || 'Admin API connection issue',
          event.type === 'dotwatchAdminApiTimeout'
            ? 'Admin API timeout'
            : 'Admin API authorization issue'
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

  function navigateAdminPage(page) {
    setActivePage(ADMIN_PAGE_KEYS.includes(page) ? page : 'overview')
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

      setNotice(
        buildNotice(
          'success',
          `User status changed to ${status}`,
          'User updated'
        )
      )
    } catch (error) {
      console.error(error)
      setNotice(
        buildNotice(
          'error',
          error.message || 'Failed to update user status',
          'User update failed'
        )
      )
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

      setNotice(
        buildNotice(
          'success',
          `User plan changed to ${data.plan}`,
          'Plan updated'
        )
      )
    } catch (error) {
      console.error(error)
      setNotice(
        buildNotice(
          'error',
          error.message || 'Failed to update user plan',
          'Plan update failed'
        )
      )
    }
  }

  const ActivePage = PAGE_COMPONENTS[activePage] || AdminOverview

  return (
    <AuthGate onReady={setAdminUser} getAdminMe={getAdminMe}>
      <AdminLayout
        activePage={activePage}
        adminUser={adminUser}
        onNavigate={navigateAdminPage}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        theme={theme}
        setTheme={setTheme}
      >
        <AdminWorkspaceRouteBar
          page={activePage}
          onNavigate={navigateAdminPage}
          onOpenHelp={() => setWorkspaceHelpOpen(true)}
        />

        {notice ? (
          <NoticeBanner
            type={notice.type || 'info'}
            title={notice.title}
            message={notice.message}
            onDismiss={() => setNotice(null)}
          />
        ) : null}

        <div className="admin-page-toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={refreshAdminData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh admin data'}
          </button>
        </div>

        <AppErrorBoundary
          key={activePage}
          title={`${currentPageMeta.title} failed to load`}
          onReset={() => navigateAdminPage('overview')}
        >
          <Suspense
            fallback={
              <PageLoading title={`Loading ${currentPageMeta.title}...`} />
            }
          >
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
          </Suspense>
        </AppErrorBoundary>

        <AdminCommandPalette
          open={commandPaletteOpen}
          page={activePage}
          onClose={() => setCommandPaletteOpen(false)}
          onNavigate={navigateAdminPage}
        />

        <AdminWorkspaceHelp
          open={workspaceHelpOpen}
          onClose={() => setWorkspaceHelpOpen(false)}
          onNavigate={navigateAdminPage}
        />
      </AdminLayout>
    </AuthGate>
  )
}

export default App
