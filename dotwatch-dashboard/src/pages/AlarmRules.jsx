import { useEffect, useMemo, useState } from 'react'
import {
  getAlarmRules,
  createAlarmRule,
  updateAlarmRule,
  deleteAlarmRule,
  getDevices,
} from '../services/api'

const defaultForm = {
  device_id: '',
  metric: 'temperature',
  operator: '>',
  threshold: 35,
  severity: 'critical',
}

const FILTERS = [
  { label: 'All Rules', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Disabled', value: 'disabled' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
]

function getMetricLabel(metric) {
  if (metric === 'temperature') return 'Temperature'
  if (metric === 'humidity') return 'Humidity'
  if (metric === 'rssi') return 'RSSI'
  return metric || '--'
}

function getUnit(metric) {
  if (metric === 'temperature') return '°C'
  if (metric === 'humidity') return '%'
  if (metric === 'rssi') return 'dBm'
  return ''
}

function getDeviceId(rule) {
  return rule.device_id ?? rule.deviceId ?? rule.device?.id ?? ''
}

function StatCard({ label, value, tone = '' }) {
  return (
    <article className={`unified-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function AlarmRules() {
  const [rules, setRules] = useState([])
  const [devices, setDevices] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadData() {
    try {
      setError('')

      const [rulesData, devicesData] = await Promise.all([
        getAlarmRules(),
        getDevices(),
      ])

      setRules(Array.isArray(rulesData) ? rulesData : [])
      setDevices(Array.isArray(devicesData) ? devicesData : [])
    } catch (err) {
      console.error(err)
      setError('โหลดข้อมูล Alarm Rules ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function updateForm(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  function getDeviceName(id) {
    const device = devices.find((item) => String(item.id) === String(id))
    return device?.name || device?.device_code || `Device #${id}`
  }

  async function handleCreate(event) {
    event.preventDefault()

    if (!form.device_id) {
      setError('กรุณาเลือก Device ก่อนสร้าง Rule')
      return
    }

    if (form.threshold === '' || Number.isNaN(Number(form.threshold))) {
      setError('กรุณาระบุ Threshold ให้ถูกต้อง')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      await createAlarmRule({
        device_id: Number(form.device_id),
        metric: form.metric,
        operator: form.operator,
        threshold: Number(form.threshold),
        severity: form.severity,
      })

      setForm(defaultForm)
      setMessage('เพิ่ม Alarm Rule สำเร็จแล้ว')
      await loadData()
    } catch (err) {
      console.error(err)
      setError(err.message || 'เพิ่ม Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm('ต้องการลบ Rule นี้ใช่ไหม?')
    if (!confirmed) return

    try {
      setActionLoading(String(id))
      setError('')
      setMessage('')

      await deleteAlarmRule(id)

      setMessage('ลบ Alarm Rule สำเร็จแล้ว')
      await loadData()
    } catch (err) {
      console.error(err)
      setError(err.message || 'ลบ Alarm Rule ไม่สำเร็จ')
    } finally {
      setActionLoading('')
    }
  }

  async function handleToggle(rule) {
    try {
      setActionLoading(String(rule.id))
      setError('')
      setMessage('')

      await updateAlarmRule(rule.id, {
        device_id: getDeviceId(rule),
        metric: rule.metric,
        operator: rule.operator,
        threshold: Number(rule.threshold),
        severity: rule.severity,
        is_active: !rule.is_active,
      })

      setMessage(
        rule.is_active
          ? 'ปิดใช้งาน Alarm Rule แล้ว'
          : 'เปิดใช้งาน Alarm Rule แล้ว'
      )
      await loadData()
    } catch (err) {
      console.error(err)
      setError(err.message || 'อัปเดต Alarm Rule ไม่สำเร็จ')
    } finally {
      setActionLoading('')
    }
  }

  const stats = useMemo(() => {
    const active = rules.filter((rule) => rule.is_active).length
    const critical = rules.filter((rule) => rule.severity === 'critical').length
    const warning = rules.filter((rule) => rule.severity === 'warning').length
    const protectedDevices = new Set(
      rules.map((rule) => String(getDeviceId(rule))).filter(Boolean)
    ).size

    return {
      total: rules.length,
      active,
      critical,
      warning,
      protectedDevices,
    }
  }, [rules])

  const filteredRules = useMemo(() => {
    const search = query.trim().toLowerCase()

    return rules
      .filter((rule) => {
        const isActive = Boolean(rule.is_active)
        if (filter === 'active') return isActive
        if (filter === 'disabled') return !isActive
        if (filter === 'critical') return rule.severity === 'critical'
        if (filter === 'warning') return rule.severity === 'warning'
        return true
      })
      .filter((rule) => {
        if (!search) return true

        const deviceName = getDeviceName(getDeviceId(rule)).toLowerCase()
        const haystack = [
          deviceName,
          rule.metric,
          rule.operator,
          rule.threshold,
          rule.severity,
          rule.is_active ? 'active' : 'disabled',
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(search)
      })
  }, [rules, filter, query, devices])

  return (
    <div className="unified-page alarm-rules-page">
      <header className="unified-page-header">
        <div>
          <span className="page-eyebrow">Configuration</span>
          <h1>Alarm Rules</h1>
          <p>จัดการเงื่อนไขแจ้งเตือนของอุปกรณ์ทั้งหมดให้เป็นมาตรฐานเดียวกัน</p>
        </div>

        <div className="unified-header-actions">
          <button type="button" className="ghost-button" onClick={loadData}>
            Refresh
          </button>
        </div>
      </header>

      <section className="unified-stat-grid five">
        <StatCard label="Total Rules" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="online" />
        <StatCard label="Critical" value={stats.critical} tone="critical" />
        <StatCard label="Warning" value={stats.warning} tone="warning" />
        <StatCard label="Protected Devices" value={stats.protectedDevices} />
      </section>

      {(message || error) && (
        <section className="unified-feedback-card">
          {message && <div className="auth-success">{message}</div>}
          {error && <div className="auth-error">{error}</div>}
        </section>
      )}

      <section className="unified-card">
        <div className="unified-card-header">
          <div>
            <h2>Create Rule</h2>
            <p>ตัวอย่างเช่น Temperature &gt; 35°C หรือ Humidity &gt; 80%</p>
          </div>
        </div>

        <form className="unified-rule-form" onSubmit={handleCreate}>
          <label>
            Device
            <select
              value={form.device_id}
              onChange={(event) => updateForm('device_id', event.target.value)}
            >
              <option value="">เลือก Device</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name || device.device_code || `Device #${device.id}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            Metric
            <select
              value={form.metric}
              onChange={(event) => updateForm('metric', event.target.value)}
            >
              <option value="temperature">Temperature</option>
              <option value="humidity">Humidity</option>
              <option value="rssi">RSSI</option>
            </select>
          </label>

          <label>
            Operator
            <select
              value={form.operator}
              onChange={(event) => updateForm('operator', event.target.value)}
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
          </label>

          <label>
            Threshold
            <input
              type="number"
              step="0.1"
              value={form.threshold}
              onChange={(event) => updateForm('threshold', event.target.value)}
            />
          </label>

          <label>
            Severity
            <select
              value={form.severity}
              onChange={(event) => updateForm('severity', event.target.value)}
            >
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving...' : 'Add Rule'}
          </button>
        </form>
      </section>

      <section className="unified-card">
        <div className="unified-card-header with-actions">
          <div>
            <h2>Rules List</h2>
            <p>รายการกฎแจ้งเตือนที่ตั้งค่าไว้</p>
          </div>

          <div className="unified-toolbar compact">
            <div className="unified-search-box">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rule, device, metric..."
              />
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <div className="unified-loading">Loading rules...</div>}

        {!loading && filteredRules.length === 0 && (
          <div className="unified-empty-state">
            <h3>No rules found</h3>
            <p>ยังไม่มี Alarm Rule ในเงื่อนไขที่เลือก</p>
          </div>
        )}

        {!loading && filteredRules.length > 0 && (
          <div className="unified-table-wrap">
            <table className="unified-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Metric</th>
                  <th>Condition</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => {
                  const severity = rule.severity || 'warning'
                  const isActive = Boolean(rule.is_active)
                  const metricLabel = getMetricLabel(rule.metric)
                  const unit = getUnit(rule.metric)

                  return (
                    <tr key={rule.id}>
                      <td>
                        <strong>{getDeviceName(getDeviceId(rule))}</strong>
                        <span>Rule #{rule.id}</span>
                      </td>
                      <td>{metricLabel}</td>
                      <td>
                        <strong>
                          {metricLabel} {rule.operator}{' '}
                          {Number(rule.threshold).toFixed(1)}
                          {unit}
                        </strong>
                      </td>
                      <td>
                        <span className={`status-pill ${severity}`}>
                          {severity}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            isActive
                              ? 'status-pill online'
                              : 'status-pill muted'
                          }
                        >
                          {isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <div className="unified-row-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={actionLoading === String(rule.id)}
                            onClick={() => handleToggle(rule)}
                          >
                            {isActive ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            type="button"
                            className="delete-btn"
                            disabled={actionLoading === String(rule.id)}
                            onClick={() => handleDelete(rule.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default AlarmRules
