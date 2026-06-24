import React from 'react'
import { useAlarm } from '../context/AlarmContext'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function Sidebar({ page, setPage, sidebarOpen, setSidebarOpen }) {
  const menus = [
    {
      section: 'Monitor',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'devices', label: 'Devices', icon: '📡' },
        { id: 'history', label: 'History', icon: '📋' },
      ],
    },
    {
      section: 'Events',
      items: [
        { id: 'alarms', label: 'Alarm Center', icon: '🚨', badge: true },
        { id: 'notifications', label: 'Notifications', icon: '🔔', badge: true },
      ],
    },
    {
      section: 'Account',
      items: [
        { id: 'profile', label: 'Profile', icon: '👤' },
        { id: 'settings', label: 'Settings', icon: '⚙️' },
        { id: 'system-health', label: 'System Health', icon: '🩺' },
      ],
    },
  ]

  const { activeAlarmCount } = useAlarm()

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
      <div className="brand">
        <div className="brand-left">
          <span className="brand-dot"></span>

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
        {menus.map((group) => (
          <div key={group.section} className="menu-section">
            <span className="menu-section-label">{group.section}</span>

            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`menu-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
                title={item.label}
              >
                <span className="menu-icon">{item.icon}</span>
                <span className="menu-label">{item.label}</span>

                {item.badge && activeAlarmCount > 0 && (
                  <span className="alarm-badge">{activeAlarmCount}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
