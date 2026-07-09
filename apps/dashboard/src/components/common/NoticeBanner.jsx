function NoticeBanner({
  type = 'info',
  title,
  message,
  action,
  onDismiss,
}) {
  if (!title && !message) return null

  return (
    <div className={`dw-notice-banner ${type}`} role="status">
      <div>
        {title && <strong>{title}</strong>}
        {message && <span>{message}</span>}
      </div>

      {action && <div className="dw-notice-action">{action}</div>}

      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notice">
          ×
        </button>
      )}
    </div>
  )
}

export default NoticeBanner
