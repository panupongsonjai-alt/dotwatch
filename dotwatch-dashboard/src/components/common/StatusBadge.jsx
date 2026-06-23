function normalizeStatus(status = 'offline') {
  const value = String(status || 'offline').toLowerCase()

  if (value === 'online' || value === 'healthy' || value === 'active') {
    return value
  }

  if (value === 'warning') return 'warning'
  if (value === 'critical') return 'critical'
  if (value === 'acknowledged') return 'acknowledged'

  return 'offline'
}

function StatusBadge({ status = 'offline', label, size = 'md', withDot = true }) {
  const normalizedStatus = normalizeStatus(status)
  const displayLabel = label || status || 'offline'

  return (
    <span className={`dw-status-badge ${normalizedStatus} ${size}`}>
      {withDot && <span className="dw-status-dot" />}
      {displayLabel}
    </span>
  )
}

export default StatusBadge
