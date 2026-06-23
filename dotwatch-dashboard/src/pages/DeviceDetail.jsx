import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getDevice, getDeviceMetrics } from '../services/api'
import ChartWidget from '../components/ChartWidget.jsx'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'

function formatValue(value, unit = '') {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '--'

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

function getStatusLabel(status) {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  if (status === 'critical') return 'Critical'
  return 'Offline'
}

function getReadingId(reading) {
  return reading?.id ?? reading?.device_id ?? reading?.deviceId
}

function getReadingMetrics(reading) {
  return reading?.latest_metrics || reading?.metrics || {}
}

function mergeRealtimeDevice(prev, reading) {
  const realtimeMetrics = getReadingMetrics(reading)

  return {
    ...prev,
    ...reading,
    ...realtimeMetrics,
    latest_metrics: {
      ...(prev?.latest_metrics || {}),
      ...realtimeMetrics,
    },
    metrics: {
      ...(prev?.metrics || {}),
      ...realtimeMetrics,
    },
    status: reading.status || 'online',
    latest_time: reading.latest_time || reading.time || prev?.latest_time,
    last_seen_at: reading.last_seen_at || prev?.last_seen_at,
    last_ingest_at: reading.last_ingest_at || prev?.last_ingest_at,
  }
}

function getMetricIcon(metric) {
  const key = String(metric?.metric_key || '').toLowerCase()
  const type = String(metric?.metric_type || '').toLowerCase()
  const name = String(metric?.metric_name || '').toLowerCase()
  const text = `${key} ${type} ${name}`

  if (text.includes('temp')) return '🌡️'
  if (text.includes('humid')) return '💧'
  if (text.includes('volt')) return '⚡'
  if (text.includes('power') || text.includes('watt')) return '🔌'
  if (text.includes('pressure')) return '⏱️'
  if (text.includes('rssi') || text.includes('signal')) return '📶'
  if (text.includes('battery')) return '🔋'
  return '●'
}

function splitMetricValue(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '--'
  }

  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1)
}

function DeviceDetail({ deviceId, onBack }) {
  const [device, setDevice] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInfo, setShowInfo] = useState(true)

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
    const latestMetrics = device?.latest_metrics || {}
    const metricValues = device?.metrics || {}

    if (latestMetrics[metric.metric_key] != null) return latestMetrics[metric.metric_key]
    if (metricValues[metric.metric_key] != null) return metricValues[metric.metric_key]
    if (device?.[metric.metric_key] != null) return device[metric.metric_key]

    return null
  }

  useEffect(() => {
    if (deviceId) loadDevice()
  }, [deviceId])

  useEffect(() => {
    if (!deviceId) return undefined

    let unsubscribeRealtime = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return

      unsubscribeRealtime = connectRealtime(user.uid, (payload) => {
        if (payload.type !== 'reading' && payload.type !== 'device:update') return

        const reading = payload.data || payload.device
        if (!reading) return

        const readingId = getReadingId(reading)
        if (String(readingId) !== String(deviceId)) return

        setDevice((prev) => mergeRealtimeDevice(prev, reading))
      })
    })

    return () => {
      unsubscribeAuth()
      unsubscribeRealtime?.()
    }
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
      <div className="page app-page device-detail-page">
        <div className="panel app-card device-detail-loading">กำลังโหลด Device...</div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page app-page device-detail-page">
        <div className="panel app-card device-detail-empty">
          <button className="secondary-button" onClick={onBack}>← Back</button>
          <p>ไม่พบ Device</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page app-page device-detail-page device-detail-v2">
      <section className="device-hero-card">
        <div className="device-hero-main">
          <div>
            <span className="page-eyebrow">Device Detail</span>
            <h2>{device.name || 'Unnamed Device'}</h2>
            <p>
              {device.device_code}
              {device.model_name ? ` • ${device.model_name}` : ''}
            </p>
          </div>

          <span className={`device-hero-status ${getStatusClass(device.status)}`}>
            <span className="status-dot" />
            {getStatusLabel(device.status)}
          </span>
        </div>

        <div className="device-hero-meta">
          <div>
            <span>Latest Reading</span>
            <strong>{formatDate(device.latest_time)}</strong>
          </div>
          <div>
            <span>Last Seen</span>
            <strong>{formatDate(device.last_seen_at)}</strong>
          </div>
          <div>
            <span>Live Metrics</span>
            <strong>{metricSummary.active}/{metricSummary.total}</strong>
          </div>
          <button className="secondary-button" onClick={onBack}>← Back</button>
        </div>
      </section>

      <section className="panel app-card device-live-panel">
        <div className="app-section-title device-section-title-row">
          <div>
            <h3>Live Metrics</h3>
            <p>ค่าล่าสุดจาก Device ตาม Metric Config</p>
          </div>
          <span className="device-live-count">
            {metricSummary.active} active • {metricSummary.empty} empty
          </span>
        </div>

        {visibleMetrics.length === 0 ? (
          <div className="app-empty-state">
            <h3>ยังไม่มี Metric</h3>
            <p>ไปที่หน้า Device เพื่อกำหนด Metric Display ก่อน</p>
          </div>
        ) : (
          <div className="device-metrics-grid device-metrics-hero-grid">
            {visibleMetrics.map((metric) => {
              const value = getMetricValue(metric)

              return (
                <div key={metric.metric_key} className="metric-card metric-hero-card">
                  <div className="metric-hero-icon">{getMetricIcon(metric)}</div>
                  <div className="metric-hero-value-row">
                    <strong>{splitMetricValue(value)}</strong>
                    {metric.unit ? <em>{metric.unit}</em> : null}
                  </div>
                  <span>{metric.metric_name || metric.metric_key}</span>
                  <small>{metric.metric_key}</small>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ChartWidget defaultDeviceId={deviceId} />

      <section className="panel app-card device-info-panel-v2">
        <div className="device-info-toggle-row">
          <div>
            <h3>Device Information</h3>
            <p>รายละเอียดอุปกรณ์และตำแหน่งติดตั้ง</p>
          </div>
          <button className="secondary-button" onClick={() => setShowInfo((prev) => !prev)}>
            {showInfo ? 'Hide' : 'Show'} Info
          </button>
        </div>

        {showInfo ? (
          <div className="device-info-grid device-info-grid-v2">
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
              <label>Firmware</label>
              <p>{device.firmware_version || '--'}</p>
            </div>
            <div>
              <label>Latitude</label>
              <p>{device.latitude != null ? Number(device.latitude).toFixed(6) : '--'}</p>
            </div>
            <div>
              <label>Longitude</label>
              <p>{device.longitude != null ? Number(device.longitude).toFixed(6) : '--'}</p>
            </div>
            <div>
              <label>Last Ingest</label>
              <p>{formatDate(device.last_ingest_at)}</p>
            </div>
            <div>
              <label>Health</label>
              <p>{device.status === 'online' ? 'Healthy' : 'Offline'}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default DeviceDetail
