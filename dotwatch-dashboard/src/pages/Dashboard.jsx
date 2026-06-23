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

  useEffect(() => {
    loadDisplaySettings()
    loadDevices()
    loadAlarms()

    window.addEventListener('dashboardSettingsChanged', loadDisplaySettings)
    window.addEventListener('dotwatchMetricConfigChanged', loadDevices)

    const user = auth.currentUser

    if (user) {
      connectRealtime(user.uid, (payload) => {
        if (payload.type === 'reading') {
          const reading = payload.data

          setDevices((prev) =>
            prev.map((device) =>
              device.id === reading.id ? { ...device, ...reading } : device
            )
          )
        }

        if (payload.type === 'alarm') {
          payload.data.forEach(addAlarm)
          setAlarmCount((count) => count + payload.data.length)
        }
      })
    }

    return () => {
      disconnectRealtime()
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
          <span>Healthy</span>
          <strong>{healthSummary.healthy}</strong>
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

      <AlarmPanel />

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
                        {metric.metric_name}: {getDisplayValue(device, metric)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {dashboardDisplay.showDeviceMap && (
        <DeviceMap devices={devices} onOpenDevice={onOpenDevice} />
      )}
    </div>
  )
}

export default Dashboard
