import { Moon, Sun, LogOut } from 'lucide-react'

import { recordUserActivity } from '../services/activityTracker'

function Navbar({ user, onLogout, theme, setTheme }) {
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    void recordUserActivity({
      activityType: 'preference.theme_changed',
      title: 'Theme changed',
      description: `Dashboard theme was changed to ${nextTheme}.`,
      metadata: { theme: nextTheme },
    })
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
