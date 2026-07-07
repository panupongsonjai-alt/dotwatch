import { signOut } from 'firebase/auth'
import { LogOut, Search, Shield } from 'lucide-react'
import { auth } from '../../services/firebase'

function AdminTopbar({ adminUser }) {
  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <header className="admin-topbar">
      <div>
        <p className="eyebrow">dotWatch Control Center</p>
        <h1>Admin Console</h1>
      </div>

      <div className="admin-topbar-actions">
        <label className="admin-search">
          <Search size={16} />
          <input type="search" placeholder="Search user, device, email..." />
        </label>

        <div className="admin-profile-pill">
          <Shield size={16} />
          <span>{adminUser?.role || 'Admin'}</span>
        </div>

        <button
          type="button"
          className="admin-signout-button"
          onClick={handleSignOut}
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  )
}

export default AdminTopbar
