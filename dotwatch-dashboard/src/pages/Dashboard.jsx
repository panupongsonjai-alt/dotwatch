import React, { useEffect, useState } from 'react'
import DashboardDeviceCard from '../components/DashboardDeviceCard.jsx'
import ChartWidget from '../components/ChartWidget.jsx'
import { getDevices } from '../services/api'
import { auth } from '../services/firebase'

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
      console.error('Load devices error:', error)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
  async function printToken() {
    const user = auth.currentUser

    if (!user) {
      console.log('No user logged in')
      return
    }

    const token = await user.getIdToken()
    console.log('Firebase ID Token:', token)
  }

  printToken()
}, [])

  useEffect(() => {
    loadDevices()

    const name = localStorage.getItem('projectName') || 'dotWatch'
    setProjectName(name)
  }, [])

  const onlineCount = devices.filter(
    (device) => device.status === 'online'
  ).length

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
          <strong>{loading ? '...' : devices.length - onlineCount}</strong>
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
          <p>สถานะล่าสุดของอุปกรณ์ในระบบ</p>
        </div>

        {loading ? (
          <div className="empty-device">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Device จาก Backend</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="empty-device">
            <h3>ยังไม่มี Device</h3>
            <p>เพิ่มอุปกรณ์ dotWatch เพื่อเริ่มติดตามข้อมูล Sensor</p>
          </div>
        ) : (
          <div className="device-grid">
            {devices.map((device) => (
              <DashboardDeviceCard
                key={device.id}
                device={device}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Dashboard