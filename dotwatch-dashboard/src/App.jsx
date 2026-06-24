import { useMemo, useState, useEffect } from 'react'
import {
  Activity,
  Bell,
  Command,
  Gauge,
  HelpCircle,
  HeartPulse,
  History as HistoryIcon,
  LayoutDashboard,
  Radio,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  User,
} from 'lucide-react'

import { useAuth } from './context/AuthContext'

import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import History from './pages/History.jsx'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Alarms from './pages/Alarms.jsx'
import NotificationCenter from './pages/NotificationCenter.jsx'
import ActivityCenter from './pages/ActivityCenter.jsx'
import SystemHealth from './pages/SystemHealth.jsx'
import AlarmToast from './components/AlarmToast.jsx'
import DeviceDetail from './pages/DeviceDetail.jsx'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import VerifyEmail from './pages/VerifyEmail'

const PAGE_META = {
  dashboard: {
    section: 'Monitoring',
    title: 'Dashboard',
    description: 'Operations overview and realtime device status.',
    icon: LayoutDashboard,
  },
  devices: {
    section: 'Monitoring',
    title: 'Devices',
    description: 'Manage devices, metrics, location, alarms, and credentials.',
    icon: Radio,
  },
  history: {
    section: 'Monitoring',
    title: 'History',
    description: 'Review telemetry records, analytics, and export CSV data.',
    icon: HistoryIcon,
  },
  alarms: {
    section: 'Events',
    title: 'Alarm Center',
    description:
      'Track active alarms, rules, acknowledgement, and alarm history.',
    icon: ShieldAlert,
  },
  notifications: {
    section: 'Events',
    title: 'Notifications',
    description: 'Review system notifications and unread operational events.',
    icon: Bell,
  },
  activity: {
    section: 'Events',
    title: 'Activity',
    description: 'Review realtime device, alarm, and system activity logs.',
    icon: Activity,
  },
  'system-health': {
    section: 'System',
    title: 'System Health',
    description:
      'Monitor backend connectivity, latency, and runtime diagnostics.',
    icon: HeartPulse,
  },
  profile: {
    section: 'Account',
    title: 'Profile',
    description: 'Manage account details, security, and recent activity.',
    icon: User,
  },
  settings: {
    section: 'Account',
    title: 'Settings',
    description: 'Configure interface preferences and workspace behavior.',
    icon: SettingsIcon,
  },
  'device-detail': {
    section: 'Monitoring',
    title: 'Device Detail',
    description: 'Realtime metrics, timeline, chart, and device information.',
    icon: Gauge,
  },
}

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

function WorkspaceRouteBar({
  page,
  onNavigate,
  onBackToDashboard,
  onOpenHelp,
}) {
  const meta = PAGE_META[page] || PAGE_META.dashboard
  const Icon = meta.icon

  return (
    <div className="workspace-route-bar">
      <div className="workspace-route-main">
        <span className="workspace-route-icon">
          <Icon size={18} />
        </span>

        <div className="workspace-route-copy">
          <div className="workspace-breadcrumb">
            <button type="button" onClick={() => onNavigate('dashboard')}>
              dotWatch
            </button>
            <span>/</span>
            <span>{meta.section}</span>
            <span>/</span>
            <strong>{meta.title}</strong>
          </div>

          <p>{meta.description}</p>
        </div>
      </div>

      <div className="workspace-route-actions">
        <button
          type="button"
          className="ghost-button workspace-command-button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent('dotwatchOpenCommandPalette'))
          }
          title="Open command palette"
        >
          <Command size={16} />
          <span>Ctrl K</span>
        </button>

        <button
          type="button"
          className="ghost-button workspace-help-button"
          onClick={onOpenHelp}
          title="Open workspace guide"
        >
          <HelpCircle size={16} />
          <span>Help</span>
        </button>

        {page === 'device-detail' ? (
          <button
            type="button"
            className="secondary-button"
            onClick={onBackToDashboard}
          >
            Back to Dashboard
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate('history')}
            >
              History
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate('system-health')}
            >
              System Health
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function CommandPalette({ open, page, onClose, onNavigate }) {
  const [query, setQuery] = useState('')

  const commands = useMemo(
    () =>
      Object.entries(PAGE_META)
        .filter(([id]) => id !== 'device-detail')
        .map(([id, meta]) => ({
          id,
          title: meta.title,
          section: meta.section,
          description: meta.description,
          icon: meta.icon,
        })),
    []
  )

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return commands

    return commands.filter((command) => {
      const haystack = [
        command.title,
        command.section,
        command.description,
        command.id,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [commands, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  if (!open) return null

  function handleNavigate(nextPage) {
    onNavigate(nextPage)
    onClose()
  }

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <section
        className="command-palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-search">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Search pages or actions..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'Enter' && filteredCommands[0]) {
                handleNavigate(filteredCommands[0].id)
              }
            }}
          />
          <span>ESC</span>
        </div>

        <div className="command-palette-list">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              <strong>No command found</strong>
              <span>Try Dashboard, Devices, History, Alarms, or Settings.</span>
            </div>
          ) : (
            filteredCommands.map((command) => {
              const Icon = command.icon
              const active = command.id === page

              return (
                <button
                  key={command.id}
                  type="button"
                  className={`command-palette-item ${active ? 'active' : ''}`}
                  onClick={() => handleNavigate(command.id)}
                >
                  <span className="command-palette-icon">
                    <Icon size={18} />
                  </span>

                  <span className="command-palette-copy">
                    <strong>{command.title}</strong>
                    <small>
                      {command.section} · {command.description}
                    </small>
                  </span>

                  {active && (
                    <span className="command-palette-current">Current</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

function WorkspaceHelp({ open, onClose, onNavigate }) {
  if (!open) return null

  const shortcuts = [
    { keys: 'Ctrl / ⌘ + K', label: 'Open command palette' },
    { keys: 'ESC', label: 'Close modal or palette' },
    { keys: 'Enter', label: 'Open first command result' },
  ]

  const quickLinks = [
    { id: 'dashboard', label: 'View operations overview' },
    { id: 'devices', label: 'Manage devices and metrics' },
    { id: 'history', label: 'Review telemetry history' },
    { id: 'alarms', label: 'Check active alarms' },
    { id: 'activity', label: 'Review operations activity' },
    { id: 'system-health', label: 'Run system diagnostics' },
  ]

  function openPage(pageId) {
    onNavigate(pageId)
    onClose()
  }

  return (
    <div className="workspace-help-backdrop" onMouseDown={onClose}>
      <section
        className="workspace-help-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workspace-help-header">
          <div>
            <span className="page-eyebrow">Workspace Guide</span>
            <h2>dotWatch Quick Help</h2>
            <p>
              Use these shortcuts and quick links to move around the platform
              faster.
            </p>
          </div>

          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="workspace-help-grid">
          <div className="workspace-help-card">
            <h3>Keyboard Shortcuts</h3>
            <div className="workspace-shortcut-list">
              {shortcuts.map((shortcut) => (
                <div key={shortcut.keys}>
                  <kbd>{shortcut.keys}</kbd>
                  <span>{shortcut.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="workspace-help-card">
            <h3>Quick Actions</h3>
            <div className="workspace-quick-link-list">
              {quickLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => openPage(link.id)}
                >
                  <strong>{PAGE_META[link.id]?.title || link.id}</strong>
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function App() {
  const { user, authLoading, logout } = useAuth()

  const [page, setPage] = useState('dashboard')
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [workspaceHelpOpen, setWorkspaceHelpOpen] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen')
    return saved ? JSON.parse(saved) : true
  })

  const currentPageMeta = useMemo(
    () => PAGE_META[page] || PAGE_META.dashboard,
    [page]
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    applyUiPreferences()

    window.addEventListener('dotwatchUiSettingsChanged', applyUiPreferences)
    window.addEventListener('storage', applyUiPreferences)

    return () => {
      window.removeEventListener(
        'dotwatchUiSettingsChanged',
        applyUiPreferences
      )
      window.removeEventListener('storage', applyUiPreferences)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    document.title = 'dotWatch'
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
      'dotwatchOpenCommandPalette',
      handleOpenCommandPalette
    )

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(
        'dotwatchOpenCommandPalette',
        handleOpenCommandPalette
      )
    }
  }, [])

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

        <WorkspaceRouteBar
          page={page}
          onNavigate={handleSetPage}
          onBackToDashboard={backToDashboard}
          onOpenHelp={() => setWorkspaceHelpOpen(true)}
        />

        {page === 'dashboard' && <Dashboard onOpenDevice={openDeviceDetail} />}

        {page === 'devices' && <Devices />}

        {page === 'history' && <History />}

        {page === 'alarms' && <Alarms />}

        {page === 'notifications' && <NotificationCenter />}

        {page === 'activity' && <ActivityCenter />}

        {page === 'system-health' && <SystemHealth />}

        {page === 'device-detail' && (
          <DeviceDetail deviceId={selectedDeviceId} onBack={backToDashboard} />
        )}

        {page === 'profile' && <Profile />}

        {page === 'settings' && <Settings />}

        <CommandPalette
          open={commandPaletteOpen}
          page={page}
          onClose={() => setCommandPaletteOpen(false)}
          onNavigate={handleSetPage}
        />

        <WorkspaceHelp
          open={workspaceHelpOpen}
          onClose={() => setWorkspaceHelpOpen(false)}
          onNavigate={handleSetPage}
        />

        <AlarmToast />
      </main>
    </div>
  )
}

export default App
