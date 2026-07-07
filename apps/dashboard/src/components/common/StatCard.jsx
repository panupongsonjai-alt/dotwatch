function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  compact = false,
  className = '',
}) {
  const classes = [
    'dw-stat-card',
    tone,
    compact ? 'compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={classes}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <small className="stat-hint">{hint}</small>}
    </article>
  )
}

export default StatCard
