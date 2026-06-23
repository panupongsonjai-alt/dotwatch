import { useEffect, useMemo, useState } from 'react'
import { auth } from '../services/firebase'
import AlarmPanel from '../components/AlarmPanel.jsx'
import { getDevices, getAlarms } from '../services/api'
import { getDeviceMetrics } from '../services/metricDisplayApi'
import { connectRealtime, disconnectRealtime } from '../services/realtime'
import { useAlarm } from '../context/AlarmContext'
import DeviceMap from '../components/DeviceMap'
import {
  DEFAULT_METRICS,
  formatMetricValue,
  getMetricValue,
  getVisibleMetrics,
  normalizeMetrics,
} from '../utils/metricDisplayConfig'
import { MetricIcon } from '../utils/metricIcons.jsx'
import { EmptyState, PageHeader, StatCard } from '../components/common'

function normalizeRealtimeDevice(reading = {}) {
  const latestMetrics = reading.latest_metrics || reading.metrics || {}

  return {
    ...reading,
    ...latestMetrics,
    latest_metrics: latestMetrics,
    metrics: latestMetrics,
    temperature:
      reading.temperature ??
      latestMetrics.temperature ??
      latestMetrics.metric_1,
    humidity:
      reading.humidity ?? latestMetrics.humidity ?? latestMetrics.metric_2,
    rssi: reading.rssi ?? latestMetrics.rssi,
    latest_time:
      reading.latest_time || reading.time || new Date().toISOString(),
    status: reading.status || 'online',
  }
}

function isSameDevice(device, reading) {
  return (
    String(device.id) === String(reading.id) ||
    String(device.id) === String(reading.device_id) ||
    String(device.device_code) === String(reading.device_code)
  )
}

function formatRelativeTime(value) {
  if (!value) return '--'

  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  )

  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return new Date(value).toLocaleDateString('th-TH')
}

function Dashboard({ onOpenDevice }) {
  const [devices, setDevices] = useState([])
  const [metricConfigs, setMetricConfigs] = useState({})
  const [loading, setLoading] = useState(true)
  const [alarmCount, setAlarmCount] = useState(0)
  const [dashboardDisplay, setDashboardDisplay] = useState({
    showDeviceOverview: true,
    showDeviceMap: true,
  })

  const { addAlarm } = useAlarm()

  async function loadDeviceMetrics(devicesList = []) {
    const entries = await Promise.all(
      devicesList.map(async (device) => {
        try {
          const data = await getDeviceMetrics(device.id)
          const metrics = normalizeMetrics(data?.metrics || data || [])

          return [device.id, metrics.length > 0 ? metrics : DEFAULT_METRICS]
        } catch (error) {
          console.error(`Load metrics error for device ${device.id}:`, error)
          return [device.id, DEFAULT_METRICS]
        }
      })
    )

    setMetricConfigs(Object.fromEntries(entries))
  }

  async function loadDevices() {
    try {
      setLoading(true)

      const data = await getDevices()
      const nextDevices = Array.isArray(data) ? data : []

      setDevices(nextDevices)
      loadDeviceMetrics(nextDevices)
    } catch (error) {
      console.error('Load devices error:', error)
      setDevices([])
      setMetricConfigs({})
    } finally {
      setLoading(false)
    }
  }

  async function loadAlarms() {
    try {
      const data = await getAlarms()
      const activeCount = Array.isArray(data)
        ? data.filter((alarm) => alarm.status === 'active').length
        : 0

      setAlarmCount(activeCount)
    } catch (error) {
      console.error('Load alarms error:', error)
    }
  }

  function loadDisplaySettings() {
    setDashboardDisplay({
      showDeviceOverview:
        localStorage.getItem('showDeviceOverview') !== 'false',
      showDeviceMap: localStorage.getItem('showDeviceMap') !== 'false',
    })
  }

  function getDeviceVisibleMetrics(device) {
    const metrics = metricConfigs[device.id] || DEFAULT_METRICS
    return getVisibleMetrics(metrics).slice(0, 3)
  }

  function getDisplayValue(device, metric) {
    return formatMetricValue(getMetricValue(device, metric), metric.unit)
  }

  function updateRealtimeDevice(reading) {
    const realtimeDevice = normalizeRealtimeDevice(reading)

    setDevices((prev) => {
      const exists = prev.some((device) => isSameDevice(device, realtimeDevice))

      if (!exists) {
        loadDeviceMetrics([realtimeDevice])
        return [realtimeDevice, ...prev]
      }

      return prev.map((device) => {
        if (!isSameDevice(device, realtimeDevice)) return device

        return {
          ...device,
          ...realtimeDevice,
          id: device.id,
          user_id: device.user_id || realtimeDevice.user_id,
          model_id: device.model_id || realtimeDevice.model_id,
          model_key: device.model_key || realtimeDevice.model_key,
          model_name: device.model_name || realtimeDevice.model_name,
          metric_count: device.metric_count || realtimeDevice.metric_count,
        }
      })
    })
  }

  useEffect(() => {
    loadDisplaySettings()
    loadDevices()
    loadAlarms()

    window.addEventListener('dashboardSettingsChanged', loadDisplaySettings)
    window.addEventListener('dotwatchMetricConfigChanged', loadDevices)

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      disconnectRealtime()

      if (!user) return

      connectRealtime(user.uid, (payload) => {
        if (payload.type === 'reading' || payload.type === 'device:update') {
          const reading = payload.data || payload.device
          if (reading) updateRealtimeDevice(reading)
        }

        if (payload.type === 'device:delete') {
          const deletedDevice = payload.data || payload.device
          if (!deletedDevice) return

          setDevices((prev) =>
            prev.filter((device) => !isSameDevice(device, deletedDevice))
          )
        }

        if (payload.type === 'alarm') {
          const alarms = Array.isArray(payload.data)
            ? payload.data
            : [payload.data]

          const validAlarms = alarms.filter(Boolean)
          validAlarms.forEach(addAlarm)
          setAlarmCount((count) => count + validAlarms.length)
        }

        if (payload.type === 'alarm:sync') {
          const alarms = Array.isArray(payload.data) ? payload.data : []
          setAlarmCount(
            alarms.filter((alarm) => alarm.status === 'active').length
          )
        }
      })
    })

    return () => {
      disconnectRealtime()
      unsubscribeAuth?.()
      window.removeEventListener(
        'dashboardSettingsChanged',
        loadDisplaySettings
      )
      window.removeEventListener('dotwatchMetricConfigChanged', loadDevices)
    }
  }, [addAlarm])

  const onlineCount = devices.filter(
    (device) => device.status === 'online'
  ).length
  const offlineCount = devices.length - onlineCount

  const latestUpdatedAt = useMemo(() => {
    const times = devices
      .map((device) => device.latest_time || device.last_ingest_at)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite)

    if (!times.length) return null

    return new Date(Math.max(...times)).toISOString()
  }, [devices])

  return (
    <div className="page app-page dashboard-page dashboard-v2-page">
      <PageHeader
        eyebrow="Operations Center"
        title="dotWatch Dashboard"
        description={`${onlineCount} Online • ${offlineCount} Offline • ${alarmCount} Active Alarm`}
        actions={
          <div className="dashboard-live-chip">
            <span />
            Last update {formatRelativeTime(latestUpdatedAt)}
          </div>
        }
      />

      <section className="dashboard-kpi-grid">
        <StatCard label="Total Devices" value={loading ? '...' : devices.length} />
        <StatCard label="Online" value={loading ? '...' : onlineCount} tone="success" />
        <StatCard label="Offline" value={loading ? '...' : offlineCount} tone="danger" />
        <StatCard label="Active Alarm" value={alarmCount} tone={alarmCount > 0 ? 'danger' : 'success'} />
      </section>

      <section className="dashboard-main-grid">
        {dashboardDisplay.showDeviceOverview && (
          <section className="app-card devices-overview-panel dashboard-devices-card">
            <div className="app-section-title dashboard-section-title-row">
              <div>
                <h2>Devices Overview</h2>
                <p>ค่าล่าสุดจากอุปกรณ์ทั้งหมดตาม Metric Config</p>
              </div>

              <span className="device-count-badge">
                {devices.length} Devices
              </span>
            </div>

            {loading ? (
              <EmptyState
                title="กำลังโหลดข้อมูล"
                description="กำลังดึงข้อมูล Device จาก Backend"
              />
            ) : devices.length === 0 ? (
              <EmptyState
                title="ไม่พบ Device"
                description="ยังไม่มี Device ในระบบ"
              />
            ) : (
              <div className="overview-grid dashboard-device-grid">
                {devices.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    className="overview-card compact dashboard-device-card-v2"
                    onClick={() => onOpenDevice?.(device.id)}
                  >
                    <div className="dashboard-device-topline">
                      <span className={`device-status-dot ${device.status || 'offline'}`} />
                      <span className="dashboard-device-status">
                        {device.status || 'offline'}
                      </span>
                      {device.model_name && (
                        <span className="device-model-badge">
                          {device.model_name}
                        </span>
                      )}
                    </div>

                    <div className="overview-name dashboard-device-name">
                      {device.name || device.device_code || 'Unnamed Device'}
                    </div>

                    <div className="overview-values dynamic-overview-values dashboard-device-values">
                      {getDeviceVisibleMetrics(device).map((metric) => (
                        <span
                          key={metric.id || metric.metric_key}
                          title={metric.metric_name}
                        >
                          <MetricIcon name={metric.icon} size={14} />
                          <b>{getDisplayValue(device, metric)}</b>
                        </span>
                      ))}
                    </div>

                    <div className="overview-last-update">
                      Updated {formatRelativeTime(device.latest_time || device.last_ingest_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <aside className="dashboard-alarm-column">
          <AlarmPanel />
        </aside>
      </section>

      {dashboardDisplay.showDeviceMap && (
        <section className="app-card dashboard-map-card-v2">
          <DeviceMap devices={devices} onOpenDevice={onOpenDevice} />
        </section>
      )}
    </div>
  )
}

export default Dashboard
