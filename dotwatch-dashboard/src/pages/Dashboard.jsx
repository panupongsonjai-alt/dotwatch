import { useEffect, useState } from 'react'
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

  function getDeviceHealth(device) {
    if (device.status === 'offline') {
      return { className: 'critical' }
    }

    if (device.status === 'warning') {
      return { className: 'warning' }
    }

    return { className: 'healthy' }
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
        console.log('Realtime payload:', payload)

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

  const healthSummary = devices.reduce(
    (summary, device) => {
      const health = getDeviceHealth(device)
      summary[health.className] += 1
      return summary
    },
    {
      healthy: 0,
      warning: 0,
      critical: 0,
    }
  )

  return (
    <div className="page app-page dashboard-page">
      <section className="app-page-header">
        <div>
          <span className="page-eyebrow">Overview</span>
          <h2>Dashboard</h2>
          <p>ภาพรวมสถานะอุปกรณ์, Alarm และตำแหน่งล่าสุดของระบบ dotWatch</p>
        </div>
      </section>

      <section className="app-summary-grid compact-summary-grid">
        <div className="app-summary-card compact-summary-card">
          <span>Total</span>
          <strong>{loading ? '...' : devices.length}</strong>
        </div>

        <div className="app-summary-card compact-summary-card">
          <span>Online</span>
          <strong>{loading ? '...' : onlineCount}</strong>
        </div>

        <div className="app-summary-card compact-summary-card">
          <span>Offline</span>
          <strong>{loading ? '...' : offlineCount}</strong>
        </div>

        <div className="app-summary-card compact-summary-card alarm-summary-card">
          <span>Alarm</span>
          <strong>{alarmCount}</strong>
        </div>

        <div className="app-summary-card compact-summary-card">
          <span>Warning</span>
          <strong>{healthSummary.warning}</strong>
        </div>

        <div className="app-summary-card compact-summary-card">
          <span>Critical</span>
          <strong>{healthSummary.critical}</strong>
        </div>
      </section>

      <section className="dashboard-main-grid">
        {dashboardDisplay.showDeviceOverview && (
          <section className="app-card">
            <div className="app-section-title">
              <h2>Devices Overview</h2>
              <p>
                Metric ล่าสุดจากอุปกรณ์ทั้งหมดตามชื่อและหน่วยที่ตั้งไว้ในหน้า
                Device
              </p>
            </div>

            {loading ? (
              <div className="app-empty-state">
                <h3>กำลังโหลดข้อมูล</h3>
                <p>กำลังดึงข้อมูล Device จาก Backend</p>
              </div>
            ) : devices.length === 0 ? (
              <div className="app-empty-state">
                <h3>ไม่พบ Device</h3>
                <p>ยังไม่มี Device ในระบบ</p>
              </div>
            ) : (
              <div className="overview-grid">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="overview-card compact"
                    onClick={() => onOpenDevice?.(device.id)}
                  >
                    <div className="overview-name">
                      {device.name || device.device_code || 'Unnamed Device'}
                    </div>

                    {device.model_name && (
                      <div className="device-model-badge">
                        {device.model_name}
                      </div>
                    )}

                    <div className="overview-values dynamic-overview-values">
                      {getDeviceVisibleMetrics(device).map((metric) => (
                        <span
                          key={metric.id || metric.metric_key}
                          title={metric.metric_name}
                        >
                          <MetricIcon name={metric.icon} size={14} />
                          {metric.metric_name}:{' '}
                          {getDisplayValue(device, metric)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <section className="dashboard-alarm-column">
              <AlarmPanel />
            </section>
          </section>
        )}
      </section>

      {dashboardDisplay.showDeviceMap && (
        <DeviceMap devices={devices} onOpenDevice={onOpenDevice} />
      )}
    </div>
  )
}

export default Dashboard
