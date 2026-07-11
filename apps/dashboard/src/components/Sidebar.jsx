import { useAlarm } from '../context/AlarmContext'
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  History,
  LayoutDashboard,
  Radio,
  Settings,
  ShieldAlert,
  User,
} from 'lucide-react'

const MENU_GROUPS = [
  {
    section: 'Monitoring',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'devices', label: 'Devices', icon: Radio },
      { id: 'history', label: 'History', icon: History },
    ],
  },
  {
    section: 'Events',
    items: [
      { id: 'alarms', label: 'Alarm Center', icon: ShieldAlert, badge: true },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: true },
      { id: 'activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    section: 'System',
    items: [{ id: 'system-health', label: 'System Health', icon: HeartPulse }],
  },
  {
    section: 'Account',
    items: [
      { id: 'profile', label: 'Profile', icon: User },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

function Sidebar({ page, setPage, sidebarOpen, setSidebarOpen }) {
  const { activeAlarmCount } = useAlarm()

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
      <div className="brand">
        <div className="brand-left">
          <span className="brand-dot" />

          <div className="brand-text">
            <strong>dotWatch</strong>
            <small>IoT Easy Monitoring</small>
          </div>
        </div>

        <button
          type="button"
          className="collapse-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="menu">
        {MENU_GROUPS.map((group) => (
          <div key={group.section} className="menu-section">
            <span className="menu-section-label">{group.section}</span>

            {group.items.map((item) => {
              const Icon = item.icon
              const showBadge = item.badge && activeAlarmCount > 0

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`menu-item ${page === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setPage(item.id)

                    if (window.innerWidth <= 900) {
                      setSidebarOpen(false)
                    }
                  }}
                  title={item.label}
                >
                  <span className="menu-icon">
                    <Icon size={20} />
                  </span>

                  <span className="menu-label">{item.label}</span>

                  {showBadge && (
                    <span className="alarm-badge">{activeAlarmCount}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
