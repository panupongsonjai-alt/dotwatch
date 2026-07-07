import React from 'react'
import { Moon, Sun, LogOut } from 'lucide-react'

function Navbar({ user, onLogout, theme, setTheme }) {
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User'

  return (
    <header className="top-header">
      <div className="header-actions">
        <button
          type="button"
          className="icon-button"
          onClick={toggleTheme}
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="header-user">
          <div className="icon-button user-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={onLogout}
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}

export default Navbar
