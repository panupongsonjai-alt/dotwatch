function SectionHeader({ title, description, actions }) {
  return (
    <div className="dw-section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      {actions && <div className="dw-section-actions">{actions}</div>}
    </div>
  )
}

export default SectionHeader
