function MetricCard({ name, value, unit, icon, metricKey, tone = 'default' }) {
  const displayValue = value == null || value === '' ? '--' : value

  return (
    <article className={`dw-metric-card ${tone}`}>
      <div className="dw-metric-card-top">
        {icon && <span className="dw-metric-icon">{icon}</span>}
        {metricKey && <small>{metricKey}</small>}
      </div>

      <div className="dw-metric-value-row">
        <strong>{displayValue}</strong>
        {unit && <span>{unit}</span>}
      </div>

      <p>{name}</p>
    </article>
  )
}

export default MetricCard
