import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getDevice, getDeviceMetrics } from '../services/api'
import ChartWidget from '../components/ChartWidget.jsx'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'
import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../components/common'

function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function formatShortTime(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '--'
  }
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

function formatMetricNumber(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '--'

  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1)
}

function getDeviceHealthLabel(status) {
  if (status === 'online') return 'Healthy'
  if (status === 'warning') return 'Warning'
  if (status === 'critical') return 'Critical'
  return 'Offline'
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
      <div className="page app-page device-detail-page device-detail-ds">
        <EmptyState title="กำลังโหลด Device" description="กำลังดึงข้อมูลล่าสุดจาก Backend" />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page app-page device-detail-page device-detail-ds">
        <EmptyState
          title="ไม่พบ Device"
          description="Device นี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง"
          action={
            <button className="secondary-button" onClick={onBack}>
              ← Back
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="page app-page device-detail-page device-detail-ds">
      <PageHeader
        eyebrow="Device Detail"
        title={device.name || 'Unnamed Device'}
        description={`${device.device_code || '--'}${device.model_name ? ` • ${device.model_name}` : ''}`}
        meta={
          <div className="device-detail-header-meta">
            <span>Latest Reading: {formatShortTime(device.latest_time)}</span>
            <span>Last Seen: {formatShortTime(device.last_seen_at)}</span>
            <span>{metricSummary.active}/{metricSummary.total} Active Metrics</span>
          </div>
        }
        actions={
          <div className="device-detail-header-actions">
            <StatusBadge
              status={device.status || 'offline'}
              label={getStatusLabel(device.status)}
            />
            <button className="secondary-button" onClick={onBack}>
              ← Back
            </button>
          </div>
        }
      />

      <section className="device-detail-stat-grid">
        <StatCard
          label="Status"
          value={getDeviceHealthLabel(device.status)}
          hint={device.status || 'offline'}
          tone={device.status === 'online' ? 'success' : device.status === 'warning' ? 'warning' : 'danger'}
        />
        <StatCard label="Model" value={device.model_name || '--'} hint="Device model" />
        <StatCard label="Metrics" value={metricSummary.total} hint={`${metricSummary.active} active`} />
        <StatCard label="Firmware" value={device.firmware_version || '--'} hint="Current version" />
      </section>

      <section className="panel app-card device-live-panel-ds">
        <SectionHeader
          title="Live Metrics"
          description="ค่าล่าสุดจาก Device ตาม Metric Config"
          actions={
            <span className="device-live-count-ds">
              {metricSummary.active} active • {metricSummary.empty} empty
            </span>
          }
        />

        {visibleMetrics.length === 0 ? (
          <EmptyState
            title="ยังไม่มี Metric"
            description="ไปที่หน้า Device เพื่อกำหนด Metric Display ก่อน"
          />
        ) : (
          <div className="device-metrics-ds-grid">
            {visibleMetrics.map((metric) => {
              const value = getMetricValue(metric)

              return (
                <MetricCard
                  key={metric.metric_key}
                  name={metric.metric_name || metric.metric_key}
                  value={formatMetricNumber(value)}
                  unit={metric.unit}
                  icon={getMetricIcon(metric)}
                  metricKey={metric.metric_key}
                />
              )
            })}
          </div>
        )}
      </section>

      <ChartWidget defaultDeviceId={deviceId} />

      <section className="panel app-card device-info-panel-ds">
        <SectionHeader
          title="Device Information"
          description="รายละเอียดอุปกรณ์และตำแหน่งติดตั้ง"
          actions={
            <button className="secondary-button" onClick={() => setShowInfo((prev) => !prev)}>
              {showInfo ? 'Hide' : 'Show'} Info
            </button>
          }
        />

        {showInfo ? (
          <div className="device-info-grid-ds">
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
              <label>Latest Reading</label>
              <p>{formatDate(device.latest_time)}</p>
            </div>
            <div>
              <label>Last Ingest</label>
              <p>{formatDate(device.last_ingest_at)}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default DeviceDetail
