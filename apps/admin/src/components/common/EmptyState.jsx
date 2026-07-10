function EmptyState({ title = 'No data', description, action }) {
  return (
    <div className="dw-empty-state admin-empty-state">
      <div className="dw-empty-icon">•</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="dw-empty-action">{action}</div>}
    </div>
  )
}

export default EmptyState
