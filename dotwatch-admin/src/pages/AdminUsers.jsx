import { useMemo, useState } from 'react'
import LoadingState from '../components/common/LoadingState'
import StatusBadge from '../components/common/StatusBadge'
import UsageBar from '../components/common/UsageBar'

function AdminUsers({ users, loading, onUpdateUserStatus }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchedQuery = [user.name, user.email, user.plan]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())

      const matchedStatus =
        statusFilter === 'all' ? true : user.status === statusFilter

      return matchedQuery && matchedStatus
    })
  }, [query, statusFilter, users])

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Account control</p>
          <h2>Users</h2>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search name, email, plan..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

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

      <article className="admin-panel">
        {loading ? (
          <LoadingState title="Loading users..." />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Devices</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </td>
                    <td>{user.plan}</td>
                    <td>
                      <StatusBadge status={user.status} />
                    </td>
                    <td>
                      <UsageBar user={user} />
                    </td>
                    <td>{user.createdAt}</td>
                    <td>{user.lastLoginAt}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button">View</button>

                        {user.status === 'suspended' ? (
                          <button
                            type="button"
                            className="success"
                            onClick={() =>
                              onUpdateUserStatus(user.id, 'active')
                            }
                          >
                            Activate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              onUpdateUserStatus(user.id, 'suspended')
                            }
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}

export default AdminUsers
