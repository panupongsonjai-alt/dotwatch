import React, { useEffect, useState } from 'react'
import DeviceCard from '../components/DeviceCard.jsx'
import {
  getDevices,
  addDevice,
  deleteDevice,
  updateDeviceName,
  resetDeviceSecret,
} from '../services/api'

function createDeviceCode() {
  return `dotwatch-${Date.now()}`
}

function createDeviceSecret() {
  return crypto.randomUUID()
}

function Device() {
  const [devices, setDevices] = useState([])
  const [deviceName, setDeviceName] = useState('')
  const [editingDeviceId, setEditingDeviceId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadDevices() {
    try {
      setLoading(true)
      const data = await getDevices()
      setDevices(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Load devices error:', error)
      alert('โหลดข้อมูล Device ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  const handleAddDevice = async () => {
    try {
      const name = deviceName.trim() || `dotWatch ${devices.length + 1}`
      const deviceCode = createDeviceCode()
      const deviceSecret = createDeviceSecret()

      setSaving(true)

      const created = await addDevice({
        deviceCode,
        name,
        deviceSecret,
      })

      setDeviceName('')
      await loadDevices()

      alert(
        `เพิ่ม Device สำเร็จ\n\nDevice Code:\n${created.device_code}\n\nDevice Secret:\n${created.deviceSecret}\n\nกรุณาเก็บ Device Secret นี้ไว้ เพราะจะแสดงครั้งเดียว`
      )
    } catch (error) {
      console.error('Add device error:', error)
      alert(error.message || 'เพิ่ม Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDeviceName = async (deviceId) => {
    if (!editingName.trim()) {
      alert('กรุณากรอกชื่อ Device')
      return
    }

    try {
      setSaving(true)
      await updateDeviceName(deviceId, editingName.trim())
      setEditingDeviceId(null)
      setEditingName('')
      await loadDevices()
    } catch (error) {
      console.error('Update device error:', error)
      alert(error.message || 'แก้ไขชื่อ Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDevice = async (deviceId) => {
    const ok = confirm('ต้องการลบ Device นี้ใช่ไหม?')
    if (!ok) return

    try {
      setSaving(true)
      await deleteDevice(deviceId)
      await loadDevices()
    } catch (error) {
      console.error('Delete device error:', error)
      alert(error.message || 'ลบ Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const handleResetSecret = async (device) => {
    const ok = confirm(
      `ต้องการ Reset Secret ของ ${device.name || device.device_code} ใช่ไหม?\n\nSecret เดิมจะใช้งานไม่ได้ทันที`
    )

    if (!ok) return

    try {
      setSaving(true)

      const result = await resetDeviceSecret(device.id)
      await loadDevices()

      alert(
        `Reset Secret สำเร็จ\n\nDevice Code:\n${result.device_code}\n\nDevice Secret ใหม่:\n${result.deviceSecret}\n\nกรุณา Copy เก็บไว้ทันที`
      )
    } catch (error) {
      console.error('Reset secret error:', error)
      alert(error.message || 'Reset Secret ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="section-title">
          <h2>Device Management</h2>
          <p>จัดการอุปกรณ์ dotWatch ผ่าน Backend + TimescaleDB</p>
        </div>

        <div className="device-add-row">
          <input
            type="text"
            placeholder="ชื่อ Device เช่น dotWatch 01"
            value={deviceName}
            disabled={saving}
            onChange={(e) => setDeviceName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddDevice()
            }}
          />

          <button
            className="primary-button device-add-btn"
            onClick={handleAddDevice}
            disabled={saving}
          >
            {saving ? 'กำลังบันทึก...' : '+ เพิ่ม Device'}
          </button>
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
              <div key={device.id} className="device-list-item">
                {editingDeviceId === device.id && (
                  <div className="device-edit-row">
                    <input
                      className="device-edit-input"
                      type="text"
                      value={editingName}
                      disabled={saving}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="ชื่อ Device"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveDeviceName(device.id)
                        }

                        if (e.key === 'Escape') {
                          setEditingDeviceId(null)
                          setEditingName('')
                        }
                      }}
                    />

                    <button
                      className="save-btn"
                      disabled={saving}
                      onClick={() => handleSaveDeviceName(device.id)}
                    >
                      บันทึก
                    </button>

                    <button
                      className="cancel-btn"
                      disabled={saving}
                      onClick={() => {
                        setEditingDeviceId(null)
                        setEditingName('')
                      }}
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}

                <DeviceCard
                  device={{
                    ...device,
                    deviceId: device.device_code,
                    lastSeen: device.latest_time || device.last_seen_at,
                  }}
                />

                <div className="device-actions">
                  {editingDeviceId !== device.id && (
                    <button
                      className="rename-btn"
                      disabled={saving}
                      onClick={() => {
                        setEditingDeviceId(device.id)
                        setEditingName(device.name || '')
                      }}
                    >
                      แก้ไขชื่อ
                    </button>
                  )}

                  <button
                    className="save-btn"
                    disabled={saving}
                    onClick={() => handleResetSecret(device)}
                  >
                    Reset Secret
                  </button>

                  <button
                    className="delete-btn"
                    disabled={saving}
                    onClick={() => handleDeleteDevice(device.id)}
                  >
                    ลบ Device
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Device