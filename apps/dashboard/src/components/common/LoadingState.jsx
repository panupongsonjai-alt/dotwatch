function LoadingState({
  title = 'Loading...',
  description = 'กำลังโหลดข้อมูลล่าสุด',
  rows = 3,
  compact = false,
}) {
  return (
    <div className={`dw-loading-state ${compact ? 'compact' : ''}`} role="status">
      <div className="dw-loading-spinner" />
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>

      {rows > 0 && (
        <div className="dw-loading-skeleton-list" aria-hidden="true">
          {Array.from({ length: rows }).map((_, index) => (
            <span key={index} className="dw-loading-skeleton" />
          ))}
        </div>
      )}
    </div>
  )
}

export default LoadingState
