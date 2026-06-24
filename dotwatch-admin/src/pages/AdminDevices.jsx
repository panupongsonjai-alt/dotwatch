import { useMemo, useState } from 'react'
import LoadingState from '../components/common/LoadingState'
import StatusBadge from '../components/common/StatusBadge'

function AdminDevices({ devices, loading }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchedQuery = [
        device.name,
        device.deviceCode,
        device.owner,
        device.model,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())

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
          <h2>Devices</h2>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search device code, name, owner..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <article className="admin-panel">
        {loading ? (
          <LoadingState title="Loading devices..." />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
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
                {filteredDevices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <strong>{device.name}</strong>
                      <span>{device.deviceCode}</span>
                    </td>
                    <td>{device.owner}</td>
                    <td>{device.model}</td>
                    <td>
                      <StatusBadge status={device.status} />
                    </td>
                    <td>{device.lastSeenAt}</td>
                    <td>{device.firmwareVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}

export default AdminDevices
