function normalizeStatus(status = 'offline') {
  const value = String(status || 'offline').toLowerCase()

  if (value === 'online' || value === 'healthy' || value === 'active' || value === 'success') {
    return 'active'
  }

  if (value === 'warning' || value === 'overdue') return 'warning'
  if (value === 'critical' || value === 'suspended' || value === 'danger' || value === 'error') return 'critical'
  if (value === 'acknowledged' || value === 'admin' || value === 'super_admin') return 'acknowledged'

  return 'offline'
}

function StatusBadge({ status = 'unknown', label, size = 'md', withDot = true }) {
  const normalizedStatus = normalizeStatus(status)
  const displayLabel = label || status || 'unknown'

  return (
    <span className={`dw-status-badge status-badge ${normalizedStatus} status-${status} ${size}`}>
      {withDot && <span className="dw-status-dot" />}
      {displayLabel}
    </span>
  )
}

export default StatusBadge
