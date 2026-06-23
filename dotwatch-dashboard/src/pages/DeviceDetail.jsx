import { useEffect, useMemo, useState } from 'react'
import { getDevice, getDeviceMetrics } from '../services/api'
import ChartWidget from '../components/ChartWidget.jsx'
import { auth } from '../services/firebase'
import { connectRealtime, disconnectRealtime } from '../services/realtime'

function formatValue(value, unit = '') {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '--'
  }

  const numberValue = Number(value)
  const displayValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1)

  return `${displayValue}${unit ? ` ${unit}` : ''}`
}

function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function getStatusClass(status) {
  if (status === 'online') return 'status-online'
  if (status === 'warning') return 'status-warning'
  return 'status-offline'
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

      const normalizedMetrics = Array.isArray(metricData)
        ? metricData
        : Array.isArray(metricData?.metrics)
          ? metricData.metrics
          : []

      setMetrics(
        normalizedMetrics
          .filter((metric) => metric.visible !== false)
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      )
    } catch (error) {
      console.error('Load device detail error:', error)
      alert('โหลดข้อมูล Device ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  function getMetricValue(metric) {
    const latestMetrics = device?.latest_metrics || device?.metrics || {}
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
        last_ingest_at: reading.last_ingest_at,
      }))
    })

    return () => {
      disconnectRealtime()
    }
  }, [deviceId])

  useEffect(() => {
    if (deviceId) loadDevice()
  }, [deviceId])

  const visibleMetrics = useMemo(() => {
    return metrics.filter((metric) => metric.visible !== false)
  }, [metrics])

  const metricSummary = useMemo(() => {
    const values = visibleMetrics
      .map((metric) => getMetricValue(metric))
      .filter((value) => value != null && Number.isFinite(Number(value)))

    return {
      total: visibleMetrics.length,
      active: values.length,
      empty: visibleMetrics.length - values.length,
    }
  }, [visibleMetrics, device])

  if (loading) {
    return (
      <div className="page app-page">
        <div className="panel app-card">กำลังโหลด Device...</div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page app-page">
        <div className="panel app-card">
          <button className="secondary-button" onClick={onBack}>
            ← Back
          </button>
          <p>ไม่พบ Device</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page app-page device-detail-page">
      <section className="panel app-card">
        <div className="section-title app-section-title">
          <div>
            <span className="page-eyebrow">Device Detail</span>
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
            <strong className={getStatusClass(device.status)}>
              {device.status || 'offline'}
            </strong>
          </div>

          <div className="summary-card">
            <span>Model</span>
            <strong>{device.model_name || '--'}</strong>
          </div>

          <div className="summary-card">
            <span>Metrics</span>
            <strong>{metricSummary.total}</strong>
          </div>

          <div className="summary-card">
            <span>Active Values</span>
            <strong>{metricSummary.active}</strong>
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

        <div className="device-detail-info">
          <p>
            <strong>Last Seen:</strong> {formatDate(device.last_seen_at)}
          </p>

          <p>
            <strong>Latest Reading:</strong> {formatDate(device.latest_time)}
          </p>
        </div>
      </section>

      <section className="panel app-card">
        <div className="app-section-title">
          <div>
            <h3>Live Metrics</h3>
            <p>แสดงค่าล่าสุดตาม Metric Config ของ Device นี้</p>
          </div>
        </div>

        {visibleMetrics.length === 0 ? (
          <div className="app-empty-state">
            <h3>ยังไม่มี Metric</h3>
            <p>ไปที่หน้า Device เพื่อกำหนด Metric Display ก่อน</p>
          </div>
        ) : (
          <div className="device-metrics-grid">
            {visibleMetrics.map((metric) => (
              <div key={metric.metric_key} className="metric-card">
                <span>{metric.metric_name || metric.metric_key}</span>
                <strong>
                  {formatValue(getMetricValue(metric), metric.unit)}
                </strong>
                <small>{metric.metric_key}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel app-card">
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
            <label>Latitude</label>
            <p>
              {device.latitude != null
                ? Number(device.latitude).toFixed(6)
                : '--'}
            </p>
          </div>

          <div>
            <label>Longitude</label>
            <p>
              {device.longitude != null
                ? Number(device.longitude).toFixed(6)
                : '--'}
            </p>
          </div>

          <div>
            <label>Last Ingest</label>
            <p>{formatDate(device.last_ingest_at)}</p>
          </div>
        </div>
      </section>

      <ChartWidget defaultDeviceId={deviceId} />
    </div>
  )
}

export default DeviceDetail
