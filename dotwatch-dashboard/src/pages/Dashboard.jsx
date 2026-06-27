import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Battery,
  Cpu,
  Droplets,
  Gauge,
  Power,
  Thermometer,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react'
import { auth } from '../services/firebase'
import AlarmPanel from '../components/AlarmPanel.jsx'
import LatestActiveAlarms from '../components/LatestActiveAlarms.jsx'
import {
  clearApiCache,
  getDevices,
  getActiveAlarms,
  getAlarmSummary,
} from '../services/api'
import { connectRealtime } from '../services/realtime'
import { useAlarm } from '../context/AlarmContext'
import { EmptyState, PageHeader, StatCard } from '../components/common'
import '../styles/dashboard.css'
import '../styles/page-system.css'
const DeviceMap = lazy(() => import('../components/DeviceMap'))

const METRIC_ICON_COMPONENTS = {
  Activity,
  Thermometer,
  Droplets,
  Gauge,
  Zap,
  Battery,
  Wifi,
  Wind,
  Power,
  Cpu,
}

function normalizeMetricIconName(value) {
  const iconName = String(value || '').trim()

  return METRIC_ICON_COMPONENTS[iconName] ? iconName : 'Activity'
}

function getMetricIconName(metricConfig = {}) {
  return normalizeMetricIconName(
    metricConfig?.icon ||
      metricConfig?.default_icon ||
      metricConfig?.defaultIcon ||
      metricConfig?.icon_name ||
      metricConfig?.iconName
  )
}

function MetricOverviewIcon({ iconName }) {
  const safeIconName = normalizeMetricIconName(iconName)
  const IconComponent = METRIC_ICON_COMPONENTS[safeIconName] || Activity

  return (
    <span className="live-metric-overview-icon" title={safeIconName}>
      <IconComponent size={18} strokeWidth={2.35} />
    </span>
  )
}

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

function getHealthStatus(device = {}) {
  if (device.health_status) return device.health_status

  const status = device.status || 'offline'

  if (status === 'online') return 'healthy'
  if (status === 'warning') return 'warning'

  return 'offline'
}

function getMetricIndex(metricKey = '') {
  return Number(String(metricKey).replace(/[^0-9]/g, '')) || 0
}

function getConfiguredMetrics(device = {}) {
  const metricLists = [
    device.metric_configs,
    device.metricConfigs,
    device.device_metrics,
    device.deviceMetrics,
    device.metrics_config,
    device.metricsConfig,
  ].filter(Array.isArray)

  if (!metricLists.length) return []

  return metricLists[0]
    .filter((metric) => metric.visible !== false)
    .sort((a, b) => {
      const orderA = Number(a.sort_order ?? 9999)
      const orderB = Number(b.sort_order ?? 9999)

      if (orderA !== orderB) return orderA - orderB

      return (
        getMetricIndex(a.metric_key || a.key) -
        getMetricIndex(b.metric_key || b.key)
      )
    })
}

function formatMetricValue(value) {
  if (value == null || value === '') return '--'

  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) return String(value)

  if (Math.abs(numberValue) >= 1000) {
    return numberValue.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })
  }

  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2)
}

function getMetricInitial(metricKey = '') {
  const index = getMetricIndex(metricKey)

  if (index > 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    return alphabet[(index - 1) % alphabet.length]
  }

  return 'M'
}

function getFallbackMetricName(metricKey = '') {
  const key = String(metricKey || '')

  if (key === 'temperature') return 'Temperature'
  if (key === 'humidity') return 'Humidity'
  if (key === 'rssi') return 'Signal'

  const index = getMetricIndex(key)

  return index > 0 ? `Metric ${index}` : key
}

function getFallbackMetricUnit(metricKey = '') {
  const key = String(metricKey || '').toLowerCase()

  if (key === 'temperature') return '°C'
  if (key === 'humidity') return '%'
  if (key === 'rssi') return 'dBm'

  return ''
}

function getLatestMetricEntries(device = {}) {
  const latestMetrics = {
    ...(device.latest_metrics || device.metrics || {}),
  }

  if (device.temperature != null && latestMetrics.temperature == null) {
    latestMetrics.temperature = device.temperature
  }

  if (device.humidity != null && latestMetrics.humidity == null) {
    latestMetrics.humidity = device.humidity
  }

  if (device.rssi != null && latestMetrics.rssi == null) {
    latestMetrics.rssi = device.rssi
  }

  return Object.entries(latestMetrics)
    .filter(([, value]) => value != null && Number.isFinite(Number(value)))
    .sort(([keyA], [keyB]) => getMetricIndex(keyA) - getMetricIndex(keyB))
}

function buildMetricCard(device, metricKey, value, metricConfig = null) {
  return {
    id: `${device.id}-${metricKey}`,
    deviceId: device.id,
    deviceName: device.name || device.device_code || 'Unnamed Device',
    deviceCode: device.device_code,
    metricKey,
    metricName:
      metricConfig?.metric_name ||
      metricConfig?.name ||
      metricConfig?.label ||
      getFallbackMetricName(metricKey),
    unit: metricConfig?.unit || getFallbackMetricUnit(metricKey),
    icon: getMetricIconName(metricConfig),
    value: formatMetricValue(value),
    latestTime: device.latest_time || device.last_ingest_at,
    healthStatus: getHealthStatus(device),
    initial: getMetricInitial(metricKey),
    sortOrder: Number(metricConfig?.sort_order ?? 9999),
  }
}

function getDeviceMetricCards(devices = [], limit = Infinity) {
  return devices
    .flatMap((device) => {
      const latestMetrics = device.latest_metrics || device.metrics || {}
      const configuredMetrics = getConfiguredMetrics(device)

      if (!configuredMetrics.length) return []

      return configuredMetrics
        .map((metricConfig) => {
          const metricKey =
            metricConfig.metric_key ||
            metricConfig.source_key ||
            metricConfig.key

          if (!metricKey) return null

          const value = latestMetrics[metricKey]

          return buildMetricCard(device, metricKey, value, metricConfig)
        })
        .filter(Boolean)
    })
    .sort((a, b) => {
      const deviceA = String(a.deviceName || '')
      const deviceB = String(b.deviceName || '')

      if (deviceA !== deviceB) return deviceA.localeCompare(deviceB)

      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder

      return getMetricIndex(a.metricKey) - getMetricIndex(b.metricKey)
    })
    .slice(0, Number.isFinite(limit) ? limit : undefined)
}

function Dashboard({ onOpenDevice }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [alarmCount, setAlarmCount] = useState(0)
  const [alarmSummary, setAlarmSummary] = useState({
    active: 0,
    warning: 0,
    critical: 0,
  })
  const [dashboardDisplay, setDashboardDisplay] = useState({
    showDeviceOverview: true,
    showDeviceMap: true,
  })

  const { addAlarm } = useAlarm()

  async function loadDevices() {
    try {
      setLoading(true)

      const data = await getDevices()
      const nextDevices = Array.isArray(data) ? data : []

      setDevices(nextDevices)
    } catch (error) {
      console.error('Load devices error:', error)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  async function loadAlarms() {
    try {
      const [activeAlarms, summary] = await Promise.all([
        getActiveAlarms(),
        getAlarmSummary(),
      ])

      setAlarmCount(Array.isArray(activeAlarms) ? activeAlarms.length : 0)
      setAlarmSummary({
        active: Number(summary?.active || 0),
        warning: Number(summary?.warning || 0),
        critical: Number(summary?.critical || 0),
      })
    } catch (error) {
      console.error('Load alarms error:', error)
      setAlarmCount(0)
      setAlarmSummary({
        active: 0,
        warning: 0,
        critical: 0,
      })
    }
  }

  function loadDisplaySettings() {
    setDashboardDisplay({
      showDeviceOverview:
        localStorage.getItem('showDeviceOverview') !== 'false',
      showDeviceMap: localStorage.getItem('showDeviceMap') !== 'false',
    })
  }

  function updateRealtimeDevice(reading) {
    const realtimeDevice = normalizeRealtimeDevice(reading)

    setDevices((prev) => {
      const exists = prev.some((device) => isSameDevice(device, realtimeDevice))

      if (!exists) {
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

    function handleMetricConfigChanged(event) {
      clearApiCache?.()
      loadDevices()

      if (import.meta.env.DEV) {
        console.info('Metric config changed:', event.detail)
      }
    }

    window.addEventListener('dashboardSettingsChanged', loadDisplaySettings)
    window.addEventListener(
      'dotwatchMetricConfigChanged',
      handleMetricConfigChanged
    )

    let unsubscribeRealtime = null

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRealtime?.()
      unsubscribeRealtime = null

      if (!user) return

      unsubscribeRealtime = connectRealtime(user.uid, (payload) => {
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
      unsubscribeRealtime?.()
      unsubscribeAuth?.()
      window.removeEventListener(
        'dashboardSettingsChanged',
        loadDisplaySettings
      )
      window.removeEventListener(
        'dotwatchMetricConfigChanged',
        handleMetricConfigChanged
      )
    }
  }, [addAlarm])

  const onlineCount = devices.filter(
    (device) => device.status === 'online'
  ).length
  const offlineCount = devices.length - onlineCount
  const healthyCount = devices.filter(
    (device) => getHealthStatus(device) === 'healthy'
  ).length

  const warningHealthCount = devices.filter(
    (device) => getHealthStatus(device) === 'warning'
  ).length

  const criticalHealthCount = devices.filter(
    (device) => getHealthStatus(device) === 'critical'
  ).length

  const dataOverviewMetrics = useMemo(
    () => getDeviceMetricCards(devices),
    [devices]
  )

  return (
    <div className="page app-page dashboard-page dashboard-v2-page">
      <PageHeader
        eyebrow="Operations Center"
        title="dotWatch Dashboard"
      />

      <section className="dw-page-stat-grid dashboard-kpi-grid dashboard-health-kpi-grid">
        <StatCard
          label="Total Devices"
          value={loading ? '...' : devices.length}
        />
        <StatCard
          label="Healthy"
          value={loading ? '...' : healthyCount}
          hint="Normal operation"
          tone="success"
        />
        <StatCard
          label="Warning"
          value={loading ? '...' : warningHealthCount}
          hint={`${alarmSummary.warning} active warning alarms`}
          tone={warningHealthCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Critical"
          value={loading ? '...' : criticalHealthCount}
          hint={`${alarmSummary.critical} active critical alarms`}
          tone={criticalHealthCount > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Offline"
          value={loading ? '...' : offlineCount}
          hint="No recent data"
          tone={offlineCount > 0 ? 'danger' : 'success'}
        />
      </section>

      <section className="app-card dashboard-data-overview-card live-metrics-overview-card">
        <div className="app-section-title dashboard-section-title-row live-metrics-overview-header">
          <div>
            <h2>Data Overview</h2>
            <p>
              แสดงเฉพาะ Metric ที่เปิด Visible ไว้ใน Metric Display
            </p>
          </div>

          <span className="device-count-badge live-metrics-count-badge">
            {dataOverviewMetrics.length} Metrics
          </span>
        </div>

        {loading ? (
          <EmptyState
            title="กำลังโหลดข้อมูล"
            description="กำลังดึงค่าล่าสุดจาก Device"
          />
        ) : dataOverviewMetrics.length === 0 ? (
          <EmptyState
            title="ยังไม่มี Metric ที่ตั้งค่าให้แสดง"
            description="ตรวจสอบ Metric Display ว่าเปิด Visible แล้ว และ Backend ส่ง metric_configs มาครบ"
          />
        ) : (
          <div className="live-metrics-overview-grid">
            {dataOverviewMetrics.map((metric) => (
              <article
                key={metric.id}
                className={`live-metric-overview-card ${metric.healthStatus}`}
              >
                <span className="live-metric-bg-shape" />

                <div className="live-metric-overview-title">
                  <MetricOverviewIcon iconName={metric.icon} />
                  <strong>{metric.metricName}</strong>
                </div>

                <div className="live-metric-overview-value">
                  <strong>{metric.value}</strong>
                  {metric.unit && <span>{metric.unit}</span>}
                </div>

                <div className="live-metric-overview-device">
                  {metric.deviceName}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dashboardDisplay.showDeviceOverview && (
          <section className="app-card devices-overview-panel dashboard-devices-card">
            <div className="app-section-title dashboard-section-title-row">
              <div>
                <h2>Devices Overview</h2>
                <p>ภาพรวมสถานะอุปกรณ์ทั้งหมด</p>
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
                      <span
                        className={`device-status-dot ${device.status || 'offline'}`}
                      />
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

                    <div className="overview-last-update">
                      Updated{' '}
                      {formatRelativeTime(
                        device.latest_time || device.last_ingest_at
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
      )}

      {dashboardDisplay.showDeviceMap && (
        <section className="app-card dashboard-map-card-v2">
          <Suspense
            fallback={
              <div className="dashboard-map-loading">
                <div className="dashboard-map-loading-icon" />
                <div>
                  <strong>Loading device map</strong>
                  <p>กำลังโหลดแผนที่และตำแหน่งอุปกรณ์</p>
                </div>
              </div>
            }
          >
            <DeviceMap devices={devices} onOpenDevice={onOpenDevice} />
          </Suspense>
        </section>
      )}

      <section className="dashboard-alerts-under-map">
        <LatestActiveAlarms limit={6} />
        <AlarmPanel />
      </section>
    </div>
  )
}

export default Dashboard
