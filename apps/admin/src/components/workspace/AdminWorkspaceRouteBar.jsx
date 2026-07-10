import { Command, HelpCircle } from 'lucide-react'
import { ADMIN_PAGE_META } from '../../config/adminPages'

function AdminWorkspaceRouteBar({ page, onNavigate, onOpenHelp }) {
  const meta = ADMIN_PAGE_META[page] || ADMIN_PAGE_META.overview
  const Icon = meta.icon

  return (
    <div className="workspace-route-bar admin-workspace-route-bar">
      <div className="workspace-route-main">
        <span className="workspace-route-icon">
          <Icon size={18} />
        </span>

        <div className="workspace-route-copy">
          <div className="workspace-breadcrumb">
            <button type="button" onClick={() => onNavigate('overview')}>
              dotWatch Admin
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
            window.dispatchEvent(new CustomEvent('dotwatchAdminOpenCommandPalette'))
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
          title="Open admin guide"
        >
          <HelpCircle size={16} />
          <span>Help</span>
        </button>

        {page !== 'audit' && (
          <button type="button" className="ghost-button" onClick={() => onNavigate('audit')}>
            Audit Logs
          </button>
        )}

        {page !== 'system' && (
          <button type="button" className="ghost-button" onClick={() => onNavigate('system')}>
            System
          </button>
        )}
      </div>
    </div>
  )
}

export default AdminWorkspaceRouteBar
