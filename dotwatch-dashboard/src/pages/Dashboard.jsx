import { useEffect, useState } from 'react'
import { auth } from '../services/firebase'
import DashboardDeviceCard from '../components/DashboardDeviceCard.jsx'
import ChartWidget from '../components/ChartWidget.jsx'
import { getDevices } from '../services/api'
import { connectRealtime, disconnectRealtime } from '../services/realtime'

function Dashboard() {
  const [devices, setDevices] = useState([])
  const [projectName, setProjectName] = useState('dotWatch')
  const [loading, setLoading] = useState(true)

  async function loadDevices() {
    try {
      setLoading(true)
      const data = await getDevices()
      setDevices(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setProjectName(localStorage.getItem('projectName') || 'dotWatch')
    loadDevices()

    const user = auth.currentUser

    if (user) {
      connectRealtime(user.uid, (reading) => {
        setDevices((prevDevices) =>
          prevDevices.map((device) =>
            device.id === reading.id
              ? {
                  ...device,
                  ...reading,
                  temperature: reading.temperature,
                  humidity: reading.humidity,
                  latest_time: reading.latest_time,
                  last_seen_at: reading.last_seen_at,
                  status: reading.status || 'online',
                }
              : device
          )
        )
      })
    }

    return () => {
      disconnectRealtime()
    }
  }, [])

  const onlineCount = devices.filter(
    (device) => device.status === 'online'
  ).length

  const offlineCount = devices.length - onlineCount

  return (
    <div className="page">
      <section className="summary-grid">
        <div className="summary-card">
          <span>Total Devices</span>
          <strong>{loading ? '...' : devices.length}</strong>
        </div>

        <div className="summary-card">
          <span>Online</span>
          <strong>{loading ? '...' : onlineCount}</strong>
        </div>

        <div className="summary-card">
          <span>Offline</span>
          <strong>{loading ? '...' : offlineCount}</strong>
        </div>

        <div className="summary-card">
          <span>Project</span>
          <strong>{projectName}</strong>
        </div>
      </section>

      <ChartWidget />

      <section className="panel">
        <div className="section-title">
          <h2>Devices Overview</h2>
          <p>ข้อมูลล่าสุดจาก TimescaleDB แบบ Realtime</p>
        </div>

        {loading ? (
          <div className="empty-device">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Device จาก Backend</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="empty-device">
            <h3>ยังไม่มี Device</h3>
            <p>เพิ่ม Device เพื่อเริ่มรับข้อมูลจาก ESP หรือ Simulator</p>
          </div>
        ) : (
          <div className="device-grid">
            {devices.map((device) => (
              <DashboardDeviceCard
                key={device.id}
                device={{
                  ...device,
                  name: device.name,
                  deviceId: device.device_code,
                  status: device.status || 'offline',
                  temperature: device.temperature,
                  humidity: device.humidity,
                  lastSeen: device.latest_time || device.last_seen_at,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Dashboard