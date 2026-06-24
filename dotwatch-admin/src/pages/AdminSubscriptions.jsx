import LoadingState from '../components/common/LoadingState'
import StatusBadge from '../components/common/StatusBadge'
import UsageBar from '../components/common/UsageBar'

function AdminSubscriptions({ users, loading }) {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Billing control</p>
          <h2>Subscriptions</h2>
        </div>
      </div>

      <article className="admin-panel">
        {loading ? (
          <LoadingState title="Loading subscriptions..." />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Device Usage</th>
                  <th>Renewal</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
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
                    <td>{user.renewalAt}</td>
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

export default AdminSubscriptions
