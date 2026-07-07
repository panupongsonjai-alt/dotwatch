import StatCard from '../components/common/StatCard'

function AdminSystem() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Infrastructure</p>
          <h2>System</h2>
        </div>
      </div>

      <div className="admin-stat-grid">
        <StatCard label="Backend API" value="Online" helper="http://localhost:4000" tone="success" />
        <StatCard label="Database" value="Healthy" helper="PostgreSQL / TimescaleDB" tone="success" />
        <StatCard label="WebSocket" value="Ready" helper="Realtime service" tone="success" />
        <StatCard label="Ingest Rate" value="Normal" helper="No throttling" />
      </div>

      <article className="admin-panel">
        <div className="panel-header">
          <h3>System Notes</h3>
          <span>Phase 1</span>
        </div>

        <p className="muted-text">
          This page is prepared for backend health checks, websocket client count,
          database status, and ingest monitoring.
        </p>
      </article>
    </section>
  )
}

export default AdminSystem
