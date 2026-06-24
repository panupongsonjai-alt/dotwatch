function AdminAuditLogs({ auditLogs }) {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Security record</p>
          <h2>Audit Logs</h2>
        </div>
      </div>

      <article className="admin-panel">
        <div className="admin-timeline">
          {auditLogs.map((log) => (
            <div className="timeline-item" key={log.id}>
              <span />
              <div>
                <strong>{log.action}</strong>
                <p>{log.detail}</p>
                <small>
                  {log.actor} · {log.createdAt}
                </small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

export default AdminAuditLogs
