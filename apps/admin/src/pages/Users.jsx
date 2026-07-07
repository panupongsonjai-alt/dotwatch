import { useMemo, useState } from 'react'

function getInitials(name = '', email = '') {
  const source = name || email || 'Admin User'
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function normalizeText(value) {
  return String(value || '').toLowerCase()
}

function Users({ users, loading, onUpdateUserStatus }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchableText = [
        user.name,
        user.displayName,
        user.email,
        user.role,
        user.plan,
        user.status,
      ]
        .map(normalizeText)
        .join(' ')

      const matchedQuery = searchableText.includes(normalizeText(query))
      const matchedStatus =
        statusFilter === 'all' ? true : user.status === statusFilter

      return matchedQuery && matchedStatus
    })
  }, [query, statusFilter, users])

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">User management</p>
          <h1>Users</h1>
          <span>View customer accounts, subscription state, and access status.</span>
        </div>
      </div>

      <div className="toolbar-card">
        <label className="search-box">
          <span>⌕</span>
          <input
            type="search"
            placeholder="Search name, email, plan, role..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <article className="table-card">
        <div className="table-header">
          <h2>All Users</h2>
          <span>{filteredUsers.length} records</span>
        </div>

        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Device Limit</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7">Loading users...</td>
                </tr>
              ) : filteredUsers.length ? (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar">
                          {getInitials(user.name || user.displayName, user.email)}
                        </span>
                        <div>
                          <strong>{user.name || user.displayName || 'Unnamed user'}</strong>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{user.role || 'user'}</td>
                    <td>{user.plan || '-'}</td>
                    <td>{user.deviceLimit ?? user.device_limit ?? '-'}</td>
                    <td>
                      <span className={`status-badge status-${user.status || 'active'}`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td>{user.lastLoginAt || user.last_login_at || '-'}</td>
                    <td>
                      <div className="action-group">
                        <button
                          type="button"
                          onClick={() => onUpdateUserStatus?.(user.id, 'active')}
                        >
                          Active
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateUserStatus?.(user.id, 'overdue')}
                        >
                          Overdue
                        </button>
                        <button
                          type="button"
                          className="danger-text"
                          onClick={() => onUpdateUserStatus?.(user.id, 'suspended')}
                        >
                          Suspend
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

export default Users
