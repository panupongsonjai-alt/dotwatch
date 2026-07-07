function EmptyState({ title = 'No data', description }) {
  return (
    <div className="admin-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  )
}

export default EmptyState
