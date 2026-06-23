function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <article className={`dw-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  )
}

export default StatCard
