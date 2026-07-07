function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

function getRecentItems(items, limit = 5) {
  return Array.isArray(items) ? items.slice(0, limit) : []
}

function StatCard({ label, value, hint, tone = '' }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-icon">{label.slice(0, 1)}</div>
      <div>
        <p>{label}</p>
        <h3>{formatNumber(value)}</h3>
        {hint ? <small>{hint}</small> : null}
      </div>
    </article>
  )
}

function HealthRow({ title, detail, status }) {
  return (
    <div className="health-row">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <span className={`status-badge status-${status}`}>{status}</span>
    </div>
  )
}

function AdminDashboard({ stats, users, devices, auditLogs, loading, onNavigate }) {
  const recentUsers = getRecentItems(users)
  const recentDevices = getRecentItems(devices)
  const recentLogs = getRecentItems(auditLogs)

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin control center</p>
          <h1>dotWatch Admin</h1>
          <span>Manage users, devices, billing status, and system activity.</span>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => onNavigate?.('users')}
        >
          Manage users
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Users"
          value={stats.totalUsers}
          hint={`${stats.activeUsers || 0} active`}
        />
        <StatCard
          label="Devices"
          value={stats.totalDevices}
          hint={`${stats.onlineDevices || 0} online`}
          tone="tone-green"
        />
        <StatCard
          label="Warnings"
          value={(stats.warningDevices || 0) + (stats.overdueUsers || 0)}
          hint="Need attention"
          tone="tone-purple"
        />
        <StatCard
          label="Offline"
          value={(stats.offlineDevices || 0) + (stats.suspendedUsers || 0)}
          hint="Users/devices blocked"
          tone="tone-red"
        />
      </div>

      <div className="content-grid two-columns">
        <article className="panel-card">
          <div className="panel-header">
            <div>
              <h2>System Health</h2>
              <p>Quick status for core admin services.</p>
            </div>
          </div>

          <div className="health-list">
            <HealthRow title="Backend API" detail="Admin API endpoint" status="online" />
            <HealthRow title="Database" detail="PostgreSQL / TimescaleDB" status="online" />
            <HealthRow title="Realtime" detail="WebSocket broadcast" status="online" />
            <HealthRow
              title="Audit Logs"
              detail={loading ? 'Checking logs...' : `${recentLogs.length} recent records`}
              status={recentLogs.length ? 'online' : 'warning'}
            />
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-header">
            <div>
              <h2>Recent Activity</h2>
              <p>Latest admin and system events.</p>
            </div>
          </div>

          <div className="timeline-list">
            {recentLogs.length ? (
              recentLogs.map((log) => (
                <div className="timeline-item" key={log.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{log.action || 'Activity'}</strong>
                    <span>{log.detail || '-'}</span>
                    <small>
                      {log.actor || 'System'} · {log.createdAt || log.created_at || '-'}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <div className="health-row">
                <div>
                  <strong>No activity yet</strong>
                  <span>Audit logs will appear here after admin actions.</span>
                </div>
              </div>
            )}
          </div>
        </article>
      </div>

      <div className="content-grid two-columns" style={{ marginTop: 18 }}>
        <article className="table-card">
          <div className="table-header">
            <h2>Recent Users</h2>
            <button type="button" className="ghost-button" onClick={() => onNavigate?.('users')}>
              View all
            </button>
          </div>

          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name || user.displayName || 'Unnamed user'}</strong>
                      <span>{user.email}</span>
                    </td>
                    <td>{user.plan || '-'}</td>
                    <td>
                      <span className={`status-badge status-${user.status || 'active'}`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="table-card">
          <div className="table-header">
            <h2>Recent Devices</h2>
            <button type="button" className="ghost-button" onClick={() => onNavigate?.('devices')}>
              View all
            </button>
          </div>

          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentDevices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <strong>{device.name || 'Unnamed device'}</strong>
                      <span>{device.deviceCode || device.device_code || '-'}</span>
                    </td>
                    <td>{device.owner || device.email || '-'}</td>
                    <td>
                      <span className={`status-badge status-${device.status || 'offline'}`}>
                        {device.status || 'offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  )
}

export default AdminDashboard
