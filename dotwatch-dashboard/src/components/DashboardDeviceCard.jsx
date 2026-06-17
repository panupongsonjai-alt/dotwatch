import React from 'react'
import { Droplets, Thermometer } from 'lucide-react'

function DashboardDeviceCard({ device }) {
  const statusClass =
    device.status === 'online'
      ? 'status online'
      : device.status === 'warning'
      ? 'status warning'
      : 'status offline'

  return (
    <article className="dashboard-device-card">
      <div className="device-header">
        <div>
          <h3>{device.name || 'Unnamed Device'}</h3>
          <small>{device.deviceId}</small>
        </div>

        <span className={statusClass}>
          {device.status || 'offline'}
        </span>
      </div>

      <div className="metrics-grid">
        <div className="metric">
          <Thermometer size={18} />
          <span>
            {device.temperature != null
              ? Number(device.temperature).toFixed(1)
              : '--'}
            °C
          </span>
          <small>Temperature</small>
        </div>

        <div className="metric">
          <Droplets size={18} />
          <span>
            {device.humidity != null
              ? Number(device.humidity).toFixed(1)
              : '--'}
            %
          </span>
          <small>Humidity</small>
        </div>
      </div>

      <div className="device-footer">
        <small>
          Last Seen:{' '}
          {device.lastSeen
            ? new Date(device.lastSeen).toLocaleString('th-TH')
            : '--'}
        </small>
      </div>
    </article>
  )
}

export default DashboardDeviceCard