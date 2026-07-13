import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  ADMIN_ACCESS_ICON,
  ADMIN_BRAND_ICON,
  ADMIN_MENU_GROUPS,
} from '../../config/adminPages'

function AdminSidebar({
  activePage,
  onNavigate,
  sidebarOpen,
  setSidebarOpen,
  isMobile,
}) {
  const BrandIcon = ADMIN_BRAND_ICON
  const AccessIcon = ADMIN_ACCESS_ICON

  function handleNavigate(pageId) {
    onNavigate(pageId)

    if (isMobile || window.innerWidth <= 900) {
      setSidebarOpen(false)
    }
  }

  return (
    <aside className={`admin-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
      <div className="admin-brand brand">
        <div className="admin-brand-left brand-left">
          <span className="admin-brand-mark brand-dot">
            <BrandIcon size={20} />
          </span>

          <div className="admin-brand-text brand-text">
            <strong>dotWatch</strong>
            <small>Admin Console</small>
          </div>
        </div>

        <button
          type="button"
          className="admin-sidebar-close-btn"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close admin navigation menu"
        >
          <X size={19} />
        </button>

        <button
          type="button"
          className="collapse-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="admin-nav menu" aria-label="Admin navigation">
        {ADMIN_MENU_GROUPS.map((group) => (
          <div key={group.section} className="admin-menu-section menu-section">
            <span className="admin-menu-section-label menu-section-label">
              {group.section}
            </span>

            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = activePage === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-nav-item menu-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavigate(item.id)}
                  title={item.label}
                >
                  <span className="admin-menu-icon menu-icon">
                    <Icon size={20} />
                  </span>
                  <span className="admin-menu-label menu-label">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="admin-sidebar-card">
        <AccessIcon size={18} />
        <div>
          <strong>Admin Access</strong>
          <span>Role protected workspace</span>
        </div>
      </div>
    </aside>
  )
}

export default AdminSidebar
