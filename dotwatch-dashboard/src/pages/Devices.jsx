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
} from '../services/api'
import { getDeviceMetrics } from '../services/metricDisplayApi'

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

function getDeviceModelLabel(device) {
  return device.model_name || device.modelName || 'dotWatch 2CH'
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

const defaultRuleForm = {
  metric: 'temperature',
  operator: '>',
  threshold: 35,
  severity: 'critical',
}

const METRIC_PRESETS = [
  {
    key: 'temperature',
    label: 'Temperature',
    displayName: 'Temperature',
    unit: '°C',
    icon: '🌡️',
  },
  {
    key: 'humidity',
    label: 'Humidity',
    displayName: 'Humidity',
    unit: '%',
    icon: '💧',
  },
  {
    key: 'rssi',
    label: 'WiFi Signal',
    displayName: 'Signal',
    unit: 'dBm',
    icon: '📶',
  },
  {
    key: 'voltage',
    label: 'Voltage',
    displayName: 'Voltage',
    unit: 'V',
    icon: '⚡',
  },
  {
    key: 'current',
    label: 'Current',
    displayName: 'Current',
    unit: 'A',
    icon: '🔌',
  },
  {
    key: 'power',
    label: 'Power',
    displayName: 'Power',
    unit: 'W',
    icon: '⚙️',
  },
  {
    key: 'energy',
    label: 'Energy',
    displayName: 'Energy',
    unit: 'kWh',
    icon: '🔋',
  },
  {
    key: 'pressure',
    label: 'Pressure',
    displayName: 'Pressure',
    unit: 'bar',
    icon: '🧭',
  },
  {
    key: 'supply_air',
    label: 'Supply Air',
    displayName: 'Supply Air',
    unit: '°C',
    icon: '🌬️',
  },
  {
    key: 'return_air',
    label: 'Return Air',
    displayName: 'Return Air',
    unit: '°C',
    icon: '↩️',
  },
]

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
    id: 'temperature',
    sourceKey: 'temperature',
    displayName: 'Temperature',
    unit: '°C',
    icon: '🌡️',
    enabled: true,
  },
  {
    id: 'humidity',
    sourceKey: 'humidity',
    displayName: 'Humidity',
    unit: '%',
    icon: '💧',
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

function normalizeMetricConfig(config) {
  if (!Array.isArray(config) || config.length === 0) {
    return DEFAULT_METRIC_CONFIG
  }

  return config.map((metric, index) => {
    const displayName =
      metric.displayName ??
      metric.metricName ??
      metric.name ??
      metric.label ??
      ''

    return {
      id:
        metric.id ||
        `${metric.sourceKey || createMetricKey(displayName) || 'metric'}-${index}`,
      sourceKey: metric.sourceKey || createMetricKey(displayName),
      displayName,
      unit: metric.unit ?? '',
      icon: metric.icon || '📊',
      enabled: metric.enabled !== false,
    }
  })
}

function getPresetByKey(key) {
  return METRIC_PRESETS.find((preset) => preset.key === key)
}

function getPresetByLabel(label) {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()

  return METRIC_PRESETS.find(
    (preset) =>
      preset.label.toLowerCase() === normalized ||
      preset.displayName.toLowerCase() === normalized ||
      preset.key.toLowerCase() === normalized
  )
}

function createMetricKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getMetricInputValue(metric) {
  return metric.displayName ?? ''
}

function getDeviceMetricValue(device, metric) {
  const value = device?.[metric.sourceKey]

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
  const [metricsByDevice, setMetricsByDevice] = useState({})
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

  async function loadMetricsForDevices(nextDevices = []) {
    const entries = await Promise.all(
      nextDevices.map(async (device) => {
        try {
          const data = await getDeviceMetrics(device.id)
          const metrics = Array.isArray(data) ? data : data?.metrics || []

          return [device.id, metrics]
        } catch (error) {
          console.error(`Load metrics error for device ${device.id}:`, error)
          return [device.id, []]
        }
      })
    )

    setMetricsByDevice(Object.fromEntries(entries))
  }

  function getDeviceMetricRows(device) {
    const metrics = metricsByDevice[device.id] || []

    return metrics
      .filter((metric) => metric.visible !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  }

  function getDeviceMetricCount(device) {
    const metrics = getDeviceMetricRows(device)

    if (metrics.length > 0) return metrics.length
    if (device.metric_count != null) return Number(device.metric_count) || 0

    return 0
  }

  function getDeviceLocationText(device) {
    if (device.latitude == null || device.longitude == null) return '-'

    return `${Number(device.latitude).toFixed(5)}, ${Number(device.longitude).toFixed(5)}`
  }

  async function loadDevices() {
    try {
      setLoading(true)
      const data = await getDevices()
      const nextDevices = Array.isArray(data) ? data : []

      setDevices(nextDevices)
      await loadMetricsForDevices(nextDevices)
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
        modelId: Number(createForm.modelId) || 1,
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

  function getAlarmMetricOptions(deviceId) {
    const metrics = metricsByDevice[deviceId] || []

    if (metrics.length > 0) {
      return metrics
        .filter((metric) => metric.visible !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((metric) => ({
          value: metric.metric_key,
          label: metric.metric_name || metric.metric_key,
          unit: metric.unit || '',
        }))
    }

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
      metric: rule.metric || 'temperature',
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

  function getDeviceMetricConfig(deviceId) {
    return normalizeMetricConfig(metricConfigs[deviceId])
  }

  function getDeviceMetricDraftConfig(deviceId) {
    return normalizeMetricConfig(
      metricDrafts[deviceId] || metricConfigs[deviceId]
    )
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

  function addDeviceMetric(deviceId) {
    const nextId = `metric-${Date.now()}`
    const nextConfig = [
      ...getDeviceMetricDraftConfig(deviceId),
      {
        id: nextId,
        sourceKey: '',
        displayName: '',
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

  function resetMetricsByDevice(deviceId) {
    const ok = confirm('ต้องการ Reset การแสดงผล Metric กลับค่าเริ่มต้นใช่ไหม?')
    if (!ok) return

    updateDeviceMetricDraft(
      deviceId,
      DEFAULT_METRIC_CONFIG,
      'Reset ค่าเริ่มต้นแล้ว กรุณากด Save Display'
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

  function handleSaveDeviceMetrics(deviceId) {
    const draftConfig = getDeviceMetricDraftConfig(deviceId)
    const enabledWithoutName = draftConfig.some(
      (metric) => metric.enabled && !String(metric.displayName || '').trim()
    )

    if (enabledWithoutName) {
      alert('กรุณากรอก Metric Name ของรายการที่เปิด Show ก่อนบันทึก')
      return
    }

    const normalized = draftConfig.map((metric) => ({
      ...metric,
      displayName: String(metric.displayName || '').trim(),
      unit: String(metric.unit || '').trim(),
      sourceKey: createMetricKey(metric.displayName),
    }))

    setMetricConfigs((prev) => {
      const next = {
        ...prev,
        [deviceId]: normalized,
      }

      writeMetricConfigs(next)
      window.dispatchEvent(new Event('metricDisplayConfigChanged'))
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

        <div className="metric-config-help">
          พิมพ์ชื่อ Metric และ Unit ได้เอง เช่น Supply Air / °C, Energy / kWh
          แล้วเลือก Icon ที่ต้องการแสดงผล จากนั้นกด Save Display เพื่อให้
          Dashboard, Alarm Rules และ Alarm Center ใช้ค่าที่ตั้งไว้
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
            onClick={() => resetMetricsByDevice(device.id)}
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

        {renderMetricDisplayConfig(device)}

        {renderAlarmRules(device)}

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
      <div className="device-v2-table-wrap full-device-table-wrap">
        <table className="device-v2-table full-device-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Model</th>
              <th>Metric Count</th>
              <th>Metric Preview</th>
              <th>Status</th>
              <th>Last Seen</th>
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredDevices.map((device) => {
              const status = getStatus(device)
              const metrics = getDeviceMetricRows(device)
              const metricCount = getDeviceMetricCount(device)

              return (
                <React.Fragment key={device.id}>
                  <tr>
                    <td>
                      <div className="device-table-main-cell">
                        <strong>{device.name || device.device_code}</strong>
                        <small>{device.device_code}</small>
                      </div>
                    </td>

                    <td>
                      <div className="device-table-model-cell">
                        <strong>{getDeviceModelLabel(device)}</strong>
                        <small>
                          {device.model_key || device.modelKey || '-'}
                        </small>
                      </div>
                    </td>

                    <td>
                      <span className="metric-count-badge">
                        {metricCount} Metrics
                      </span>
                    </td>

                    <td>
                      <div className="table-metric-stack metric-preview-stack">
                        {metrics.length > 0 ? (
                          metrics.slice(0, 4).map((metric) => (
                            <span key={metric.id || metric.metric_key}>
                              <b>{metric.metric_name || metric.metric_key}</b>
                              {metric.unit ? ` (${metric.unit})` : ''}
                            </span>
                          ))
                        ) : (
                          <span className="muted-text">
                            No metrics configured
                          </span>
                        )}

                        {metrics.length > 4 && (
                          <span className="muted-text">
                            +{metrics.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span className={`status ${status}`}>
                        {getStatusLabel(status)}
                      </span>
                    </td>

                    <td>{getLastSeen(device)}</td>

                    <td>
                      <span className="location-text">
                        {getDeviceLocationText(device)}
                      </span>
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="ghost-button table-manage-btn"
                          onClick={() =>
                            setExpandedDeviceId(
                              expandedDeviceId === device.id ? null : device.id
                            )
                          }
                        >
                          {expandedDeviceId === device.id ? 'Close' : 'Manage'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expandedDeviceId === device.id && (
                    <tr className="device-table-expand-row">
                      <td colSpan="8">{renderManagePanel(device)}</td>
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
