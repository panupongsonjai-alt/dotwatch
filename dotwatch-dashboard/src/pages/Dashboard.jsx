import { useEffect, useState } from 'react'
import { auth } from '../services/firebase'
import DashboardDeviceCard from '../components/DashboardDeviceCard.jsx'
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
  const [selectedGroup, setSelectedGroup] = useState('All')

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

  const groups = [
    'All',
    ...new Set(devices.map((device) => device.group_name || 'Default')),
  ]

  const filteredDevices =
    selectedGroup === 'All'
      ? devices
      : devices.filter(
          (device) => (device.group_name || 'Default') === selectedGroup
        )

  const groupSummary = groups
    .filter((group) => group !== 'All')
    .map((group) => {
      const groupDevices = devices.filter(
        (device) => (device.group_name || 'Default') === group
      )

      return {
        group,
        total: groupDevices.length,
        online: groupDevices.filter((device) => device.status === 'online')
          .length,
        offline: groupDevices.filter((device) => device.status !== 'online')
          .length,
      }
    })

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

      <DeviceMap devices={devices} onOpenDevice={onOpenDevice} />

      <ChartWidget />

      <section className="panel">
        <div className="section-title">
          <h2>Group Summary</h2>
          <p>ภาพรวมสถานะอุปกรณ์แยกตามกลุ่ม</p>
        </div>

        <div className="group-summary-grid">
          {groupSummary.map((item) => (
            <div key={item.group} className="group-summary-card">
              <strong>{item.group}</strong>
              <span>Total {item.total}</span>
              <small>
                Online {item.online} • Offline {item.offline}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>Top Offline Devices</h2>
          <p>อุปกรณ์ที่ไม่ได้ส่งข้อมูลล่าสุด</p>
        </div>

        {offlineDeviceList.length === 0 ? (
          <div className="empty-device">
            <h3>ไม่มี Offline Device</h3>
            <p>อุปกรณ์ทั้งหมดกำลังออนไลน์</p>
          </div>
        ) : (
          <div className="offline-device-list">
            {offlineDeviceList.map((device) => (
              <div
                key={device.id}
                className="offline-device-item"
                onClick={() => onOpenDevice?.(device.id)}
              >
                <div>
                  <strong>{device.name || device.device_code}</strong>
                  <small>{device.group_name || 'Default'}</small>
                </div>

                <span className={`status ${device.status || 'offline'}`}>
                  {device.status || 'offline'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>Devices Overview</h2>
          <p>ข้อมูลล่าสุดจาก TimescaleDB แบบ Realtime</p>
        </div>

        <div className="device-group-filter">
          <span>Group</span>

          <select
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty-device">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Device จาก Backend</p>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="empty-device">
            <h3>ไม่พบ Device</h3>
            <p>ยังไม่มี Device ในกลุ่มนี้</p>
          </div>
        ) : (
          <div className="device-grid">
            {filteredDevices.map((device) => {
              const health = getDeviceHealth(device)

              return (
                <div
                  key={device.id}
                  className="clickable-device-card"
                  onClick={() => onOpenDevice?.(device.id)}
                >
                  <DashboardDeviceCard
                    device={{
                      ...device,
                      name: device.name,
                      deviceId: device.device_code,
                      status: device.status || 'offline',
                      temperature: device.temperature,
                      humidity: device.humidity,
                      rssi: device.rssi,
                      lastSeen: device.latest_time || device.last_seen_at,
                    }}
                    health={health}
                  />
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default Dashboard
