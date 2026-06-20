import { useEffect, useState } from 'react'
import { auth } from '../services/firebase'
import ChartWidget from '../components/ChartWidget.jsx'
import AlarmPanel from '../components/AlarmPanel.jsx'
import { getDevices, getAlarms } from '../services/api'
import { connectRealtime, disconnectRealtime } from '../services/realtime'
import { useAlarm } from '../context/AlarmContext'
import DeviceMap from '../components/DeviceMap'

function Dashboard({ onOpenDevice }) {
  const [devices, setDevices] = useState([])
  const [projectName, setProjectName] = useState('dotWatch')
  const [loading, setLoading] = useState(true)
  const [alarmCount, setAlarmCount] = useState(0)

  const { addAlarm } = useAlarm()

  async function loadDevices() {
    try {
      setLoading(true)
      const data = await getDevices()
      setDevices(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Load devices error:', error)
      setDevices([])
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

  function getDeviceHealth(device) {
    if (device.status === 'offline') {
      return {
        label: 'Critical',
        className: 'critical',
        reason: 'Device offline',
      }
    }

    if (device.status === 'warning') {
      return {
        label: 'Warning',
        className: 'warning',
        reason: 'No recent data',
      }
    }

    if (device.rssi != null && Number(device.rssi) < -85) {
      return {
        label: 'Warning',
        className: 'warning',
        reason: 'Weak signal',
      }
    }

    return {
      label: 'Healthy',
      className: 'healthy',
      reason: 'Normal',
    }
  }

  useEffect(() => {
    setProjectName(localStorage.getItem('projectName') || 'dotWatch')
    loadDevices()
    loadAlarms()

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
    }
  }, [addAlarm])

  const onlineCount = devices.filter(
    (device) => device.status === 'online'
  ).length

  const offlineCount = devices.length - onlineCount

  const offlineDeviceList = devices
    .filter((device) => device.status !== 'online')
    .slice(0, 5)

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
    <div className="page">
      <section className="summary-grid compact-summary-grid">
        <div className="summary-card compact-summary-card">
          <span>Project</span>
          <strong>{projectName}</strong>
        </div>

        <div className="summary-card compact-summary-card">
          <span>Total</span>
          <strong>{loading ? '...' : devices.length}</strong>
        </div>

        <div className="summary-card compact-summary-card">
          <span>Online</span>
          <strong>{loading ? '...' : onlineCount}</strong>
        </div>

        <div className="summary-card compact-summary-card">
          <span>Offline</span>
          <strong>{loading ? '...' : offlineCount}</strong>
        </div>

        <div className="summary-card compact-summary-card alarm-summary-card">
          <span>Alarm</span>
          <strong>{alarmCount}</strong>
        </div>

        <div className="summary-card compact-summary-card">
          <span>Healthy</span>
          <strong>{healthSummary.healthy}</strong>
        </div>

        <div className="summary-card compact-summary-card">
          <span>Warning</span>
          <strong>{healthSummary.warning}</strong>
        </div>

        <div className="summary-card compact-summary-card">
          <span>Critical</span>
          <strong>{healthSummary.critical}</strong>
        </div>
      </section>

      <AlarmPanel />

      <section className="panel">
        <div className="section-title">
          <h2>Devices Overview</h2>
          <p>Temperature & Humidity ล่าสุดจากอุปกรณ์ทั้งหมด</p>
        </div>

        {loading ? (
          <div className="empty-device">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Device จาก Backend</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="empty-device">
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
                  {device.name || device.device_code}
                </div>

                <div className="overview-values">
                  <span>
                    🌡️{' '}
                    {device.temperature != null
                      ? Number(device.temperature).toFixed(1)
                      : '--'}
                    °C
                  </span>

                  <span>
                    💧{' '}
                    {device.humidity != null
                      ? Number(device.humidity).toFixed(1)
                      : '--'}
                    %
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <DeviceMap devices={devices} onOpenDevice={onOpenDevice} />
    </div>
  )
}

export default Dashboard
