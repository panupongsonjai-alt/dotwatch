import LoadingState from '../components/common/LoadingState'
import StatCard from '../components/common/StatCard'
import StatusBadge from '../components/common/StatusBadge'
import { formatDatabaseUsageGb, formatNumber } from '../utils/formatters'

const OVERVIEW_LIST_LIMIT = 12

function getValue(item, keys, fallback = '-') {
  for (const key of keys) {
    const value = item?.[key]

    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return fallback
}

function AdminOverview({ stats, users, devices, loading }) {
  const recentUsers = users.slice(0, OVERVIEW_LIST_LIMIT)
  const latestDevices = devices.slice(0, OVERVIEW_LIST_LIMIT)

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
        <div className="admin-overview-record-lists">
          <article className="admin-panel admin-overview-record-panel">
            <div className="panel-header admin-overview-record-header">
              <div>
                <h3>Recent Users</h3>
                <p>Latest accounts added to the platform.</p>
              </div>
              <span>
                Showing {recentUsers.length} of {formatNumber(users.length)}
              </span>
            </div>

            <div className="admin-overview-record-list" role="list">
              <div className="admin-overview-record-columns" aria-hidden="true">
                <span>User</span>
                <span>Plan</span>
                <span>Database Usage</span>
                <span>Created</span>
                <span>Status</span>
              </div>

              {recentUsers.length ? (
                recentUsers.map((user) => (
                  <div
                    className="admin-overview-record-row admin-overview-user-row"
                    key={user.id}
                    role="listitem"
                  >
                    <div className="admin-overview-record-primary">
                      <strong>{getValue(user, ['name'], 'Unnamed user')}</strong>
                      <span>{getValue(user, ['email'])}</span>
                    </div>
                    <span className="admin-overview-record-value">
                      {getValue(user, ['plan', 'planName', 'plan_name'])}
                    </span>
                    <span
                      className="admin-overview-record-value admin-overview-record-storage"
                      title={
                        user.databaseUsagePending
                          ? 'Database usage is being calculated'
                          : `Calculated ${getValue(user, ['databaseUsageCalculatedAt'])}`
                      }
                    >
                      {user.databaseUsagePending
                        ? 'Calculating...'
                        : formatDatabaseUsageGb(user.databaseUsageBytes)}
                    </span>
                    <span className="admin-overview-record-value">
                      {getValue(user, ['createdAt', 'created_at'])}
                    </span>
                    <div className="admin-overview-record-status">
                      <StatusBadge status={user.status} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-overview-record-empty">No users found.</div>
              )}
            </div>
          </article>

          <article className="admin-panel admin-overview-record-panel">
            <div className="panel-header admin-overview-record-header">
              <div>
                <h3>Latest Devices</h3>
                <p>Most recently available devices across all users.</p>
              </div>
              <span>
                Showing {latestDevices.length} of {formatNumber(devices.length)}
              </span>
            </div>

            <div className="admin-overview-record-list" role="list">
              <div className="admin-overview-record-columns admin-overview-device-columns" aria-hidden="true">
                <span>Device</span>
                <span>Owner</span>
                <span>Model</span>
                <span>Last Seen</span>
                <span>Status</span>
              </div>

              {latestDevices.length ? (
                latestDevices.map((device) => (
                  <div
                    className="admin-overview-record-row admin-overview-device-row"
                    key={device.id}
                    role="listitem"
                  >
                    <div className="admin-overview-record-primary">
                      <strong>{getValue(device, ['name'], 'Unnamed device')}</strong>
                      <span>{getValue(device, ['deviceCode', 'device_code'])}</span>
                    </div>
                    <span className="admin-overview-record-value">
                      {getValue(device, ['owner', 'email', 'user_email'])}
                    </span>
                    <span className="admin-overview-record-value">
                      {getValue(device, ['model', 'modelName', 'model_name'])}
                    </span>
                    <span className="admin-overview-record-value">
                      {getValue(device, ['lastSeenAt', 'last_seen_at'])}
                    </span>
                    <div className="admin-overview-record-status">
                      <StatusBadge status={device.status} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-overview-record-empty">No devices found.</div>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}

export default AdminOverview
