import EmptyState from './EmptyState.jsx'
import StatusBadge from './StatusBadge.jsx'

function formatActivityTime(value) {
  if (!value) return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleString('th-TH')
}

function getActivityIcon(activity) {
  const type = String(activity?.activity_type || activity?.type || '').toLowerCase()
  const severity = String(activity?.severity || '').toLowerCase()

  if (type.includes('alarm')) return '🚨'
  if (type.includes('offline') || severity === 'danger') return '🔴'
  if (type.includes('online') || severity === 'success') return '🟢'
  if (type.includes('reading')) return '📡'
  if (type.includes('device')) return '📟'
  if (type.includes('user')) return '👤'

  return '•'
}

function getActivityTone(activity) {
  const severity = String(activity?.severity || 'info').toLowerCase()

  if (severity === 'danger' || severity === 'critical') return 'critical'
  if (severity === 'warning') return 'warning'
  if (severity === 'success') return 'online'
  return 'acknowledged'
}

function getActivityKey(activity, index) {
  return activity?.id || `${activity?.activity_type || 'activity'}-${activity?.created_at || index}`
}

function ActivityList({
  activities = [],
  loading = false,
  emptyTitle = 'No activity yet',
  emptyDescription = 'Recent system events will appear here.',
  compact = false,
}) {
  if (loading) {
    return (
      <div className={`dw-activity-list ${compact ? 'compact' : ''}`}>
        {[0, 1, 2].map((item) => (
          <div key={item} className="dw-activity-item loading">
            <span className="dw-activity-icon" />
            <div>
              <strong>Loading activity...</strong>
              <p>กำลังดึงข้อมูลกิจกรรมล่าสุด</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className={`dw-activity-list ${compact ? 'compact' : ''}`}>
      {activities.map((activity, index) => (
        <article key={getActivityKey(activity, index)} className="dw-activity-item">
          <div className={`dw-activity-icon ${getActivityTone(activity)}`}>
            {getActivityIcon(activity)}
          </div>

          <div className="dw-activity-content">
            <div className="dw-activity-title-row">
              <strong>{activity.title || 'System activity'}</strong>
              <time>{formatActivityTime(activity.created_at || activity.createdAt)}</time>
            </div>

            {(activity.description || activity.activity_type) && (
              <p>{activity.description || activity.activity_type}</p>
            )}

            <div className="dw-activity-meta">
              {activity.activity_type && (
                <StatusBadge
                  status={getActivityTone(activity)}
                  label={activity.activity_type}
                  size="sm"
                />
              )}
              {activity.device_name && <span>{activity.device_name}</span>}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export default ActivityList
