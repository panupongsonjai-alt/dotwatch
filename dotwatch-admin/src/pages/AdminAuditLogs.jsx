function AdminAuditLogs({ auditLogs, loading }) {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Security record</p>
          <h1>Audit Logs</h1>
          <span>Track admin actions and important system changes.</span>
        </div>
      </div>

      <article className="panel-card">
        <div className="panel-header">
          <div>
            <h2>Recent Logs</h2>
            <p>{auditLogs.length} records</p>
          </div>
        </div>

        <div className="timeline-list">
          {loading ? (
            <div className="health-row">
              <div>
                <strong>Loading audit logs...</strong>
                <span>Please wait while admin activity is loading.</span>
              </div>
            </div>
          ) : auditLogs.length ? (
            auditLogs.map((log) => (
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
                <strong>No audit logs found</strong>
                <span>Admin actions will be recorded here.</span>
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  )
}

export default AdminAuditLogs
