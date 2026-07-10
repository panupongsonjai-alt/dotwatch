import LoadingState from '../components/common/LoadingState'
import StatCard from '../components/common/StatCard'
import StatusBadge from '../components/common/StatusBadge'
import { formatNumber } from '../utils/formatters'

function AdminOverview({ stats, users, devices, loading }) {
  const recentUsers = users.slice(0, 5)
  const latestDevices = devices.slice(0, 5)

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">System overview</p>
          <h2>Platform health</h2>
        </div>
        <span className="page-chip">API service layer ready</span>
      </div>

      <div className="admin-stat-grid">
        <StatCard
          label="Total Users"
          value={formatNumber(stats.totalUsers)}
          helper="All accounts"
        />
        <StatCard
          label="Active Users"
          value={formatNumber(stats.activeUsers)}
          helper="Can access dashboard"
          tone="success"
        />
        <StatCard
          label="Suspended"
          value={formatNumber(stats.suspendedUsers)}
          helper="Blocked accounts"
          tone="danger"
        />
        <StatCard
          label="Total Devices"
          value={formatNumber(stats.totalDevices)}
          helper="Across all users"
        />
        <StatCard
          label="Online Devices"
          value={formatNumber(stats.onlineDevices)}
          helper="Reporting now"
          tone="success"
        />
        <StatCard
          label="Offline Devices"
          value={formatNumber(stats.offlineDevices)}
          helper="Need attention"
          tone="warning"
        />
      </div>

      {loading ? (
        <LoadingState title="Loading overview..." />
      ) : (
        <div className="admin-two-column">
          <article className="admin-panel">
            <div className="panel-header">
              <h3>Recent Users</h3>
              <span>{recentUsers.length} accounts</span>
            </div>

            <div className="admin-list">
              {recentUsers.map((user) => (
                <div className="admin-list-row" key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <StatusBadge status={user.status} />
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel">
            <div className="panel-header">
              <h3>Latest Devices</h3>
              <span>{latestDevices.length} devices</span>
            </div>

            <div className="admin-list">
              {latestDevices.map((device) => (
                <div className="admin-list-row" key={device.id}>
                  <div>
                    <strong>{device.name}</strong>
                    <span>
                      {device.deviceCode} · {device.owner}
                    </span>
                  </div>
                  <StatusBadge status={device.status} />
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}

export default AdminOverview
