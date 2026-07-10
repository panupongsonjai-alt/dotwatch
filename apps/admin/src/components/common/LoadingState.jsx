function LoadingState({
  title = 'Loading data...',
  description = 'กำลังโหลดข้อมูลผู้ดูแลระบบล่าสุด',
  rows = 3,
  compact = false,
}) {
  return (
    <div className={`dw-loading-state admin-loading-state ${compact ? 'compact' : ''}`} role="status">
      <div className="dw-loading-spinner admin-spinner" />
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
