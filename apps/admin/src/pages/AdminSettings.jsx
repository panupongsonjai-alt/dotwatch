function AdminSettings() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin preference</p>
          <h2>Settings</h2>
        </div>
      </div>

      <article className="admin-panel settings-panel">
        <label>
          Admin Console Name
          <input type="text" defaultValue="dotWatch Admin" />
        </label>

        <label>
          API URL
          <input type="text" defaultValue="http://localhost:4000" />
        </label>

        <label>
          Support Email
          <input type="email" defaultValue="support@dotwatch.local" />
        </label>

        <button type="button" className="primary-button">
          Save Settings
        </button>
      </article>
    </section>
  )
}

export default AdminSettings
