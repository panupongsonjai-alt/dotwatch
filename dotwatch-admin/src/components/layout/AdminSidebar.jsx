import {
  Activity,
  Bell,
  CreditCard,
  Database,
  LayoutDashboard,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'

const MENU_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: MonitorSmartphone,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: CreditCard,
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    icon: Bell,
  },
  {
    id: 'system',
    label: 'System',
    icon: Database,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
  },
]

function AdminSidebar({ activePage, onNavigate }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <div className="admin-brand-mark">
          <Activity size={20} />
        </div>
        <div>
          <strong>dotWatch</strong>
          <span>Admin Console</span>
        </div>
      </div>

      <nav className="admin-nav">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activePage === item.id

          return (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="admin-sidebar-card">
        <ShieldCheck size={18} />
        <div>
          <strong>Super Admin</strong>
          <span>Full system access</span>
        </div>
      </div>
    </aside>
  )
}

export default AdminSidebar
