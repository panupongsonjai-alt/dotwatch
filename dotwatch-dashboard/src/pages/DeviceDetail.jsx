import { useEffect, useState } from 'react'
import { getDevice } from '../services/api'
import ChartWidget from '../components/ChartWidget.jsx'
import { auth } from '../services/firebase'
import { connectRealtime, disconnectRealtime } from '../services/realtime'

function DeviceDetail({ deviceId, onBack }) {
  const [device, setDevice] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadDevice() {
    try {
      setLoading(true)
      const data = await getDevice(deviceId)
      setDevice(data)
    } catch (error) {
      console.error(error)
      alert('โหลดข้อมูล Device ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
  const user = auth.currentUser

  if (!user || !deviceId) return

  connectRealtime(user.uid, (payload) => {
    if (payload.type !== 'reading') return

    const reading = payload.data

    if (String(reading.id) !== String(deviceId)) return

    setDevice((prev) => ({
      ...prev,
      ...reading,
      temperature: reading.temperature,
      humidity: reading.humidity,
      rssi: reading.rssi,
      status: reading.status || 'online',
      latest_time: reading.latest_time,
      last_seen_at: reading.last_seen_at,
    }))
  })

  return () => {
    disconnectRealtime()
  }
}, [deviceId])

  useEffect(() => {
    if (deviceId) loadDevice()
  }, [deviceId])

  if (loading) {
    return (
      <div className="page">
        <div className="panel">กำลังโหลด Device...</div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="page">
        <div className="panel">
          <button className="secondary-button" onClick={onBack}>
            ← Back
          </button>
          <p>ไม่พบ Device</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{device.name || 'Unnamed Device'}</h2>
            <p>{device.device_code}</p>
          </div>

          <button className="secondary-button" onClick={onBack}>
            ← Back
          </button>
        </div>

        <div className="device-detail-grid">
          <div className="summary-card">
            <span>Status</span>
            <strong>{device.status || 'offline'}</strong>
          </div>

          <div className="summary-card">
            <span>Group</span>
            <strong>{device.group_name || 'Default'}</strong>
          </div>

          <div className="summary-card">
            <span>Temperature</span>
            <strong>
              {device.temperature != null
                ? `${Number(device.temperature).toFixed(1)}°C`
                : '--'}
            </strong>
          </div>

          <div className="summary-card">
            <span>Humidity</span>
            <strong>
              {device.humidity != null
                ? `${Number(device.humidity).toFixed(1)}%`
                : '--'}
            </strong>
          </div>

          <div className="summary-card">
            <span>RSSI</span>
            <strong>{device.rssi != null ? `${device.rssi} dBm` : '--'}</strong>
          </div>

          <div className="summary-card">
            <span>Firmware</span>
            <strong>{device.firmware_version || '--'}</strong>
          </div>
        </div>

        <div className="device-detail-info">
          <p>
            <strong>Last Seen:</strong>{' '}
            {device.last_seen_at
              ? new Date(device.last_seen_at).toLocaleString('th-TH')
              : '--'}
          </p>

          <p>
            <strong>Latest Reading:</strong>{' '}
            {device.latest_time
              ? new Date(device.latest_time).toLocaleString('th-TH')
              : '--'}
          </p>
        </div>
      </section>

      <ChartWidget defaultDeviceId={deviceId} />
    </div>
  )
}

export default DeviceDetail