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
} from 'lucide-react'

import LocationPicker from '../components/LocationPicker.jsx'
import {
  getDevices,
  addDevice,
  deleteDevice,
  updateDeviceName,
  resetDeviceSecret,
  updateDeviceLocation,
  getAlarmRules,
  createAlarmRule,
  updateAlarmRule,
  deleteAlarmRule,
  getDeviceMetrics,
  saveDeviceMetrics as saveDeviceMetricsApi,
  resetDeviceMetrics as resetDeviceMetricsApi,
} from '../services/api'
import MetricConfigPanel from '../components/MetricConfigPanel.jsx'

const DEVICE_MODEL_OPTIONS = [
  {
    id: 1,
    modelKey: 'dw_2ch',
    name: 'DW2CH',
    description: 'ESP32 / 2 Channels',
  },
  {
    id: 2,
    modelKey: 'dw_10ch',
    name: 'DW10CH',
    description: 'ESP32 / 10 Channels',
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
  return device.status || 'offline'
}

function getStatusLabel(status) {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  return 'Offline'
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

const defaultRuleForm = {
  metric: 'metric_1',
  operator: '>',
  threshold: 35,
  severity: 'critical',
}

const METRIC_ICON_OPTIONS = [
  '📊',
  '🌡️',
  '💧',
  '📶',
  '⚡',
  '🔌',
  '🔋',
  '⚙️',
  '🧭',
  '🌬️',
  '↩️',
  '🔥',
  '❄️',
  '💨',
  '💡',
  '🚰',
  '📈',
  '📉',
  '🚨',
  '✅',
]

const DEFAULT_METRIC_CONFIG = [
  {
    id: 'metric_1',
    sourceKey: 'metric_1',
    displayName: 'Name-01',
    unit: '',
    icon: '📊',
    enabled: true,
  },
  {
    id: 'metric_2',
    sourceKey: 'metric_2',
    displayName: 'Name-02',
    unit: '',
    icon: '📊',
    enabled: true,
  },
]

const DEVICE_METRIC_STORAGE_KEY = 'dotwatch_device_metric_config_v1'

function readMetricConfigs() {
  try {
    const raw = localStorage.getItem(DEVICE_METRIC_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeMetricConfigs(configs) {
  localStorage.setItem(DEVICE_METRIC_STORAGE_KEY, JSON.stringify(configs))
}

function createMetricKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeMetricConfig(config) {
  if (!Array.isArray(config) || config.length === 0) {
    return DEFAULT_METRIC_CONFIG
  }

  return config.map((metric, index) => {
    const sourceKey =
      metric.sourceKey ||
      metric.source_key ||
      metric.metric_key ||
      `metric_${index + 1}`

    return {
      id: metric.id || sourceKey,
      sourceKey,
      displayName:
        metric.displayName ||
        metric.metric_name ||
        metric.default_name ||
        metric.label ||
        sourceKey,
      unit: metric.unit ?? metric.default_unit ?? '',
      icon: metric.icon || metric.default_icon || '📊',
      enabled: metric.enabled ?? metric.visible ?? true,
      sortOrder: metric.sort_order ?? index + 1,
    }
  })
}

function getMetricInputValue(metric) {
  return metric.displayName ?? ''
}

function getDeviceMetricValue(device, metric) {
  const sourceKey = metric.sourceKey || metric.metric_key
  const latestMetrics = device.latest_metrics || {}

  let value = latestMetrics[sourceKey]

  if (value == null) value = device?.[sourceKey]
  if (value == null && sourceKey === 'metric_1') value = device.temperature
  if (value == null && sourceKey === 'metric_2') value = device.humidity
  if (value == null && sourceKey === 'rssi') value = device.rssi

  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return `--${metric.unit || ''}`
  }

  const numberValue = Number(value)
  const fixedValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1)

  return `${fixedValue}${metric.unit || ''}`
}

function Devices() {
  const [devices, setDevices] = useState([])
  const [metricConfigs, setMetricConfigs] = useState(() => readMetricConfigs())
  const [metricDrafts, setMetricDrafts] = useState(() => readMetricConfigs())
  const [dirtyMetricDevices, setDirtyMetricDevices] = useState({})
  const [metricMessages, setMetricMessages] = useState({})
  const [expandedDeviceId, setExpandedDeviceId] = useState(null)
  const [editingDeviceId, setEditingDeviceId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [locations, setLocations] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [alarmRules, setAlarmRules] = useState([])
  const [ruleDrafts, setRuleDrafts] = useState({})
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [editingRuleDraft, setEditingRuleDraft] = useState(defaultRuleForm)

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

  async function loadDeviceMetricConfigs(devicesList = []) {
    const entries = await Promise.all(
      devicesList.map(async (device) => {
        try {
          const data = await getDeviceMetrics(device.id)
          return [device.id, normalizeMetricConfig(data)]
        } catch (error) {
          console.error(`Load metrics error for device ${device.id}:`, error)
          return [device.id, normalizeMetricConfig(metricConfigs[device.id])]
        }
      })
    )

    const nextConfigs = Object.fromEntries(entries)

    setMetricConfigs(nextConfigs)
    setMetricDrafts(nextConfigs)
    writeMetricConfigs(nextConfigs)
  }

  async function loadDevices() {
    try {
      setLoading(true)
      const data = await getDevices()
      const nextDevices = Array.isArray(data) ? data : []

      setDevices(nextDevices)
      await loadDeviceMetricConfigs(nextDevices)
    } catch (error) {
      console.error('Load devices error:', error)
      alert('โหลดข้อมูล Device ไม่สำเร็จ')
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

  useEffect(() => {
    loadDevices()
    loadAlarmRules()
  }, [])

  const filteredDevices = devices
  const onlineCount = devices.filter((d) => getStatus(d) === 'online').length
  const warningCount = devices.filter((d) => getStatus(d) === 'warning').length
  const offlineCount = devices.length - onlineCount - warningCount

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

  function getSelectedCreateModel() {
    return (
      DEVICE_MODEL_OPTIONS.find(
        (model) => Number(model.id) === Number(createForm.modelId)
      ) || DEVICE_MODEL_OPTIONS[0]
    )
  }

  async function handleConfirmCreateDevice() {
    try {
      setSaving(true)

      const name = createForm.name.trim() || `dotWatch ${devices.length + 1}`
      const selectedModel = getSelectedCreateModel()

      const created = await addDevice({
        deviceCode: createForm.deviceCode,
        name,
        deviceSecret: createForm.deviceSecret,
        modelId: Number(createForm.modelId),
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
        modelId: Number(createForm.modelId),
        modelName: selectedModel.name,
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
      await loadAlarmRules()
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

  function getDeviceAlarmRules(deviceId) {
    return alarmRules.filter(
      (rule) => Number(rule.device_id) === Number(deviceId)
    )
  }

  function getRuleDraft(deviceId) {
    return ruleDrafts[deviceId] || defaultRuleForm
  }

  function getDeviceMetricConfig(deviceId) {
    return normalizeMetricConfig(metricConfigs[deviceId])
  }

  function getDeviceMetricDraftConfig(deviceId) {
    return normalizeMetricConfig(
      metricDrafts[deviceId] || metricConfigs[deviceId]
    )
  }

  function getAlarmMetricOptions(deviceId) {
    return getDeviceMetricConfig(deviceId)
      .filter((metric) => metric.enabled && metric.sourceKey)
      .map((metric) => ({
        value: metric.sourceKey,
        label: metric.displayName,
        unit: metric.unit,
      }))
  }

  function getMetricDisplayName(deviceId, metricKey) {
    const metric = getAlarmMetricOptions(deviceId).find(
      (item) => item.value === metricKey
    )

    return metric?.label || metricKey || '--'
  }

  function updateRuleDraft(deviceId, key, value) {
    setRuleDrafts((prev) => ({
      ...prev,
      [deviceId]: {
        ...(prev[deviceId] || defaultRuleForm),
        [key]: value,
      },
    }))
  }

  async function handleCreateAlarmRule(deviceId) {
    const draft = getRuleDraft(deviceId)

    if (draft.threshold === '' || Number.isNaN(Number(draft.threshold))) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setSaving(true)

      await createAlarmRule({
        device_id: deviceId,
        metric: draft.metric,
        operator: draft.operator,
        threshold: Number(draft.threshold),
        severity: draft.severity,
      })

      setRuleDrafts((prev) => ({
        ...prev,
        [deviceId]: defaultRuleForm,
      }))

      await loadAlarmRules()
    } catch (error) {
      console.error('Create alarm rule error:', error)
      alert(error.message || 'เพิ่ม Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function startEditAlarmRule(rule) {
    setEditingRuleId(rule.id)
    setEditingRuleDraft({
      metric: rule.metric || 'metric_1',
      operator: rule.operator || '>',
      threshold: rule.threshold ?? 35,
      severity: rule.severity || 'critical',
    })
  }

  function cancelEditAlarmRule() {
    setEditingRuleId(null)
    setEditingRuleDraft(defaultRuleForm)
  }

  async function handleUpdateAlarmRule(ruleId) {
    if (
      editingRuleDraft.threshold === '' ||
      Number.isNaN(Number(editingRuleDraft.threshold))
    ) {
      alert('กรุณากรอก Threshold ให้ถูกต้อง')
      return
    }

    try {
      setSaving(true)

      await updateAlarmRule(ruleId, {
        metric: editingRuleDraft.metric,
        operator: editingRuleDraft.operator,
        threshold: Number(editingRuleDraft.threshold),
        severity: editingRuleDraft.severity,
      })

      cancelEditAlarmRule()
      await loadAlarmRules()
    } catch (error) {
      console.error('Update alarm rule error:', error)
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

  function markMetricDirty(deviceId, message = '') {
    setDirtyMetricDevices((prev) => ({
      ...prev,
      [deviceId]: true,
    }))

    setMetricMessages((prev) => ({
      ...prev,
      [deviceId]: message,
    }))
  }

  function updateDeviceMetricDraft(deviceId, nextConfig, message = '') {
    const normalized = normalizeMetricConfig(nextConfig)

    setMetricDrafts((prev) => ({
      ...prev,
      [deviceId]: normalized,
    }))

    markMetricDirty(deviceId, message)
  }

  function updateDeviceMetric(deviceId, metricId, key, value) {
    const currentConfig = getDeviceMetricDraftConfig(deviceId)
    const nextConfig = currentConfig.map((metric) => {
      if (metric.id !== metricId) return metric

      if (key === 'metricName') {
        return {
          ...metric,
          displayName: value,
        }
      }

      return {
        ...metric,
        [key]: value,
      }
    })

    updateDeviceMetricDraft(
      deviceId,
      nextConfig,
      'มีการแก้ไข Metric Display แล้ว กรุณากด Save Display'
    )
  }

  async function handleSaveDeviceMetrics(deviceId) {
    const draftConfig = getDeviceMetricDraftConfig(deviceId)
    const enabledWithoutName = draftConfig.some(
      (metric) => metric.enabled && !String(metric.displayName || '').trim()
    )

    if (enabledWithoutName) {
      alert('กรุณากรอก Metric Name ของรายการที่เปิด Show ก่อนบันทึก')
      return
    }

    const normalized = draftConfig.map((metric, index) => ({
      ...metric,
      displayName: String(metric.displayName || '').trim(),
      unit: String(metric.unit || '').trim(),
      sourceKey: metric.sourceKey || `metric_${index + 1}`,
    }))

    const payload = normalized.map((metric, index) => ({
      metric_key: metric.sourceKey,
      metric_name: metric.displayName,
      metric_type: 'custom',
      unit: metric.unit,
      icon: metric.icon,
      visible: metric.enabled,
      sort_order: index + 1,
    }))

    try {
      setSaving(true)
      await saveDeviceMetricsApi(deviceId, payload)

      setMetricConfigs((prev) => {
        const next = {
          ...prev,
          [deviceId]: normalized,
        }

        writeMetricConfigs(next)
        window.dispatchEvent(new Event('dotwatchMetricConfigChanged'))
        return next
      })

      setMetricDrafts((prev) => ({
        ...prev,
        [deviceId]: normalized,
      }))

      setDirtyMetricDevices((prev) => ({
        ...prev,
        [deviceId]: false,
      }))

      setMetricMessages((prev) => ({
        ...prev,
        [deviceId]: 'บันทึกแล้ว และหน้าอื่นจะใช้ชื่อ/หน่วยนี้ทันที',
      }))
    } catch (error) {
      console.error('Save metrics error:', error)
      alert(error.message || 'บันทึก Metric ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function resetDeviceMetrics(deviceId) {
    const ok = confirm('ต้องการ Reset การแสดงผล Metric กลับค่าเริ่มต้นใช่ไหม?')
    if (!ok) return

    try {
      setSaving(true)
      const data = await resetDeviceMetricsApi(deviceId)
      const normalized = normalizeMetricConfig(data)

      setMetricConfigs((prev) => ({
        ...prev,
        [deviceId]: normalized,
      }))

      setMetricDrafts((prev) => ({
        ...prev,
        [deviceId]: normalized,
      }))

      setDirtyMetricDevices((prev) => ({
        ...prev,
        [deviceId]: false,
      }))

      setMetricMessages((prev) => ({
        ...prev,
        [deviceId]: 'Reset ค่าเริ่มต้นสำเร็จ',
      }))
    } catch (error) {
      console.error('Reset metrics error:', error)
      alert(error.message || 'Reset Metric ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function addDeviceMetric(deviceId) {
    const nextIndex = getDeviceMetricDraftConfig(deviceId).length + 1
    const nextConfig = [
      ...getDeviceMetricDraftConfig(deviceId),
      {
        id: `metric_${nextIndex}`,
        sourceKey: `metric_${nextIndex}`,
        displayName: `Name-${String(nextIndex).padStart(2, '0')}`,
        unit: '',
        icon: '📊',
        enabled: true,
      },
    ]

    updateDeviceMetricDraft(
      deviceId,
      nextConfig,
      'เพิ่ม Metric ใหม่แล้ว กรุณากด Save Display'
    )
  }

  function removeDeviceMetric(deviceId, metricId) {
    const currentConfig = getDeviceMetricDraftConfig(deviceId)

    if (currentConfig.length <= 1) {
      alert('ต้องมี Metric อย่างน้อย 1 รายการ')
      return
    }

    updateDeviceMetricDraft(
      deviceId,
      currentConfig.filter((metric) => metric.id !== metricId),
      'ลบ Metric แล้ว กรุณากด Save Display'
    )
  }

  function cancelDeviceMetricChanges(deviceId) {
    setMetricDrafts((prev) => ({
      ...prev,
      [deviceId]: getDeviceMetricConfig(deviceId),
    }))

    setDirtyMetricDevices((prev) => ({
      ...prev,
      [deviceId]: false,
    }))

    setMetricMessages((prev) => ({
      ...prev,
      [deviceId]: '',
    }))
  }

  function renderMetricDisplayConfig(device) {
    const config = getDeviceMetricDraftConfig(device.id)
    const hasUnsavedChanges = Boolean(dirtyMetricDevices[device.id])
    const metricMessage = metricMessages[device.id]

    return (
      <div className="device-metric-config-section">
        <div className="device-location-header">
          <strong>
            <Cpu size={16} />
            Metric Display Config
          </strong>
          <span>ตั้งชื่อและหน่วยที่ต้องการให้ Device นี้แสดงผลในทุกหน้า</span>
        </div>

        {metricMessage && (
          <div
            className={
              hasUnsavedChanges
                ? 'metric-config-note warning'
                : 'metric-config-note success'
            }
          >
            {metricMessage}
          </div>
        )}

        <div className="metric-config-list">
          {config.map((metric) => (
            <div key={metric.id} className="metric-config-row">
              <label>
                Metric Name
                <input
                  value={getMetricInputValue(metric)}
                  disabled={saving}
                  placeholder="เช่น Temperature, Supply Air, Energy"
                  onChange={(e) =>
                    updateDeviceMetric(
                      device.id,
                      metric.id,
                      'metricName',
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Unit
                <input
                  value={metric.unit}
                  disabled={saving}
                  placeholder="เช่น °C, %, kWh, V, A"
                  onChange={(e) =>
                    updateDeviceMetric(
                      device.id,
                      metric.id,
                      'unit',
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Icon
                <select
                  value={metric.icon}
                  disabled={saving}
                  onChange={(e) =>
                    updateDeviceMetric(
                      device.id,
                      metric.id,
                      'icon',
                      e.target.value
                    )
                  }
                >
                  {METRIC_ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
              </label>

              <label className="metric-config-toggle">
                Show
                <input
                  type="checkbox"
                  checked={metric.enabled}
                  disabled={saving}
                  onChange={(e) =>
                    updateDeviceMetric(
                      device.id,
                      metric.id,
                      'enabled',
                      e.target.checked
                    )
                  }
                />
              </label>

              <button
                type="button"
                className="delete-btn square"
                disabled={saving}
                onClick={() => removeDeviceMetric(device.id, metric.id)}
                title="Remove Metric"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="metric-config-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={saving}
            onClick={() => addDeviceMetric(device.id)}
          >
            <Plus size={15} />
            Add Metric
          </button>

          <button
            type="button"
            className="ghost-button"
            disabled={saving}
            onClick={() => resetDeviceMetrics(device.id)}
          >
            Reset Default
          </button>

          {hasUnsavedChanges && (
            <button
              type="button"
              className="ghost-button"
              disabled={saving}
              onClick={() => cancelDeviceMetricChanges(device.id)}
            >
              Cancel Changes
            </button>
          )}

          <button
            type="button"
            className="save-btn metric-save-btn"
            disabled={saving || !hasUnsavedChanges}
            onClick={() => handleSaveDeviceMetrics(device.id)}
          >
            <Save size={15} />
            Save Display
          </button>
        </div>
      </div>
    )
  }

  function renderAlarmRules(device) {
    const rules = getDeviceAlarmRules(device.id)
    const draft = getRuleDraft(device.id)

    return (
      <div className="device-alarm-rule-section">
        <div className="device-location-header">
          <strong>
            <AlertTriangle size={16} />
            Alarm Rules
          </strong>
          <span>ตั้งค่าเงื่อนไขแจ้งเตือนเฉพาะ Device นี้</span>
        </div>

        <div className="alarm-rule-create-row">
          <select
            value={draft.metric}
            disabled={saving}
            onChange={(e) =>
              updateRuleDraft(device.id, 'metric', e.target.value)
            }
          >
            {getAlarmMetricOptions(device.id).map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </select>

          <select
            value={draft.operator}
            disabled={saving}
            onChange={(e) =>
              updateRuleDraft(device.id, 'operator', e.target.value)
            }
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
          </select>

          <input
            type="number"
            value={draft.threshold}
            disabled={saving}
            onChange={(e) =>
              updateRuleDraft(device.id, 'threshold', e.target.value)
            }
          />

          <select
            value={draft.severity}
            disabled={saving}
            onChange={(e) =>
              updateRuleDraft(device.id, 'severity', e.target.value)
            }
          >
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          <button
            type="button"
            className="save-btn"
            disabled={saving}
            onClick={() => handleCreateAlarmRule(device.id)}
          >
            Add Rule
          </button>
        </div>

        <div className="device-alarm-rule-list">
          {rules.length === 0 ? (
            <p className="alarm-rule-empty">ยังไม่มี Alarm Rule</p>
          ) : (
            rules.map((rule) => {
              const isEditing = editingRuleId === rule.id

              return (
                <div key={rule.id} className="device-alarm-rule-item">
                  {isEditing ? (
                    <>
                      <select
                        value={editingRuleDraft.metric}
                        disabled={saving}
                        onChange={(e) =>
                          setEditingRuleDraft((prev) => ({
                            ...prev,
                            metric: e.target.value,
                          }))
                        }
                      >
                        {getAlarmMetricOptions(device.id).map((metric) => (
                          <option key={metric.value} value={metric.value}>
                            {metric.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={editingRuleDraft.operator}
                        disabled={saving}
                        onChange={(e) =>
                          setEditingRuleDraft((prev) => ({
                            ...prev,
                            operator: e.target.value,
                          }))
                        }
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                      </select>

                      <input
                        type="number"
                        value={editingRuleDraft.threshold}
                        disabled={saving}
                        onChange={(e) =>
                          setEditingRuleDraft((prev) => ({
                            ...prev,
                            threshold: e.target.value,
                          }))
                        }
                      />

                      <select
                        value={editingRuleDraft.severity}
                        disabled={saving}
                        onChange={(e) =>
                          setEditingRuleDraft((prev) => ({
                            ...prev,
                            severity: e.target.value,
                          }))
                        }
                      >
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>

                      <button
                        type="button"
                        className="save-btn square"
                        disabled={saving}
                        onClick={() => handleUpdateAlarmRule(rule.id)}
                      >
                        <Save size={16} />
                      </button>

                      <button
                        type="button"
                        className="cancel-btn square"
                        disabled={saving}
                        onClick={cancelEditAlarmRule}
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>
                        {getMetricDisplayName(device.id, rule.metric)}{' '}
                        {rule.operator} {rule.threshold}
                      </strong>

                      <span className={`status ${rule.severity}`}>
                        {rule.severity}
                      </span>

                      <div className="alarm-rule-actions">
                        <button
                          type="button"
                          className="rename-btn"
                          disabled={saving}
                          onClick={() => startEditAlarmRule(rule)}
                        >
                          <Edit3 size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="delete-btn"
                          disabled={saving}
                          onClick={() => handleDeleteAlarmRule(rule.id)}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
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

        <MetricConfigPanel
          deviceId={device.id}
          alarmRules={getDeviceAlarmRules(device.id)}
          onCreateAlarm={(metricKey, draft) =>
            handleCreateMetricAlarm(device.id, metricKey, draft)
          }
          onUpdateAlarm={handleUpdateMetricAlarm}
          onDeleteAlarm={handleDeleteAlarmRule}
        />

        {renderMetricDisplayConfig(device)}

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

  function renderTableView() {
    return (
      <div className="device-v2-table-wrap">
        <table className="device-v2-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Model</th>
              <th>Status</th>
              <th>Metrics</th>
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
                      <span className="device-model-badge">
                        {device.model_name || 'DW2CH'}
                      </span>
                    </td>

                    <td>
                      <span className={`status ${status}`}>
                        {getStatusLabel(status)}
                      </span>
                    </td>

                    <td>
                      <div className="table-metric-stack">
                        {getDeviceMetricConfig(device.id)
                          .filter((metric) => metric.enabled)
                          .slice(0, 3)
                          .map((metric) => (
                            <span key={metric.id}>
                              <b>{metric.displayName}</b>{' '}
                              {getDeviceMetricValue(device, metric)}
                            </span>
                          ))}
                      </div>
                    </td>

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
    <div className="page app-page device-page">
      <section className="device-management-page clean-device-page device-v2-page app-page-stack">
        <div className="device-management-header clean-device-header device-v2-header app-page-header">
          <div>
            <span className="page-eyebrow">Devices</span>
            <h2>Device Management</h2>
            <p>
              จัดการอุปกรณ์, Metric Display, Secret, Location และ Alarm Rules
              ของ dotWatch
            </p>
          </div>

          <div className="device-v2-header-actions">
            <button
              type="button"
              className="ghost-button clean-refresh-btn"
              onClick={() => {
                loadDevices()
                loadAlarmRules()
              }}
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

        <div className="device-header-stats clean-device-stats app-summary-grid">
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

        {loading ? (
          <div className="empty-device clean-empty-state app-empty-state">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Device จาก Backend</p>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="empty-device clean-empty-state app-empty-state">
            <h3>ยังไม่มี Device</h3>
            <p>เพิ่มอุปกรณ์ใหม่เพื่อเริ่มใช้งาน dotWatch</p>
          </div>
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
                      Device Model
                      <select
                        value={createForm.modelId}
                        disabled={saving}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            modelId: Number(e.target.value),
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
                      <span>Model</span>
                      <strong>{getSelectedCreateModel().name}</strong>
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
                      Device Name
                      <input value={createdDevice.name} disabled />
                    </label>

                    <label>
                      Device Model
                      <input value={createdDevice.modelName} disabled />
                    </label>

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
