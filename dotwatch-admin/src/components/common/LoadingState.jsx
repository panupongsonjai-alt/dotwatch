function LoadingState({ title = 'Loading data...' }) {
  return (
    <div className="admin-loading-state">
      <span className="admin-spinner" />
      <strong>{title}</strong>
    </div>
  )
}

export default LoadingState
