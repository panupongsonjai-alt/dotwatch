import { useEffect, useState } from 'react'
import { getDevice, getDeviceMetrics } from '../services/api'
import ChartWidget from '../components/ChartWidget.jsx'
import { auth } from '../services/firebase'
import { connectRealtime, disconnectRealtime } from '../services/realtime'

function formatValue(value, unit = '') {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return `--${unit}`
  }

  const numberValue = Number(value)
  const displayValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1)

  return `${displayValue}${unit || ''}`
}

function DeviceDetail({ deviceId, onBack }) {
  const [device, setDevice] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadDevice() {
    try {
      setLoading(true)

      const [deviceData, metricData] = await Promise.all([
        getDevice(deviceId),
        getDeviceMetrics(deviceId),
      ])

      setDevice(deviceData)
      setMetrics(Array.isArray(metricData) ? metricData : [])
    } catch (error) {
      console.error(error)
      alert('โหลดข้อมูล Device ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  function getMetricValue(metric) {
    const latestMetrics = device?.latest_metrics || {}
    return latestMetrics[metric.metric_key]
  }

  useEffect(() => {
    const user = auth.currentUser

    if (!user || !deviceId) return

    connectRealtime(user.uid, (payload) => {
      if (payload.type !== 'reading') return

      const reading = payload.data

      if (String(reading.id) !== String(deviceId)) return

      setDevice((prev) => ({
        ...prev,
        ...reading,
        latest_metrics: {
          ...(prev?.latest_metrics || {}),
          ...(reading.latest_metrics || reading.metrics || {}),
        },
        status: reading.status || 'online',
        latest_time: reading.latest_time,
        last_seen_at: reading.last_seen_at,
      }))
    })

    return () => {
      disconnectRealtime()
    }
  }, [deviceId])

  useEffect(() => {
    if (deviceId) loadDevice()
  }, [deviceId])

  if (loading) {
    return (
      <div className="page">
        <div className="panel">กำลังโหลด Device...</div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page">
        <div className="panel">
          <button className="secondary-button" onClick={onBack}>
            ← Back
          </button>
          <p>ไม่พบ Device</p>
        </div>
      </div>
    )
  }

  const visibleMetrics = metrics.filter((metric) => metric.visible !== false)

  return (
    <div className="page">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{device.name || 'Unnamed Device'}</h2>
            <p>
              {device.device_code}
              {device.model_name ? ` • ${device.model_name}` : ''}
            </p>
          </div>

          <button className="secondary-button" onClick={onBack}>
            ← Back
          </button>
        </div>

        <div className="device-detail-grid">
          <div className="summary-card">
            <span>Status</span>
            <strong
              className={
                device.status === 'online' ? 'status-online' : 'status-offline'
              }
            >
              {device.status || 'offline'}
            </strong>
          </div>

          <div className="summary-card">
            <span>Model</span>
            <strong>{device.model_name || '--'}</strong>
          </div>

          <div className="summary-card">
            <span>Firmware</span>
            <strong>{device.firmware_version || '--'}</strong>
          </div>

          <div className="summary-card">
            <span>Health</span>
            <strong>
              {device.status === 'online' ? 'Healthy' : 'Offline'}
            </strong>
          </div>
        </div>

        <div className="device-detail-grid">
          {visibleMetrics.map((metric) => (
            <div key={metric.metric_key} className="summary-card">
              <span>{metric.metric_name}</span>
              <strong>
                {formatValue(getMetricValue(metric), metric.unit)}
              </strong>
            </div>
          ))}
        </div>

        <div className="device-detail-info">
          <p>
            <strong>Last Seen:</strong>{' '}
            {device.last_seen_at
              ? new Date(device.last_seen_at).toLocaleString('th-TH')
              : '--'}
          </p>

          <p>
            <strong>Latest Reading:</strong>{' '}
            {device.latest_time
              ? new Date(device.latest_time).toLocaleString('th-TH')
              : '--'}
          </p>
        </div>
      </section>

      <section className="panel">
        <h3>Device Information</h3>

        <div className="device-info-grid">
          <div>
            <label>Device Code</label>
            <p>{device.device_code}</p>
          </div>

          <div>
            <label>Model</label>
            <p>{device.model_name || '--'}</p>
          </div>

          <div>
            <label>Group</label>
            <p>{device.group_name || 'Default'}</p>
          </div>

          <div>
            <label>Last Seen</label>
            <p>
              {device.last_seen_at
                ? new Date(device.last_seen_at).toLocaleString('th-TH')
                : '--'}
            </p>
          </div>

          <div>
            <label>Latest Reading</label>
            <p>
              {device.latest_time
                ? new Date(device.latest_time).toLocaleString('th-TH')
                : '--'}
            </p>
          </div>
        </div>
      </section>

      <ChartWidget defaultDeviceId={deviceId} />
    </div>
  )
}

export default DeviceDetail
