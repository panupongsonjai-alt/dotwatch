import AdminSidebar from './AdminSidebar'
import AdminTopbar from './AdminTopbar'

function AdminLayout({ activePage, adminUser, onNavigate, children }) {
  return (
    <div className="admin-shell">
      <AdminSidebar activePage={activePage} onNavigate={onNavigate} />

      <div className="admin-main">
        <AdminTopbar adminUser={adminUser} />

        <main className="admin-content">{children}</main>
      </div>
    </div>
  )
}

export default AdminLayout
