import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  KeyRound,
  Trash2,
  Edit3,
  Save,
  X,
  MapPin,
  RefreshCw,
  Cpu,
  Wifi,
  AlertTriangle,
  WifiOff,
  FlaskConical,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  ShieldCheck,
} from 'lucide-react'

import DeviceCard from '../components/DeviceCard.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import {
  getDevices,
  addDevice,
  deleteDevice,
  updateDeviceName,
  updateDeviceGroup,
  resetDeviceSecret,
  updateDeviceLocation,
} from '../services/api'

function createDeviceCode(type = 'normal') {
  const prefix = type === 'demo' ? 'dotwatch-demo' : 'dotwatch'
  return `${prefix}-${Date.now()}`
}

function createDeviceSecret() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function Device() {
  const [devices, setDevices] = useState([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('All')
  const [editingDeviceId, setEditingDeviceId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [locations, setLocations] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [createStep, setCreateStep] = useState(1)
  const [createForm, setCreateForm] = useState({
    type: 'normal',
    name: '',
    group: 'Default',
    deviceCode: '',
    deviceSecret: '',
  })

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

  const groups = useMemo(() => {
    return [
      'All',
      ...new Set(devices.map((device) => device.group_name || 'Default')),
    ]
  }, [devices])

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const keyword = `${device.name || ''} ${device.device_code || ''}`
        .toLowerCase()
        .trim()

      const matchSearch = keyword.includes(search.toLowerCase())
      const matchGroup =
        groupFilter === 'All' ||
        (device.group_name || 'Default') === groupFilter

      return matchSearch && matchGroup
    })
  }, [devices, search, groupFilter])

  const onlineCount = devices.filter((d) => d.status === 'online').length
  const warningCount = devices.filter((d) => d.status === 'warning').length
  const offlineCount = devices.length - onlineCount - warningCount

  function openCreateWizard(type = 'normal') {
    setCreateForm({
      type,
      name: '',
      group: type === 'demo' ? 'Demo' : 'Default',
      deviceCode: createDeviceCode(type),
      deviceSecret: createDeviceSecret(),
    })
    setCreateStep(1)
    setShowCreateWizard(true)
  }

  function closeCreateWizard() {
    if (saving) return
    setShowCreateWizard(false)
    setCreateStep(1)
  }

  function handleSelectCreateType(type) {
    setCreateForm((prev) => ({
      ...prev,
      type,
      group: type === 'demo' ? 'Demo' : prev.group || 'Default',
      deviceCode: createDeviceCode(type),
      deviceSecret: createDeviceSecret(),
    }))
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copy เรียบร้อย')
    } catch (error) {
      console.error('Copy error:', error)
      alert('ไม่สามารถ Copy ได้')
    }
  }

  async function handleConfirmCreateDevice() {
    try {
      setSaving(true)

      const name =
        createForm.name.trim() ||
        (createForm.type === 'demo'
          ? `Demo Device ${devices.length + 1}`
          : `dotWatch ${devices.length + 1}`)

      const groupName = createForm.type === 'demo' ? 'Demo' : createForm.group

      const created = await addDevice({
        deviceCode: createForm.deviceCode,
        name,
        deviceSecret: createForm.deviceSecret,
        groupName,
      })

      setShowCreateWizard(false)
      setCreateStep(1)

      await loadDevices()

      alert(
        `เพิ่ม Device สำเร็จ\n\nDevice Code:\n${created.device_code}\n\nDevice Secret:\n${created.deviceSecret}\n\nกรุณาเก็บ Device Secret นี้ไว้ เพราะจะแสดงครั้งเดียว`
      )
    } catch (error) {
      console.error('Create device error:', error)
      alert(error.message || 'เพิ่ม Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDeviceName(deviceId) {
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

  async function handleDeleteDevice(deviceId) {
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

  async function handleResetSecret(device) {
    const ok = confirm(
      `ต้องการ Reset Secret ของ ${
        device.name || device.device_code
      } ใช่ไหม?\n\nSecret เดิมจะใช้งานไม่ได้ทันที`
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

  async function handleChangeGroup(deviceId, groupName) {
    try {
      setSaving(true)
      await updateDeviceGroup(deviceId, groupName)
      await loadDevices()
    } catch (error) {
      console.error('Update group error:', error)
      alert('อัปเดต Group ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePickedLocation(device) {
    const location = locations[device.id]

    if (!location) {
      alert('กรุณาคลิกเลือกตำแหน่งบนแผนที่ก่อน')
      return
    }

    try {
      setSaving(true)
      await updateDeviceLocation(device.id, {
        latitude: location.latitude,
        longitude: location.longitude,
        mapUrl: null,
      })

      await loadDevices()
      alert('บันทึกตำแหน่ง Device สำเร็จ')
    } catch (error) {
      console.error('Save picked location error:', error)
      alert(error.message || 'บันทึกตำแหน่งไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <section className="device-management-page clean-device-page">
        <div className="device-management-header clean-device-header">
          <div>
            <span className="page-eyebrow">dotWatch Devices</span>
            <h2>Device Management</h2>
            <p>จัดการอุปกรณ์, Group, Secret และ Location ของระบบ dotWatch</p>
          </div>

          <button
            type="button"
            className="ghost-button clean-refresh-btn"
            onClick={loadDevices}
            disabled={loading || saving}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <div className="device-header-stats clean-device-stats">
          <div>
            <span>Total</span>
            <strong>{devices.length}</strong>
            <Cpu size={18} />
          </div>

          <div className="online">
            <span>Online</span>
            <strong>{onlineCount}</strong>
            <Wifi size={18} />
          </div>

          <div className="warning">
            <span>Warning</span>
            <strong>{warningCount}</strong>
            <AlertTriangle size={18} />
          </div>

          <div className="offline">
            <span>Offline</span>
            <strong>{offlineCount}</strong>
            <WifiOff size={18} />
          </div>
        </div>

        <div className="device-control-card clean-device-toolbar">
          <div className="device-add-box">
            <button
              className="primary-button"
              onClick={() => openCreateWizard('normal')}
              disabled={saving}
            >
              <Plus size={18} />
              Create Device
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-device clean-empty-state">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Device จาก Backend</p>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="empty-device clean-empty-state">
            <h3>ไม่พบ Device</h3>
            <p>ลองเปลี่ยนคำค้นหา หรือเพิ่มอุปกรณ์ใหม่</p>
          </div>
        ) : (
          <div className="device-management-grid clean-device-grid">
            {filteredDevices.map((device) => (
              <article
                key={device.id}
                className="device-management-card clean-device-card"
              >
                <div className="device-management-card-header clean-device-card-header">
                  <div>
                    <h3>{device.name || device.device_code}</h3>
                    <p>{device.device_code}</p>
                  </div>

                  <span className={`status ${device.status || 'offline'}`}>
                    {device.status || 'offline'}
                  </span>
                </div>

                {editingDeviceId === device.id && (
                  <div className="device-edit-row clean">
                    <input
                      className="device-edit-input"
                      type="text"
                      value={editingName}
                      disabled={saving}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="ชื่อ Device"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveDeviceName(device.id)

                        if (e.key === 'Escape') {
                          setEditingDeviceId(null)
                          setEditingName('')
                        }
                      }}
                    />

                    <button
                      className="save-btn square"
                      disabled={saving}
                      onClick={() => handleSaveDeviceName(device.id)}
                      title="Save"
                    >
                      <Save size={16} />
                    </button>

                    <button
                      className="cancel-btn square"
                      disabled={saving}
                      onClick={() => {
                        setEditingDeviceId(null)
                        setEditingName('')
                      }}
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                <div className="device-management-meta clean-device-meta">
                  <label>
                    Group
                    <select
                      value={device.group_name || 'Default'}
                      disabled={saving}
                      onChange={(e) =>
                        handleChangeGroup(device.id, e.target.value)
                      }
                    >
                      <option value="Default">Default</option>
                      <option value="Server Room">Server Room</option>
                      <option value="Warehouse">Warehouse</option>
                      <option value="Factory">Factory</option>
                      <option value="Demo">Demo</option>
                    </select>
                  </label>
                </div>

                <DeviceCard
                  device={{
                    ...device,
                    deviceId: device.device_code,
                    lastSeen: device.latest_time || device.last_seen_at,
                  }}
                />

                <div className="device-location-section compact clean-location-card">
                  <div className="device-location-header">
                    <strong>
                      <MapPin size={16} />
                      Device Location
                    </strong>
                    <span>คลิกบนแผนที่เพื่อเลือกตำแหน่ง</span>
                  </div>

                  <LocationPicker
                    latitude={device.latitude}
                    longitude={device.longitude}
                    onChange={(location) =>
                      setLocations((prev) => ({
                        ...prev,
                        [device.id]: location,
                      }))
                    }
                  />

                  <button
                    type="button"
                    className="save-btn location-save-btn"
                    disabled={saving}
                    onClick={() => handleSavePickedLocation(device)}
                  >
                    Save Map Location
                  </button>
                </div>

                <div className="device-action-row clean-device-actions">
                  {editingDeviceId !== device.id && (
                    <button
                      className="rename-btn"
                      disabled={saving}
                      onClick={() => {
                        setEditingDeviceId(device.id)
                        setEditingName(device.name || '')
                      }}
                    >
                      <Edit3 size={16} />
                      แก้ไขชื่อ
                    </button>
                  )}

                  <button
                    className="save-btn"
                    disabled={saving}
                    onClick={() => handleResetSecret(device)}
                  >
                    <KeyRound size={16} />
                    Reset Secret
                  </button>

                  <button
                    className="delete-btn"
                    disabled={saving}
                    onClick={() => handleDeleteDevice(device.id)}
                  >
                    <Trash2 size={16} />
                    ลบ Device
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showCreateWizard && (
        <div className="modal-backdrop">
          <div className="device-create-modal clean-device-modal pro-device-modal">
            <div className="modal-header pro-modal-header">
              <div>
                <span className="page-eyebrow">Device Setup</span>
                <h3>Create Device</h3>
                <p>สร้างอุปกรณ์ใหม่สำหรับใช้งานกับ dotWatch</p>
              </div>

              <button
                type="button"
                onClick={closeCreateWizard}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="pro-stepper">
              <div className={createStep >= 1 ? 'active' : ''}>
                <span>1</span>
                <strong>Create</strong>
                <small>เลือกประเภท</small>
              </div>

              <div className={createStep >= 2 ? 'active' : ''}>
                <span>2</span>
                <strong>Details</strong>
                <small>กรอกข้อมูล</small>
              </div>

              <div className={createStep >= 3 ? 'active' : ''}>
                <span>3</span>
                <strong>Confirm</strong>
                <small>ตรวจสอบ</small>
              </div>
            </div>

            <div className="pro-wizard-content">
              {createStep === 1 && (
                <div className="pro-device-type-grid">
                  <button
                    type="button"
                    className={
                      createForm.type === 'normal'
                        ? 'pro-device-type-card active'
                        : 'pro-device-type-card'
                    }
                    onClick={() => handleSelectCreateType('normal')}
                  >
                    <div className="type-icon">
                      <Cpu size={24} />
                    </div>

                    <strong>Normal Device</strong>
                    <p>อุปกรณ์จริงสำหรับ ESP / Sensor ที่ใช้งานภาคสนาม</p>

                    <ul>
                      <li>ใช้ Device Secret จริง</li>
                      <li>เหมาะสำหรับติดตั้งหน้างาน</li>
                      <li>จัดกลุ่มได้ตามพื้นที่</li>
                    </ul>

                    {createForm.type === 'normal' && (
                      <span className="selected-mark">
                        <CheckCircle2 size={18} />
                        Selected
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className={
                      createForm.type === 'demo'
                        ? 'pro-device-type-card active'
                        : 'pro-device-type-card'
                    }
                    onClick={() => handleSelectCreateType('demo')}
                  >
                    <div className="type-icon demo">
                      <FlaskConical size={24} />
                    </div>

                    <strong>Demo Device</strong>
                    <p>อุปกรณ์ทดลองสำหรับทดสอบ Dashboard และข้อมูลจำลอง</p>

                    <ul>
                      <li>อยู่ใน Group Demo</li>
                      <li>สร้างเหมือน Device ปกติ</li>
                      <li>เหมาะสำหรับทดสอบระบบ</li>
                    </ul>

                    {createForm.type === 'demo' && (
                      <span className="selected-mark">
                        <CheckCircle2 size={18} />
                        Selected
                      </span>
                    )}
                  </button>
                </div>
              )}

              {createStep === 2 && (
                <div className="pro-device-details">
                  <div className="pro-form-card">
                    <label>
                      Device Name
                      <input
                        value={createForm.name}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder={
                          createForm.type === 'demo'
                            ? 'Demo Device 01'
                            : 'dotWatch 01'
                        }
                      />
                    </label>

                    <label>
                      Group
                      <select
                        value={createForm.group}
                        disabled={createForm.type === 'demo'}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            group: e.target.value,
                          }))
                        }
                      >
                        <option value="Default">Default</option>
                        <option value="Server Room">Server Room</option>
                        <option value="Warehouse">Warehouse</option>
                        <option value="Factory">Factory</option>
                        <option value="Demo">Demo</option>
                      </select>
                    </label>

                    <label>
                      Device Code
                      <div className="copy-input">
                        <input value={createForm.deviceCode} disabled />
                        <button
                          type="button"
                          onClick={() => copyText(createForm.deviceCode)}
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="pro-info-card">
                    <ShieldCheck size={28} />
                    <h4>Device Secret</h4>
                    <p>
                      ระบบจะสร้าง Device Secret อัตโนมัติ
                      และจะแสดงหลังสร้างสำเร็จเพียงครั้งเดียวเท่านั้น
                    </p>
                  </div>
                </div>
              )}

              {createStep === 3 && (
                <div className="pro-confirm-layout">
                  <div className="confirm-summary-card">
                    <h4>Confirm Device</h4>

                    <div className="confirm-row">
                      <span>Type</span>
                      <strong>
                        {createForm.type === 'demo'
                          ? 'Demo Device'
                          : 'Normal Device'}
                      </strong>
                    </div>

                    <div className="confirm-row">
                      <span>Name</span>
                      <strong>
                        {createForm.name.trim() ||
                          (createForm.type === 'demo'
                            ? `Demo Device ${devices.length + 1}`
                            : `dotWatch ${devices.length + 1}`)}
                      </strong>
                    </div>

                    <div className="confirm-row">
                      <span>Group</span>
                      <strong>
                        {createForm.type === 'demo' ? 'Demo' : createForm.group}
                      </strong>
                    </div>

                    <div className="confirm-row">
                      <span>Device Code</span>
                      <strong>{createForm.deviceCode}</strong>
                    </div>

                    <div className="confirm-warning">
                      <KeyRound size={18} />
                      Device Secret จะแสดงหลังสร้างสำเร็จครั้งเดียว กรุณา Copy
                      เก็บไว้ทันที
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions pro-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={closeCreateWizard}
                disabled={saving}
              >
                Cancel
              </button>

              <div>
                {createStep > 1 && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setCreateStep((step) => step - 1)}
                    disabled={saving}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                )}

                {createStep < 3 ? (
                  <button
                    type="button"
                    className="primary-button modal-next-button"
                    onClick={() => setCreateStep((step) => step + 1)}
                    disabled={saving}
                  >
                    Next
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-button modal-next-button"
                    onClick={handleConfirmCreateDevice}
                    disabled={saving}
                  >
                    {saving ? 'Creating...' : 'Confirm Create'}
                    <CheckCircle2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Device
