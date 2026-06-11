import React from 'react'
import { Battery, Droplets, Thermometer } from 'lucide-react'

function DeviceCard({ device }) {
  return (
    <article className="device-card">
      <div className="device-header">
        <div>
          <h3>{device.name || 'Unnamed Device'}</h3>
          <p>{device.deviceId || device.id}</p>
        </div>

        <span
          className={
            device.status === 'online'
              ? 'status online'
              : 'status offline'
          }
        >
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
          <small>Temp</small>
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

        <div className="metric">
          <Battery size={18} />
          <span>
            {device.battery != null
              ? Number(device.battery).toFixed(1)
              : '--'}
            %
          </span>
          <small>Battery</small>
        </div>
      </div>

      <p className="last-seen">
        Last seen: {device.lastSeen || 'ยังไม่มีข้อมูล'}
      </p>
    </article>
  )
}

export default DeviceCard