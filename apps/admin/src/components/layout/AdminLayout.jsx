import AdminSidebar from './AdminSidebar'
import AdminTopbar from './AdminTopbar'

function AdminLayout({
  activePage,
  adminUser,
  onNavigate,
  sidebarOpen,
  setSidebarOpen,
  theme,
  setTheme,
  children,
}) {
  return (
    <div className={`admin-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <AdminSidebar
        activePage={activePage}
        onNavigate={onNavigate}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <main className="admin-main">
        <AdminTopbar
          activePage={activePage}
          adminUser={adminUser}
          onNavigate={onNavigate}
          theme={theme}
          setTheme={setTheme}
        />

        <div className="admin-content">{children}</div>
      </main>
    </div>
  )
}

export default AdminLayout
