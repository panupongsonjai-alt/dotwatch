function StatCard({ label, value, helper, hint, tone = 'default', compact = false, className = '' }) {
  const classes = ['dw-stat-card', 'admin-stat-card', tone, compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={classes}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {(helper || hint) && <small className="stat-hint">{helper || hint}</small>}
    </article>
  )
}

export default StatCard
