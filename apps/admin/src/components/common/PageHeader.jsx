function PageHeader({ eyebrow, title, description, actions, meta }) {
  return (
    <section className="dw-page-header admin-page-header">
      <div className="dw-page-header-main">
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {meta && <div className="dw-page-header-meta">{meta}</div>}
      </div>

      {actions && <div className="dw-page-header-actions">{actions}</div>}
    </section>
  )
}

export default PageHeader
