import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Cpu,
  Edit3,
  KeyRound,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

import LocationPicker from '../components/LocationPicker.jsx'
import MetricConfigPanel from '../components/MetricConfigPanel.jsx'
import {
  addDevice,
  createAlarmRule,
  deleteAlarmRule,
  deleteDevice,
  getAlarmRules,
  getDevices,
  resetDeviceSecret,
  updateAlarmRule,
  updateDeviceLocation,
  updateDeviceName,
} from '../services/api'

const DEVICE_MODEL_OPTIONS = [
  {
    id: 1,
    modelKey: 'dw_2ch',
    name: 'DW2CH',
    description: 'ESP / 2 Channels',
  },
  {
    id: 2,
    modelKey: 'dw_10ch',
    name: 'DW10CH',
    description: 'ESP / 10 Channels',
  },
  {
    id: 3,
    modelKey: 'dw_20ch',
    name: 'DW20CH',
    description: 'Raspberry Pi / 20 Channels',
  },
]

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
  return device?.status || 'offline'
}

function getStatusLabel(status) {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  return 'Offline'
}

function getStatusIcon(status) {
  if (status === 'online') return <Wifi size={15} />
  if (status === 'warning') return <AlertTriangle size={15} />
  return <WifiOff size={15} />
}

function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function getLastSeen(device) {
  return formatDate(device?.latest_time || device?.last_seen_at)
}

function getDeviceDisplayName(device) {
  return device?.name || device?.device_code || 'Unnamed Device'
}

function getModelLabel(device) {
  return device?.model_name || device?.model_key || 'Unknown Model'
}

function Devices() {
  const [devices, setDevices] = useState([])
  const [alarmRules, setAlarmRules] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
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
    modelId: 1,
    latitude: null,
    longitude: null,
    deviceCode: '',
    deviceSecret: '',
  })

  const selectedDevice = useMemo(() => {
    if (!devices.length) return null

    return (
      devices.find(
        (device) => String(device.id) === String(selectedDeviceId)
      ) || devices[0]
    )
  }, [devices, selectedDeviceId])

  const selectedRules = useMemo(() => {
    if (!selectedDevice) return []

    return alarmRules.filter(
      (rule) => Number(rule.device_id) === Number(selectedDevice.id)
    )
  }, [alarmRules, selectedDevice])

  const onlineCount = devices.filter(
    (device) => getStatus(device) === 'online'
  ).length

  const warningCount = devices.filter(
    (device) => getStatus(device) === 'warning'
  ).length

  const offlineCount = devices.length - onlineCount - warningCount

  async function loadDevices() {
    try {
      setLoading(true)

      const data = await getDevices()
      const nextDevices = Array.isArray(data) ? data : []

      setDevices(nextDevices)

      setSelectedDeviceId((current) => {
        if (
          current &&
          nextDevices.some((device) => String(device.id) === String(current))
        ) {
          return current
        }

        return nextDevices[0]?.id || null
      })
    } catch (error) {
      console.error('Load devices error:', error)
      alert(error.message || 'โหลดข้อมูล Device ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  async function loadAlarmRules() {
    try {
      const data = await getAlarmRules()
      setAlarmRules(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Load alarm rules error:', error)
    }
  }

  async function reloadAll() {
    await Promise.all([loadDevices(), loadAlarmRules()])
  }

  useEffect(() => {
    reloadAll()
  }, [])

  function openCreateWizard() {
    setCreateForm({
      name: '',
      modelId: 1,
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
        modelId: createForm.modelId,
      })

      const deviceCode = created?.device_code || createForm.deviceCode
      const deviceSecret = created?.deviceSecret || createForm.deviceSecret

      if (createForm.latitude != null && createForm.longitude != null) {
        const createdDeviceId = await findCreatedDeviceId(created, deviceCode)

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
        modelId: createForm.modelId,
        deviceCode,
        deviceSecret,
        latitude: createForm.latitude,
        longitude: createForm.longitude,
      })

      setCreateStep(4)
      await reloadAll()
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
      await reloadAll()
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

  async function handleCreateMetricAlarm(deviceId, metricKey, draft) {
    if (!metricKey) {
      alert('ไม่พบ Metric Key')
      return
    }

    if (draft.threshold === '' || Number.isNaN(Number(draft.threshold))) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    const existingRules = alarmRules.filter(
      (rule) =>
        Number(rule.device_id) === Number(deviceId) &&
        String(rule.metric) === String(metricKey)
    )

    if (existingRules.length >= 2) {
      alert('แต่ละ Metric ตั้ง Alarm Rule ได้สูงสุด 2 รายการ')
      return
    }

    try {
      setSaving(true)

      await createAlarmRule({
        device_id: deviceId,
        metric: metricKey,
        operator: draft.operator || '>',
        threshold: Number(draft.threshold),
        severity: draft.severity || 'warning',
      })

      await loadAlarmRules()
    } catch (error) {
      console.error('Create metric alarm rule error:', error)
      alert(error.message || 'เพิ่ม Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateMetricAlarm(ruleId, nextRule) {
    if (nextRule.threshold === '' || Number.isNaN(Number(nextRule.threshold))) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setSaving(true)

      await updateAlarmRule(ruleId, {
        device_id: nextRule.device_id,
        metric: nextRule.metric,
        operator: nextRule.operator || '>',
        threshold: Number(nextRule.threshold),
        severity: nextRule.severity || 'warning',
        is_active: nextRule.is_active,
      })

      await loadAlarmRules()
    } catch (error) {
      console.error('Update metric alarm rule error:', error)
      alert(error.message || 'แก้ไข Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAlarmRule(ruleId) {
    const ok = confirm('ต้องการลบ Alarm Rule นี้ใช่ไหม?')
    if (!ok) return

    try {
      setSaving(true)
      await deleteAlarmRule(ruleId)
      await loadAlarmRules()
    } catch (error) {
      console.error('Delete alarm rule error:', error)
      alert(error.message || 'ลบ Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function renderDeviceList() {
    if (loading) {
      return (
        <div className="app-empty-state compact-empty-state">
          <h3>กำลังโหลด</h3>
          <p>กำลังดึงข้อมูล Device</p>
        </div>
      )
    }

    if (!devices.length) {
      return (
        <div className="app-empty-state compact-empty-state">
          <h3>ยังไม่มี Device</h3>
          <p>กด Create เพื่อเริ่มต้น</p>
        </div>
      )
    }

    return devices.map((device) => {
      const status = getStatus(device)
      const active = String(selectedDevice?.id) === String(device.id)

      return (
        <button
          type="button"
          key={device.id}
          className={`devices-v2-item ${active ? 'active' : ''}`}
          onClick={() => setSelectedDeviceId(device.id)}
        >
          <div className="devices-v2-item-head">
            <div>
              <div className="devices-v2-item-name">
                {getDeviceDisplayName(device)}
              </div>

              <div className="devices-v2-item-code">{device.device_code}</div>
            </div>

            <span className={`status ${status}`}>
              {getStatusIcon(status)}
              {getStatusLabel(status)}
            </span>
          </div>

          <div className="devices-v2-item-foot">
            <span className="device-model-badge">{getModelLabel(device)}</span>
            <small>{getLastSeen(device)}</small>
          </div>
        </button>
      )
    })
  }

  function renderSelectedDevice() {
    if (!selectedDevice) {
      return (
        <section className="app-card">
          <div className="app-empty-state">
            <h3>ยังไม่ได้เลือก Device</h3>
            <p>เลือก Device จากรายการด้านซ้ายเพื่อจัดการ</p>
          </div>
        </section>
      )
    }

    const isEditing = editingDeviceId === selectedDevice.id
    const status = getStatus(selectedDevice)

    return (
      <>
        <section className="app-card devices-v2-overview-card">
          <div className="devices-v2-selected-header">
            <div className="devices-v2-selected-title">
              <span className="page-eyebrow">Selected Device</span>

              {isEditing ? (
                <div className="device-edit-row clean">
                  <input
                    className="device-edit-input"
                    type="text"
                    value={editingName}
                    disabled={saving}
                    onChange={(event) => setEditingName(event.target.value)}
                    placeholder="ชื่อ Device"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleSaveDeviceName(selectedDevice.id)
                      }

                      if (event.key === 'Escape') {
                        setEditingDeviceId(null)
                        setEditingName('')
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="save-btn square"
                    disabled={saving}
                    onClick={() => handleSaveDeviceName(selectedDevice.id)}
                    title="Save"
                  >
                    <Save size={16} />
                  </button>

                  <button
                    type="button"
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
              ) : (
                <>
                  <h3>{getDeviceDisplayName(selectedDevice)}</h3>
                  <p>{selectedDevice.device_code}</p>
                </>
              )}
            </div>

            <div className="device-action-row clean-device-actions">
              {!isEditing && (
                <button
                  type="button"
                  className="rename-btn"
                  disabled={saving}
                  onClick={() => {
                    setEditingDeviceId(selectedDevice.id)
                    setEditingName(selectedDevice.name || '')
                  }}
                >
                  <Edit3 size={16} />
                  Rename
                </button>
              )}

              <button
                type="button"
                className="save-btn"
                disabled={saving}
                onClick={() => handleResetSecret(selectedDevice)}
              >
                <KeyRound size={16} />
                Reset Secret
              </button>

              <button
                type="button"
                className="delete-btn"
                disabled={saving}
                onClick={() => handleDeleteDevice(selectedDevice.id)}
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>

          <div className="devices-v2-overview-grid">
            <div className="devices-v2-mini-stat">
              <span>Status</span>
              <strong className={`status-text ${status}`}>
                {getStatusLabel(status)}
              </strong>
            </div>

            <div className="devices-v2-mini-stat">
              <span>Model</span>
              <strong>{getModelLabel(selectedDevice)}</strong>
            </div>

            <div className="devices-v2-mini-stat">
              <span>Firmware</span>
              <strong>{selectedDevice.firmware_version || '--'}</strong>
            </div>

            <div className="devices-v2-mini-stat">
              <span>Last Seen</span>
              <strong>{getLastSeen(selectedDevice)}</strong>
            </div>
          </div>
        </section>

        <section className="app-card devices-v2-config-card">
          <div className="app-section-title">
            <h3>Metrics & Alarm Rules</h3>
            <p>ตั้งชื่อ Metric, หน่วย, การแสดงผล และ Alarm ของ Device นี้</p>
          </div>

          <MetricConfigPanel
            deviceId={selectedDevice.id}
            alarmRules={selectedRules}
            onCreateAlarm={(metricKey, draft) =>
              handleCreateMetricAlarm(selectedDevice.id, metricKey, draft)
            }
            onUpdateAlarm={handleUpdateMetricAlarm}
            onDeleteAlarm={handleDeleteAlarmRule}
          />
        </section>

        <section className="app-card devices-v2-config-card">
          <div className="device-location-header">
            <strong>
              <MapPin size={16} />
              Device Location
            </strong>
            <span>คลิกบนแผนที่เพื่อเลือกตำแหน่งของ Device</span>
          </div>

          <LocationPicker
            latitude={selectedDevice.latitude}
            longitude={selectedDevice.longitude}
            onChange={(location) =>
              setLocations((prev) => ({
                ...prev,
                [selectedDevice.id]: location,
              }))
            }
          />

          <button
            type="button"
            className="save-btn location-save-btn"
            disabled={saving}
            onClick={() => handleSavePickedLocation(selectedDevice)}
          >
            Save Map Location
          </button>
        </section>

        <section className="app-card devices-v2-config-card">
          <div className="app-section-title">
            <h3>Security</h3>
            <p>ข้อมูลสำหรับ Firmware / Gateway ใช้ยืนยันตัวตนกับ Backend</p>
          </div>

          <div className="device-info-grid">
            <div>
              <label>Device Code</label>
              <p>{selectedDevice.device_code}</p>
            </div>

            <div>
              <label>Device Secret</label>
              <p>ซ่อนเพื่อความปลอดภัย กด Reset เพื่อออก Secret ใหม่</p>
            </div>

            <div>
              <label>Device ID</label>
              <p>{selectedDevice.id}</p>
            </div>

            <div>
              <label>Created / Latest</label>
              <p>
                {formatDate(
                  selectedDevice.created_at || selectedDevice.latest_time
                )}
              </p>
            </div>
          </div>
        </section>
      </>
    )
  }

  function renderCreateWizard() {
    if (!showCreateWizard) return null

    const selectedModel = DEVICE_MODEL_OPTIONS.find(
      (model) => Number(model.id) === Number(createForm.modelId)
    )

    return (
      <div className="modal-backdrop">
        <div className="device-create-modal clean-device-modal pro-device-modal">
          <div className="modal-header pro-modal-header">
            <div>
              <span className="page-eyebrow">Device Setup</span>
              <h3>Create Device</h3>
              <p>สร้างอุปกรณ์ใหม่สำหรับใช้งานกับ dotWatch</p>
            </div>

            <button type="button" onClick={closeCreateWizard} disabled={saving}>
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
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      placeholder="เช่น AHU-01, PI Gateway, Main Meter"
                    />
                  </label>

                  <label>
                    Device Model
                    <select
                      value={createForm.modelId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          modelId: Number(event.target.value),
                        }))
                      }
                    >
                      {DEVICE_MODEL_OPTIONS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.description}
                        </option>
                      ))}
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

                  <label>
                    Device Secret
                    <div className="copy-input">
                      <input value={createForm.deviceSecret} disabled />
                      <button
                        type="button"
                        onClick={() => copyText(createForm.deviceSecret)}
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
                    ระบบจะสร้าง Device Secret อัตโนมัติ และจะแสดงหลังสร้างสำเร็จ
                    กรุณา Copy เก็บไว้ทันที
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
                    <span>Model</span>
                    <strong>{selectedModel?.name || '--'}</strong>
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
                    Device Secret จะแสดงหลังสร้างสำเร็จ กรุณา Copy เก็บไว้ทันที
                  </div>
                </div>
              </div>
            )}

            {createStep === 4 && createdDevice && (
              <div className="device-success-card">
                <CheckCircle2 size={44} />

                <h4>Device Created Successfully</h4>

                <p>กรุณา Copy Device Secret เก็บไว้ทันที</p>

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
    )
  }

  return (
    <div className="page app-page device-page device-v2-page">
      <section className="app-page-header device-v2-header">
        <div>
          <span className="page-eyebrow">Devices</span>
          <h2>Device Management</h2>
          <p>
            จัดการอุปกรณ์, Metric Display, Location, Secret และ Alarm Rules ของ
            dotWatch
          </p>
        </div>

        <div className="device-v2-header-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={reloadAll}
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
      </section>

      <section className="device-header-stats clean-device-stats app-summary-grid">
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
      </section>

      <section className="devices-v2-shell">
        <aside className="devices-v2-list">
          <div className="app-card devices-v2-list-card">
            <div className="app-section-title devices-v2-list-title">
              <div>
                <h3>Devices</h3>
                <p>{devices.length} devices registered</p>
              </div>
            </div>

            <div className="devices-v2-list-scroll">{renderDeviceList()}</div>
          </div>
        </aside>

        <main className="devices-v2-config">{renderSelectedDevice()}</main>
      </section>

      {renderCreateWizard()}
    </div>
  )
}

export default Devices
