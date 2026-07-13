import { useMemo, useState } from 'react'
import UnifiedSelect from '../components/common/UnifiedSelect'

function getValue(item, keys, fallback = '-') {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== '') {
      return item[key]
    }
  }

  return fallback
}

function AdminDevices({ devices, loading }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const searchableText = [
        device.name,
        device.deviceCode,
        device.device_code,
        device.owner,
        device.email,
        device.model,
        device.model_name,
        device.status,
      ]
        .join(' ')
        .toLowerCase()

      const matchedQuery = searchableText.includes(query.toLowerCase())
      const matchedStatus =
        statusFilter === 'all' ? true : device.status === statusFilter

      return matchedQuery && matchedStatus
    })
  }, [devices, query, statusFilter])

  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet control</p>
          <h1>Devices</h1>
          <span>Monitor all devices across users from one admin view.</span>
        </div>
      </div>

      <div className="toolbar-card">
        <label className="search-box">
          <span>⌕</span>
          <input
            type="search"
            placeholder="Search device code, name, owner..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <UnifiedSelect
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </UnifiedSelect>
      </div>

      <article className="table-card">
        <div className="table-header">
          <h2>All Devices</h2>
          <span>{filteredDevices.length} records</span>
        </div>

        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Owner</th>
                <th>Model</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Firmware</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">Loading devices...</td>
                </tr>
              ) : filteredDevices.length ? (
                filteredDevices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <strong>{getValue(device, ['name'], 'Unnamed device')}</strong>
                      <span>{getValue(device, ['deviceCode', 'device_code'])}</span>
                    </td>
                    <td>{getValue(device, ['owner', 'email', 'user_email'])}</td>
                    <td>{getValue(device, ['model', 'modelName', 'model_name'])}</td>
                    <td>
                      <span className={`status-badge status-${device.status || 'offline'}`}>
                        {device.status || 'offline'}
                      </span>
                    </td>
                    <td>{getValue(device, ['lastSeenAt', 'last_seen_at'])}</td>
                    <td>{getValue(device, ['firmwareVersion', 'firmware_version'])}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No devices found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

export default AdminDevices
