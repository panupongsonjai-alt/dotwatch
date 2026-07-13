import AdminSidebar from './AdminSidebar'
import AdminTopbar from './AdminTopbar'

function AdminLayout({
  activePage,
  adminUser,
  onNavigate,
  sidebarOpen,
  setSidebarOpen,
  isMobileViewport,
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
        isMobile={isMobileViewport}
      />

      <button
        type="button"
        className={`admin-sidebar-backdrop ${
          isMobileViewport && sidebarOpen ? 'visible' : ''
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-label="Close admin navigation menu"
        tabIndex={isMobileViewport && sidebarOpen ? 0 : -1}
      />

      <main className="admin-main">
        <AdminTopbar
          activePage={activePage}
          adminUser={adminUser}
          onNavigate={onNavigate}
          theme={theme}
          setTheme={setTheme}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />

        <div className="admin-content">{children}</div>
      </main>
    </div>
  )
}

export default AdminLayout
