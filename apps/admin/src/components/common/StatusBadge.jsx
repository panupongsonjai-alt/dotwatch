function StatusBadge({ status = 'unknown' }) {
  return <span className={`status-badge ${status}`}>{status}</span>
}

export default StatusBadge
