import { ADMIN_PAGE_META, ADMIN_QUICK_LINKS } from '../../config/adminPages'

function AdminWorkspaceHelp({ open, onClose, onNavigate }) {
  if (!open) return null

  const shortcuts = [
    { keys: 'Ctrl / ⌘ + K', label: 'Open admin command palette' },
    { keys: 'ESC', label: 'Close modal or palette' },
    { keys: 'Enter', label: 'Open first command result' },
  ]

  function openPage(pageId) {
    onNavigate(pageId)
    onClose()
  }

  return (
    <div className="workspace-help-backdrop" onMouseDown={onClose}>
      <section
        className="workspace-help-panel admin-workspace-help-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workspace-help-header">
          <div>
            <span className="page-eyebrow">Admin Workspace Guide</span>
            <h2>dotWatch Admin Quick Help</h2>
            <p>
              Use the same workspace navigation pattern as Dashboard while keeping
              admin-only pages, permissions, and API data separate.
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
              {ADMIN_QUICK_LINKS.map((link) => (
                <button key={link.id} type="button" onClick={() => openPage(link.id)}>
                  <strong>{ADMIN_PAGE_META[link.id]?.title || link.id}</strong>
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

export default AdminWorkspaceHelp
