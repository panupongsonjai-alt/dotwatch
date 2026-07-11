import { useEffect, useMemo, useRef, useState } from 'react'

import CreateDeviceWizard from '../components/devices/CreateDeviceWizard.jsx'
import DeviceList from '../components/devices/DeviceList.jsx'
import SelectedDevicePanel from '../components/devices/SelectedDevicePanel.jsx'
import { PageHeader, StatCard } from '../components/common'
import { getStatus } from '../components/devices/deviceUtils.jsx'
import {
  confirmDeleteAction,
  confirmResetSecretAction,
} from '../utils/typedConfirm'
import {
  addDevice,
  createAlarmRule,
  deleteAlarmRule,
  deleteDevice,
  getAlarmRules,
  getDeviceModels,
  getDevices,
  resetDeviceSecret,
  saveAlarmRulesForDevice,
  updateAlarmRule,
  updateDeviceLocation,
  updateDeviceName,
} from '../services/api'
import '../styles/devices.css'
import '../styles/page-system.css'
const FALLBACK_DEVICE_MODEL_OPTIONS = [
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

function normalizeDeviceModel(model) {
  return {
    id: model.id,
    modelKey: model.modelKey || model.model_key,
    name: model.name || model.modelName || model.model_name || 'Device Model',
    description:
      model.description ||
      `${model.metricCount || model.metric_count || 0} metrics`,
    metricCount: model.metricCount || model.metric_count || 0,
  }
}

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
  const [deviceError, setDeviceError] = useState('')
  const [deviceModelOptions, setDeviceModelOptions] = useState(FALLBACK_DEVICE_MODEL_OPTIONS)
  const [notice, setNotice] = useState(null)
  const [resetSecretResult, setResetSecretResult] = useState(null)
  const noticeTimerRef = useRef(null)
  const alarmRulesRequestRef = useRef(0)

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

  function showNotice(type, message) {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current)
    }

    setNotice({
      type,
      message,
    })

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimerRef.current = null
    }, 4200)
  }

  async function loadDeviceModels() {
    try {
      const data = await getDeviceModels()
      const nextModels = Array.isArray(data)
        ? data.map(normalizeDeviceModel).filter((model) => model.id)
        : []

      if (nextModels.length) {
        setDeviceModelOptions(nextModels)
        setCreateForm((current) => {
          const stillExists = nextModels.some(
            (model) => Number(model.id) === Number(current.modelId)
          )

          return stillExists
            ? current
            : {
                ...current,
                modelId: Number(nextModels[0].id),
              }
        })
      }
    } catch (error) {
      console.error('Load device models error:', error)
      showNotice(
        'warning',
        'โหลด Device Model จาก Backend ไม่สำเร็จ ใช้รายการสำรองชั่วคราว'
      )
    }
  }

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
      setDeviceError('')
    } catch (error) {
      console.error('Load devices error:', error)
      const message = error.message || 'โหลดข้อมูล Device ไม่สำเร็จ'
      setDeviceError(message)
      showNotice('error', message)
    } finally {
      setLoading(false)
    }
  }

  async function loadAlarmRules(deviceId = selectedDeviceId) {
    const requestId = alarmRulesRequestRef.current + 1
    alarmRulesRequestRef.current = requestId

    if (!deviceId) {
      setAlarmRules([])
      return
    }

    try {
      const data = await getAlarmRules(deviceId)

      if (requestId !== alarmRulesRequestRef.current) return

      const scopedRules = (Array.isArray(data) ? data : []).filter(
        (rule) => Number(rule.device_id) === Number(deviceId)
      )

      setAlarmRules(scopedRules)
    } catch (error) {
      if (requestId !== alarmRulesRequestRef.current) return

      setAlarmRules([])
      console.error('Load alarm rules error:', error)
    }
  }

  async function reloadAll() {
    await Promise.all([loadDeviceModels(), loadDevices()])
  }

  useEffect(() => {
    reloadAll()

    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setAlarmRules([])
    loadAlarmRules(selectedDeviceId)
  }, [selectedDeviceId])

  function openCreateWizard() {
    setCreateForm({
      name: '',
      modelId: Number(deviceModelOptions[0]?.id || 1),
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
      showNotice('success', 'Copy เรียบร้อย')
    } catch (error) {
      console.error('Copy error:', error)
      showNotice('error', 'ไม่สามารถ Copy ได้')
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
      showNotice('error', error.message || 'เพิ่ม Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDeviceName(deviceId) {
    if (!editingName.trim()) {
      showNotice('warning', 'กรุณากรอกชื่อ Device')
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
      showNotice('error', error.message || 'แก้ไขชื่อ Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDevice(deviceId) {
    const device = devices.find((item) => String(item.id) === String(deviceId))
    const ok = confirmDeleteAction({
      title: 'Confirm Delete Device',
      targetName: device?.name || device?.device_code || `Device ID ${deviceId}`,
      description:
        'Device นี้จะถูกลบออกจากระบบ กรุณาพิมพ์ delete เพื่อยืนยัน',
    })

    if (!ok) return

    try {
      setSaving(true)
      await deleteDevice(deviceId)
      await reloadAll()
    } catch (error) {
      console.error('Delete device error:', error)
      showNotice('error', error.message || 'ลบ Device ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetSecret(device) {
    const ok = confirmResetSecretAction({
      title: 'Confirm Reset Device Secret',
      targetName: device?.name || device?.device_code || `Device ID ${device?.id}`,
      description:
        'Secret เดิมจะใช้งานไม่ได้ทันที และ Firmware / Gateway ต้องใช้ Secret ใหม่ กรุณาพิมพ์ reset secret เพื่อยืนยัน',
    })

    if (!ok) return

    try {
      setSaving(true)
      const result = await resetDeviceSecret(device.id)
      await loadDevices()

      setResetSecretResult({
        deviceCode: result.device_code || device.device_code,
        deviceSecret: result.deviceSecret,
      })
      showNotice('success', 'Reset Secret สำเร็จ กรุณา Copy Secret ใหม่เก็บไว้ทันที')
    } catch (error) {
      console.error('Reset secret error:', error)
      showNotice('error', error.message || 'Reset Secret ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePickedLocation(device) {
    const location = locations[device.id]

    if (!location) {
      showNotice('warning', 'กรุณาคลิกเลือกตำแหน่งบนแผนที่ก่อน')
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
      showNotice('success', 'บันทึกตำแหน่ง Device สำเร็จ')
    } catch (error) {
      console.error('Save picked location error:', error)
      showNotice('error', error.message || 'บันทึกตำแหน่งไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveMetricAlarms(deviceId, rules = []) {
    if (!deviceId) {
      return {
        success: false,
        error: 'ไม่พบ Device สำหรับบันทึก Alarm Rules',
      }
    }

    try {
      setSaving(true)

      const result = await saveAlarmRulesForDevice(deviceId, rules)
      const canonicalRules = Array.isArray(result?.rules) ? result.rules : []

      setAlarmRules((currentRules) => [
        ...currentRules.filter(
          (rule) => Number(rule.device_id) !== Number(deviceId)
        ),
        ...canonicalRules,
      ])

      showNotice(
        'success',
        `บันทึก Alarm Rules สำเร็จ ${Number(result?.saved_count || 0)} รายการ`
      )

      return {
        success: true,
        rules: canonicalRules,
        savedCount: Number(result?.saved_count || 0),
        deletedCount: Number(result?.deleted_count || 0),
      }
    } catch (error) {
      console.error('Save all metric alarm rules error:', error)
      const message = error.message || 'บันทึก Alarm Rules ไม่สำเร็จ'
      showNotice('error', message)

      return {
        success: false,
        error: message,
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateMetricAlarm(deviceId, metricKey, draft) {
    if (!metricKey) {
      showNotice('warning', 'ไม่พบ Metric Key')
      return false
    }

    if (draft.threshold === '' || Number.isNaN(Number(draft.threshold))) {
      showNotice('warning', 'กรุณากรอก Threshold ให้ถูกต้อง')
      return false
    }

    const severity = String(draft.severity || 'warning').toLowerCase()
    const existingRules = alarmRules.filter(
      (rule) =>
        Number(rule.device_id) === Number(deviceId) &&
        String(rule.metric) === String(metricKey)
    )
    const existingRule = existingRules.find(
      (rule) => String(rule.severity || 'warning').toLowerCase() === severity
    )

    if (!existingRule && existingRules.length >= 2) {
      showNotice('warning', 'แต่ละ Metric ตั้ง Alarm Rule ได้สูงสุด 2 รายการ')
      return false
    }

    try {
      setSaving(true)

      const payload = {
        device_id: deviceId,
        metric: metricKey,
        operator: draft.operator || '>',
        threshold: Number(draft.threshold),
        severity,
        is_active: draft.is_active !== false,
        notification_message: String(draft.notification_message || '').trim(),
      }

      if (existingRule?.id) {
        await updateAlarmRule(existingRule.id, payload)
      } else {
        await createAlarmRule(payload)
      }

      await loadAlarmRules(deviceId)
      return true
    } catch (error) {
      console.error('Create metric alarm rule error:', error)
      showNotice('error', error.message || 'เพิ่ม Alarm Rule ไม่สำเร็จ')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateMetricAlarm(ruleId, nextRule) {
    const currentRule = alarmRules.find(
      (rule) => String(rule.id) === String(ruleId)
    )
    const deviceId = nextRule.device_id || currentRule?.device_id || selectedDeviceId

    if (nextRule.threshold === '' || Number.isNaN(Number(nextRule.threshold))) {
      showNotice('warning', 'กรุณากรอก Threshold ให้ถูกต้อง')
      return false
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
        notification_message: String(
          nextRule.notification_message || ''
        ).trim(),
      })

      await loadAlarmRules(deviceId)
      return true
    } catch (error) {
      console.error('Update metric alarm rule error:', error)
      showNotice('error', error.message || 'แก้ไข Alarm Rule ไม่สำเร็จ')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAlarmRule(ruleId) {
    const rule = alarmRules.find((item) => String(item.id) === String(ruleId))
    const ok = confirmDeleteAction({
      title: 'Confirm Delete Alarm Rule',
      targetName:
        rule?.metric || rule?.metric_key
          ? `${rule.metric || rule.metric_key} / ${rule.severity || 'rule'}`
          : `Rule ID ${ruleId}`,
      description:
        'Alarm Rule นี้จะถูกลบออกจาก Device กรุณาพิมพ์ delete เพื่อยืนยัน',
    })

    if (!ok) return

    try {
      setSaving(true)
      await deleteAlarmRule(ruleId)
      await loadAlarmRules(rule?.device_id || selectedDeviceId)
    } catch (error) {
      console.error('Delete alarm rule error:', error)
      showNotice('error', error.message || 'ลบ Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page app-page device-page device-v2-page">
      <PageHeader
        eyebrow="Devices"
        title="Device Center"
        description="ดูสถานะอุปกรณ์จริงแบบเข้าใจง่าย จัดการ ESP32 / Gateway, Metric, Location, Secret และ Alarm Rules ในที่เดียว"
      />

      {notice && (
        <div className={`devices-v3-notice ${notice.type}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {resetSecretResult && (
        <section className="devices-v3-reset-secret-result app-card">
          <div>
            <span className="page-eyebrow">New Device Secret</span>
            <h3>Copy Secret ใหม่เก็บไว้ทันที</h3>
            <p>Secret เดิมจะใช้งานไม่ได้แล้ว และ Secret ใหม่นี้จะแสดงเฉพาะตอนนี้เท่านั้น</p>
          </div>

          <div className="devices-v3-reset-secret-grid">
            <label>
              Device Code
              <input value={resetSecretResult.deviceCode || ''} disabled />
            </label>
            <label>
              Device Secret
              <input value={resetSecretResult.deviceSecret || ''} disabled />
            </label>
          </div>

          <div className="devices-v3-reset-secret-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                copyText(
                  `DEVICE_CODE=${resetSecretResult.deviceCode}\nDEVICE_SECRET=${resetSecretResult.deviceSecret}`
                )
              }
            >
              Copy Code + Secret
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setResetSecretResult(null)}
            >
              Hide
            </button>
          </div>
        </section>
      )}

      <section className="dw-page-stat-grid devices-ops-stat-grid">
        <StatCard
          label="Total Devices"
          value={devices.length}
          hint="All devices"
        />
        <StatCard
          label="Online"
          value={onlineCount}
          hint="Sending data"
          tone="success"
        />
        <StatCard
          label="Warning"
          value={warningCount}
          hint="Review alarms"
          tone="warning"
        />
        <StatCard
          label="Offline"
          value={offlineCount}
          hint="Check connection"
          tone="danger"
        />
      </section>

      <section className="devices-v2-shell">
        <DeviceList
          devices={devices}
          loading={loading}
          selectedDevice={selectedDevice}
          saving={saving}
          errorMessage={deviceError}
          onCreate={openCreateWizard}
          onSelect={setSelectedDeviceId}
          onRetry={reloadAll}
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
            onSaveMetricAlarms={handleSaveMetricAlarms}
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
        deviceModelOptions={deviceModelOptions}
        onClose={closeCreateWizard}
        onCopy={copyText}
        onConfirmCreate={handleConfirmCreateDevice}
      />
    </div>
  )
}

export default Devices
