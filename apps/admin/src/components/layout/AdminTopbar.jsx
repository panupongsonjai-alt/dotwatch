import { signOut } from 'firebase/auth'
import { LogOut, Moon, Search, Shield, Sun } from 'lucide-react'
import { auth } from '../../services/firebase'
import { ADMIN_PAGE_META } from '../../config/adminPages'

function AdminTopbar({ activePage, adminUser, onNavigate, theme, setTheme }) {
  const meta = ADMIN_PAGE_META[activePage] || ADMIN_PAGE_META.overview
  const displayName =
    adminUser?.name || adminUser?.email?.split('@')[0] || adminUser?.role || 'Admin'

  async function handleSignOut() {
    if (auth) {
      await signOut(auth)
    }
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handleSearchKeyDown(event) {
    if (event.key !== 'Enter') return

    const query = event.currentTarget.value.trim().toLowerCase()

    if (!query) return

    const matchedPage = Object.entries(ADMIN_PAGE_META).find(([id, pageMeta]) => {
      return [id, pageMeta.title, pageMeta.section, pageMeta.description]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })

    if (matchedPage) {
      onNavigate(matchedPage[0])
      event.currentTarget.value = ''
    }
  }

  return (
    <header className="admin-topbar top-header">
      <div className="admin-topbar-title">
        <p className="eyebrow page-eyebrow">{meta.section}</p>
        <h1>{meta.title}</h1>
      </div>

      <div className="admin-topbar-actions header-actions">
        <label className="admin-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search admin pages..."
            onKeyDown={handleSearchKeyDown}
          />
        </label>

        <button
          type="button"
          className="icon-button"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="admin-profile-pill header-user" title={adminUser?.email || displayName}>
          <Shield size={16} />
          <span>{adminUser?.role || displayName}</span>
        </div>

        <button
          type="button"
          className="admin-signout-button logout-button"
          onClick={handleSignOut}
          title="Sign out"
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  )
}

export default AdminTopbar
