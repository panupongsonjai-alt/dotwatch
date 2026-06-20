import React, { useEffect, useState } from 'react'
import {
  Plus,
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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  ShieldCheck,
  Grid2X2,
  List,
  ChevronDown,
} from 'lucide-react'

import LocationPicker from '../components/LocationPicker.jsx'
import {
  getDevices,
  addDevice,
  deleteDevice,
  updateDeviceName,
  resetDeviceSecret,
  updateDeviceLocation,
} from '../services/api'

function createDeviceCode() {
  return `DW-${Date.now()}`
}

function createDeviceSecret() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getStatus(device) {
  return device.status || 'offline'
}

function getStatusLabel(status) {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  return 'Offline'
}

function getMetricValue(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return `--${unit}`
  return `${Number(value).toFixed(1)}${unit}`
}

function getLastSeen(device) {
  const value = device.latest_time || device.last_seen_at
  if (!value) return 'No data yet'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function Devices() {
  const [devices, setDevices] = useState([])
  const [viewMode, setViewMode] = useState('grid')
  const [expandedDeviceId, setExpandedDeviceId] = useState(null)
  const [editingDeviceId, setEditingDeviceId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [locations, setLocations] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [createStep, setCreateStep] = useState(1)
  const [createdDevice, setCreatedDevice] = useState(null)
  const [createForm, setCreateForm] = useState({
    name: '',
    latitude: null,
    longitude: null,
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

  const filteredDevices = devices

  const onlineCount = devices.filter((d) => getStatus(d) === 'online').length
  const warningCount = devices.filter((d) => getStatus(d) === 'warning').length
  const offlineCount = devices.length - onlineCount - warningCount

  function openCreateWizard() {
    setCreateForm({
      name: '',
      latitude: null,
      longitude: null,
      deviceCode: createDeviceCode(),
      deviceSecret: createDeviceSecret(),
    })

    setCreateStep(1)
    setCreatedDevice(null)
    setShowCreateWizard(true)
  }

  function closeCreateWizard() {
    if (saving) return
    setShowCreateWizard(false)
    setCreateStep(1)
    setCreatedDevice(null)
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

  async function findCreatedDeviceId(created, deviceCode) {
    if (created?.id) return created.id
    if (created?.device?.id) return created.device.id
    if (created?.deviceId) return created.deviceId

    const latestDevices = await getDevices()
    const matchedDevice = Array.isArray(latestDevices)
      ? latestDevices.find((device) => device.device_code === deviceCode)
      : null

    return matchedDevice?.id || null
  }

  async function handleConfirmCreateDevice() {
    try {
      setSaving(true)

      const name = createForm.name.trim() || `dotWatch ${devices.length + 1}`

      const created = await addDevice({
        deviceCode: createForm.deviceCode,
        name,
        deviceSecret: createForm.deviceSecret,
      })

      if (createForm.latitude != null && createForm.longitude != null) {
        const createdDeviceId = await findCreatedDeviceId(
          created,
          created.device_code || createForm.deviceCode
        )

        if (createdDeviceId) {
          await updateDeviceLocation(createdDeviceId, {
            latitude: createForm.latitude,
            longitude: createForm.longitude,
            mapUrl: null,
          })
        }
      }

      setCreatedDevice({
        name,
        deviceCode: created.device_code || createForm.deviceCode,
        deviceSecret: created.deviceSecret || createForm.deviceSecret,
        latitude: createForm.latitude,
        longitude: createForm.longitude,
      })

      setCreateStep(4)
      await loadDevices()
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

  function renderManagePanel(device) {
    const isEditing = editingDeviceId === device.id

    return (
      <div className="device-manage-panel">
        {isEditing && (
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
          {!isEditing && (
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
      </div>
    )
  }

  function renderGridView() {
    return (
      <div className="device-v2-grid">
        {filteredDevices.map((device) => {
          const status = getStatus(device)
          const isExpanded = expandedDeviceId === device.id

          return (
            <article key={device.id} className="device-v2-card">
              <div className="device-v2-card-header">
                <div>
                  <h3>{device.name || device.device_code}</h3>
                  <p>{device.device_code}</p>
                </div>

                <span className={`status ${status}`}>
                  {getStatusLabel(status)}
                </span>
              </div>

              <div className="device-v2-metrics">
                <div>
                  <span>🌡️</span>
                  <strong>{getMetricValue(device.temperature, '°C')}</strong>
                  <small>Temp</small>
                </div>

                <div>
                  <span>💧</span>
                  <strong>{getMetricValue(device.humidity, '%')}</strong>
                  <small>Humidity</small>
                </div>
              </div>

              <div className="device-v2-meta-row">
                <span>{getLastSeen(device)}</span>
              </div>

              <button
                type="button"
                className="device-detail-toggle"
                onClick={() =>
                  setExpandedDeviceId(isExpanded ? null : device.id)
                }
              >
                {isExpanded ? 'Hide Management' : 'Manage Device'}
                <ChevronDown size={16} className={isExpanded ? 'open' : ''} />
              </button>

              {isExpanded && renderManagePanel(device)}
            </article>
          )
        })}
      </div>
    )
  }

  function renderTableView() {
    return (
      <div className="device-v2-table-wrap">
        <table className="device-v2-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Status</th>
              <th>Temp</th>
              <th>Humidity</th>
              <th>Last Seen</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {filteredDevices.map((device) => {
              const status = getStatus(device)

              return (
                <React.Fragment key={device.id}>
                  <tr>
                    <td>
                      <strong>{device.name || device.device_code}</strong>
                      <span>{device.device_code}</span>
                    </td>

                    <td>
                      <span className={`status ${status}`}>
                        {getStatusLabel(status)}
                      </span>
                    </td>

                    <td>{getMetricValue(device.temperature, '°C')}</td>
                    <td>{getMetricValue(device.humidity, '%')}</td>
                    <td>{getLastSeen(device)}</td>

                    <td>
                      <button
                        type="button"
                        className="ghost-button table-manage-btn"
                        onClick={() =>
                          setExpandedDeviceId(
                            expandedDeviceId === device.id ? null : device.id
                          )
                        }
                      >
                        Manage
                      </button>
                    </td>
                  </tr>

                  {expandedDeviceId === device.id && (
                    <tr className="device-table-expand-row">
                      <td colSpan="6">{renderManagePanel(device)}</td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="device-management-page clean-device-page device-v2-page">
        <div className="device-management-header clean-device-header device-v2-header">
          <div>
            <h2>Device Management</h2>
            <p>จัดการอุปกรณ์, Secret และ Location ของระบบ dotWatch</p>
          </div>

          <div className="device-v2-header-actions">
            <button
              type="button"
              className="ghost-button clean-refresh-btn"
              onClick={loadDevices}
              disabled={loading || saving}
            >
              <RefreshCw size={17} />
              Refresh
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={openCreateWizard}
              disabled={saving}
            >
              <Plus size={18} />
              Create Device
            </button>
          </div>
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

        <div className="device-control-card clean-device-toolbar device-v2-toolbar">
          <div className="device-view-switch">
            <button
              type="button"
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              <Grid2X2 size={16} />
              Grid
            </button>

            <button
              type="button"
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
            >
              <List size={16} />
              Table
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
            <h3>ยังไม่มี Device</h3>
            <p>เพิ่มอุปกรณ์ใหม่เพื่อเริ่มใช้งาน dotWatch</p>
          </div>
        ) : viewMode === 'grid' ? (
          renderGridView()
        ) : (
          renderTableView()
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

            <div className="pro-stepper four-step">
              <div className={createStep >= 1 ? 'active' : ''}>
                <span>1</span>
                <strong>Information</strong>
              </div>

              <div className={createStep >= 2 ? 'active' : ''}>
                <span>2</span>
                <strong>Location</strong>
              </div>

              <div className={createStep >= 3 ? 'active' : ''}>
                <span>3</span>
                <strong>Review</strong>
              </div>

              <div className={createStep >= 4 ? 'active' : ''}>
                <span>4</span>
                <strong>Success</strong>
                <small>Copy Secret</small>
              </div>
            </div>

            <div className="pro-wizard-content">
              {createStep === 1 && (
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
                        placeholder="Temperature Sensor"
                      />
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
                </div>
              )}

              {createStep === 2 && (
                <div className="pro-device-details">
                  <div className="pro-location-card">
                    <div className="device-location-header">
                      <strong>
                        <MapPin size={16} />
                        Device Location
                      </strong>
                      <span>เลือกตำแหน่งอุปกรณ์ตั้งแต่ขั้นตอนสร้าง Device</span>
                    </div>

                    <LocationPicker
                      latitude={createForm.latitude}
                      longitude={createForm.longitude}
                      onChange={(location) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          latitude: location.latitude,
                          longitude: location.longitude,
                        }))
                      }
                    />

                    <div className="create-location-values">
                      <span>
                        Lat:{' '}
                        {createForm.latitude != null
                          ? Number(createForm.latitude).toFixed(6)
                          : '--'}
                      </span>

                      <span>
                        Lng:{' '}
                        {createForm.longitude != null
                          ? Number(createForm.longitude).toFixed(6)
                          : '--'}
                      </span>
                    </div>
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
                      <span>Name</span>
                      <strong>
                        {createForm.name.trim() ||
                          `dotWatch ${devices.length + 1}`}
                      </strong>
                    </div>

                    <div className="confirm-row">
                      <span>Device Code</span>
                      <strong>{createForm.deviceCode}</strong>
                    </div>

                    <div className="confirm-row">
                      <span>Location</span>
                      <strong>
                        {createForm.latitude != null &&
                        createForm.longitude != null
                          ? `${Number(createForm.latitude).toFixed(6)}, ${Number(
                              createForm.longitude
                            ).toFixed(6)}`
                          : 'Not selected'}
                      </strong>
                    </div>

                    <div className="confirm-warning">
                      <KeyRound size={18} />
                      Device Secret จะแสดงหลังสร้างสำเร็จครั้งเดียว กรุณา Copy
                      เก็บไว้ทันที
                    </div>
                  </div>
                </div>
              )}

              {createStep === 4 && createdDevice && (
                <div className="device-success-card">
                  <CheckCircle2 size={44} />

                  <h4>Device Created Successfully</h4>

                  <p>
                    กรุณา Copy Device Secret เก็บไว้ทันที เพราะจะแสดงครั้งเดียว
                  </p>

                  <div className="secret-result-box">
                    <label>
                      Device Code
                      <div className="copy-input">
                        <input value={createdDevice.deviceCode} disabled />
                        <button
                          type="button"
                          onClick={() => copyText(createdDevice.deviceCode)}
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </label>

                    {createdDevice.latitude != null &&
                      createdDevice.longitude != null && (
                        <label>
                          Location
                          <input
                            value={`${Number(createdDevice.latitude).toFixed(
                              6
                            )}, ${Number(createdDevice.longitude).toFixed(6)}`}
                            disabled
                          />
                        </label>
                      )}

                    <label>
                      Device Secret
                      <div className="copy-input">
                        <input value={createdDevice.deviceSecret} disabled />
                        <button
                          type="button"
                          onClick={() => copyText(createdDevice.deviceSecret)}
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </label>
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
                {createStep === 4 ? 'Done' : 'Cancel'}
              </button>

              {createStep < 4 && (
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Devices
