import { useEffect, useMemo, useState } from 'react'

import CreateDeviceWizard from '../components/devices/CreateDeviceWizard.jsx'
import DeviceList from '../components/devices/DeviceList.jsx'
import SelectedDevicePanel from '../components/devices/SelectedDevicePanel.jsx'
import { PageHeader, StatCard } from '../components/common'
import { getStatus } from '../components/devices/deviceUtils.jsx'
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

  return (
    <div className="page app-page device-page device-v2-page">
      <PageHeader
        eyebrow="Devices"
        title="Device Operations Center"
        description="จัดการอุปกรณ์, Metric Display, Location, Secret และ Alarm Rules ของ dotWatch"
        meta={`${devices.length} Devices • ${onlineCount} Online • ${offlineCount} Offline`}
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={openCreateWizard}
            disabled={saving}
          >
            Create Device
          </button>
        }
      />

      <section className="devices-ops-stat-grid">
        <StatCard label="Total Devices" value={devices.length} hint="Registered" />
        <StatCard label="Online" value={onlineCount} hint="Active now" tone="success" />
        <StatCard label="Warning" value={warningCount} hint="Needs attention" tone="warning" />
        <StatCard label="Offline" value={offlineCount} hint="No recent data" tone="danger" />
      </section>

      <section className="devices-v2-shell">
        <DeviceList
          devices={devices}
          loading={loading}
          selectedDevice={selectedDevice}
          saving={saving}
          onCreate={openCreateWizard}
          onSelect={setSelectedDeviceId}
        />

        <main className="devices-v2-config">
          <SelectedDevicePanel
            selectedDevice={selectedDevice}
            selectedRules={selectedRules}
            saving={saving}
            editingDeviceId={editingDeviceId}
            editingName={editingName}
            setEditingDeviceId={setEditingDeviceId}
            setEditingName={setEditingName}
            setLocations={setLocations}
            onSaveDeviceName={handleSaveDeviceName}
            onDeleteDevice={handleDeleteDevice}
            onResetSecret={handleResetSecret}
            onSavePickedLocation={handleSavePickedLocation}
            onCreateMetricAlarm={handleCreateMetricAlarm}
            onUpdateMetricAlarm={handleUpdateMetricAlarm}
            onDeleteAlarmRule={handleDeleteAlarmRule}
          />
        </main>
      </section>

      <CreateDeviceWizard
        show={showCreateWizard}
        saving={saving}
        devices={devices}
        createStep={createStep}
        setCreateStep={setCreateStep}
        createForm={createForm}
        setCreateForm={setCreateForm}
        createdDevice={createdDevice}
        deviceModelOptions={DEVICE_MODEL_OPTIONS}
        onClose={closeCreateWizard}
        onCopy={copyText}
        onConfirmCreate={handleConfirmCreateDevice}
      />
    </div>
  )
}

export default Devices
