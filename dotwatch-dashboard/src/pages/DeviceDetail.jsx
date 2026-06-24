import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getDevice, getDeviceMetrics } from '../services/api'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'
import {
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from '../components/common'
import {
  formatDate,
  formatMetricNumber,
  formatShortTime,
  getDeviceHealthLabel,
  getMetricValueFromDevice,
  getStatusLabel,
} from '../components/device-detail/deviceDetailUtils'

const DeviceOverviewTab = lazy(
  () => import('../components/device-detail/DeviceOverviewTab.jsx')
)
const DeviceMetricsTab = lazy(
  () => import('../components/device-detail/DeviceMetricsTab.jsx')
)
const DeviceTimelineTab = lazy(
  () => import('../components/device-detail/DeviceTimelineTab.jsx')
)
const DeviceInformationTab = lazy(
  () => import('../components/device-detail/DeviceInformationTab.jsx')
)

function getReadingId(reading) {
  return reading?.id ?? reading?.device_id ?? reading?.deviceId
}

function getReadingMetrics(reading) {
  return reading?.latest_metrics || reading?.metrics || {}
}

function normalizeAlarmPayload(payload) {
  const rawAlarms = Array.isArray(payload?.data)
    ? payload.data
    : [payload?.data]

  return rawAlarms.filter(Boolean)
}

function getAlarmDeviceId(alarm) {
  return alarm?.device_id ?? alarm?.deviceId ?? alarm?.device?.id
}

function getAlarmTitle(alarm) {
  const severity = String(alarm?.severity || 'alarm').toUpperCase()
  const metric =
    alarm?.metric_key || alarm?.metric || alarm?.metric_name || 'Metric'

  return `${severity} alarm: ${metric}`
}

function getAlarmDescription(alarm) {
  if (alarm?.message) return alarm.message

  const operator = alarm?.operator || alarm?.condition || ''
  const threshold = alarm?.threshold ?? alarm?.threshold_value ?? ''
  const value = alarm?.value ?? alarm?.reading_value ?? alarm?.current_value
  const parts = []

  if (value != null) parts.push(`Current value ${formatMetricNumber(value)}`)
  if (operator || threshold !== '') {
    parts.push(`Rule ${operator} ${threshold}`.trim())
  }

  return parts.length > 0
    ? parts.join(' • ')
    : 'Alarm rule was triggered for this device.'
}

function getAlarmTime(alarm) {
  return (
    alarm?.triggered_at ||
    alarm?.created_at ||
    alarm?.time ||
    alarm?.timestamp ||
    new Date().toISOString()
  )
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

function buildTimeline(device, visibleMetrics, realtimeAlarms = []) {
  const latestMetrics = visibleMetrics
    .map((metric) => ({
      key: metric.metric_key,
      name: metric.metric_name || metric.metric_key,
      unit: metric.unit || '',
      value: getMetricValueFromDevice(device, metric),
    }))
    .filter(
      (metric) => metric.value != null && Number.isFinite(Number(metric.value))
    )
    .slice(0, 4)

  const items = realtimeAlarms.slice(0, 5).map((alarm) => ({
    id: `alarm-${alarm.id || alarm.alarm_id || getAlarmTime(alarm)}`,
    tone:
      alarm.severity === 'critical'
        ? 'danger'
        : alarm.severity === 'warning'
          ? 'warning'
          : 'danger',
    title: getAlarmTitle(alarm),
    description: getAlarmDescription(alarm),
    time: getAlarmTime(alarm),
  }))

  if (device?.latest_time) {
    items.push({
      id: 'latest-reading',
      tone: 'info',
      title: 'Latest reading received',
      description:
        latestMetrics.length > 0
          ? latestMetrics
              .map(
                (metric) =>
                  `${metric.name}: ${formatMetricNumber(metric.value)}${metric.unit ? ` ${metric.unit}` : ''}`
              )
              .join(' • ')
          : 'Device sent new telemetry data.',
      time: device.latest_time,
    })
  }

  if (device?.last_ingest_at) {
    items.push({
      id: 'last-ingest',
      tone: device.status === 'online' ? 'success' : 'danger',
      title:
        device.status === 'online'
          ? 'Data ingest is active'
          : 'Device ingest stopped',
      description:
        device.status === 'online'
          ? 'Backend received telemetry and marked this device online.'
          : 'No new telemetry has been received within the offline threshold.',
      time: device.last_ingest_at,
    })
  }

  if (device?.last_seen_at) {
    items.push({
      id: 'last-seen',
      tone: device.status === 'online' ? 'success' : 'warning',
      title: `Device status: ${getStatusLabel(device.status)}`,
      description: `Last seen at ${formatDate(device.last_seen_at)}.`,
      time: device.last_seen_at,
    })
  }

  items.push({
    id: 'profile',
    tone: 'muted',
    title: 'Device profile loaded',
    description: `${device?.model_name || 'Unknown model'} • ${visibleMetrics.length} visible metrics configured.`,
    time:
      device?.created_at ||
      device?.last_seen_at ||
      device?.latest_time ||
      new Date().toISOString(),
  })

  return items.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  )
}

function TabLoading({ title = 'Loading section...' }) {
  return (
    <section className="panel app-card device-detail-tab-panel">
      <div className="app-empty-state">
        <h3>{title}</h3>
        <p>กำลังเตรียมข้อมูลสำหรับส่วนนี้</p>
      </div>
    </section>
  )
}

function DeviceDetail({ deviceId, onBack }) {
  const [device, setDevice] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [realtimeAlarms, setRealtimeAlarms] = useState([])

  async function loadDevice() {
    try {
      setLoading(true)

      const [deviceData, metricData] = await Promise.all([
        getDevice(deviceId),
        getDeviceMetrics(deviceId),
      ])

      setDevice(deviceData)
      setRealtimeAlarms([])

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

  useEffect(() => {
    if (deviceId) loadDevice()
  }, [deviceId])

  useEffect(() => {
    if (!deviceId) return undefined

    let unsubscribeRealtime = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return

      unsubscribeRealtime = connectRealtime(user.uid, (payload) => {
        if (payload.type === 'alarm') {
          const alarms = normalizeAlarmPayload(payload).filter((alarm) => {
            const alarmDeviceId = getAlarmDeviceId(alarm)
            return String(alarmDeviceId) === String(deviceId)
          })

          if (alarms.length > 0) {
            setRealtimeAlarms((prev) => {
              const next = [...alarms, ...prev]
              const unique = new Map()

              next.forEach((alarm) => {
                const key =
                  alarm.id ||
                  alarm.alarm_id ||
                  `${getAlarmDeviceId(alarm)}-${getAlarmTime(alarm)}-${alarm.metric_key || alarm.metric || ''}`
                if (!unique.has(key)) unique.set(key, alarm)
              })

              return Array.from(unique.values()).slice(0, 10)
            })
          }

          return
        }

        if (payload.type !== 'reading' && payload.type !== 'device:update') {
          return
        }

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
      .map((metric) => getMetricValueFromDevice(device, metric))
      .filter((value) => value != null && Number.isFinite(Number(value)))

    return {
      total: visibleMetrics.length,
      active: values.length,
      empty: visibleMetrics.length - values.length,
    }
  }, [visibleMetrics, device])

  const timeline = useMemo(() => {
    return buildTimeline(device, visibleMetrics, realtimeAlarms)
  }, [device, visibleMetrics, realtimeAlarms])

  const tabs = [
    { id: 'overview', label: 'Overview', count: null },
    { id: 'metrics', label: 'Metrics', count: metricSummary.total },
    { id: 'timeline', label: 'Timeline', count: timeline.length },
    { id: 'information', label: 'Information', count: null },
  ]

  if (loading) {
    return (
      <div className="page app-page device-detail-page device-detail-ds">
        <EmptyState
          title="กำลังโหลด Device"
          description="กำลังดึงข้อมูลล่าสุดจาก Backend"
        />
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
    <div className="page app-page device-detail-page device-detail-ds device-detail-tabs-v2">
      <PageHeader
        eyebrow="Device Detail"
        title={device.name || 'Unnamed Device'}
        description={`${device.device_code || '--'}${device.model_name ? ` • ${device.model_name}` : ''}`}
        meta={
          <div className="device-detail-header-meta">
            <span>Latest Reading: {formatShortTime(device.latest_time)}</span>
            <span>Last Seen: {formatShortTime(device.last_seen_at)}</span>
            <span>
              {metricSummary.active}/{metricSummary.total} Active Metrics
            </span>
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
          tone={
            device.status === 'online'
              ? 'success'
              : device.status === 'warning'
                ? 'warning'
                : 'danger'
          }
        />
        <StatCard
          label="Model"
          value={device.model_name || '--'}
          hint="Device model"
        />
        <StatCard
          label="Metrics"
          value={metricSummary.total}
          hint={`${metricSummary.active} active`}
        />
        <StatCard
          label="Realtime Alarms"
          value={realtimeAlarms.length}
          hint="Current session"
          tone={realtimeAlarms.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Firmware"
          value={device.firmware_version || '--'}
          hint="Current version"
        />
      </section>

      <nav className="device-detail-tabs" aria-label="Device detail sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.count != null && <b>{tab.count}</b>}
          </button>
        ))}
      </nav>

      <Suspense fallback={<TabLoading />}>
        {activeTab === 'overview' && (
          <DeviceOverviewTab device={device} deviceId={deviceId} />
        )}

        {activeTab === 'metrics' && (
          <DeviceMetricsTab
            device={device}
            visibleMetrics={visibleMetrics}
            metricSummary={metricSummary}
          />
        )}

        {activeTab === 'timeline' && <DeviceTimelineTab timeline={timeline} />}

        {activeTab === 'information' && (
          <DeviceInformationTab device={device} />
        )}
      </Suspense>
    </div>
  )
}

export default DeviceDetail
