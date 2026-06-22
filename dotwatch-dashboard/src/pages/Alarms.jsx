import { useEffect, useMemo, useState } from 'react'
import {
  acknowledgeAlarm,
  deleteAlarmRule,
  getAlarmRules,
  getAlarms,
  getDevices,
  updateAlarmRule,
} from '../services/api'
import { getDeviceMetrics } from '../services/metricDisplayApi'
import { formatMetricValue } from '../utils/metricDisplayConfig'

const TABS = [
  { label: 'Alarm Events', value: 'events' },
  { label: 'Alarm Rules', value: 'rules' },
]

const STATUS_FILTERS = [
  { label: 'All Alarms', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Acknowledged', value: 'acknowledged' },
]

const SEVERITY_FILTERS = [
  { label: 'All Severity', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
]

const RULE_FILTERS = [
  { label: 'All Rules', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Disabled', value: 'disabled' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
]

function formatDateTime(value) {
  if (!value) return '--'

  return new Date(value).toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function getDeviceId(rule) {
  return rule.device_id ?? rule.deviceId ?? rule.device?.id ?? ''
}

function normalizeMetricList(data) {
  const metrics = Array.isArray(data) ? data : data?.metrics || []

  return metrics
    .filter((metric) => metric && metric.visible !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function StatCard({ label, value, tone = '' }) {
  return (
    <article className={`unified-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function Alarms() {
  const [activeTab, setActiveTab] = useState('events')
  const [alarms, setAlarms] = useState([])
  const [rules, setRules] = useState([])
  const [devices, setDevices] = useState([])
  const [deviceMetrics, setDeviceMetrics] = useState({})

  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [ruleFilter, setRuleFilter] = useState('all')
  const [query, setQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function fetchMetricsForDevice(deviceId) {
    if (!deviceId) return []

    const data = await getDeviceMetrics(deviceId)
    return normalizeMetricList(data)
  }

  async function loadData() {
    try {
      setError('')
      setLoading(true)

      const [alarmsData, rulesData, devicesData] = await Promise.all([
        getAlarms(),
        getAlarmRules(),
        getDevices(),
      ])

      const nextAlarms = Array.isArray(alarmsData) ? alarmsData : []
      const nextRules = Array.isArray(rulesData) ? rulesData : []
      const nextDevices = Array.isArray(devicesData) ? devicesData : []

      setAlarms(nextAlarms)
      setRules(nextRules)
      setDevices(nextDevices)

      const deviceIds = [
        ...new Set(
          [
            ...nextDevices.map((device) => device.id),
            ...nextRules.map((rule) => getDeviceId(rule)),
          ]
            .filter(Boolean)
            .map(String)
        ),
      ]

      const entries = await Promise.all(
        deviceIds.map(async (deviceId) => {
          try {
            const metrics = await fetchMetricsForDevice(deviceId)
            return [deviceId, metrics]
          } catch (err) {
            console.error(`Load metrics error for device ${deviceId}:`, err)
            return [deviceId, []]
          }
        })
      )

      setDeviceMetrics(Object.fromEntries(entries))
    } catch (err) {
      console.error(err)
      setError('โหลดข้อมูล Alarm ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const timer = setInterval(loadData, 10000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  async function handleAcknowledge(id) {
    try {
      setActionLoading(String(id))
      setError('')
      setMessage('')

      await acknowledgeAlarm(id)
      await loadData()
    } catch (err) {
      console.error(err)
      setError('Acknowledge Alarm ไม่สำเร็จ')
    } finally {
      setActionLoading('')
    }
  }

  async function handleRuleToggle(rule) {
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

  async function handleRuleDelete(id) {
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

  function getDeviceName(id) {
    const device = devices.find((item) => String(item.id) === String(id))
    return device?.name || device?.device_code || `Device #${id}`
  }

  function getMetricOptions(deviceId) {
    if (!deviceId) return []
    return deviceMetrics[String(deviceId)] || deviceMetrics[deviceId] || []
  }

  function getMetricMeta(deviceId, metricKey) {
    const metric = getMetricOptions(deviceId).find(
      (item) => item.metric_key === metricKey
    )

    return {
      label: metric?.metric_name || metricKey || 'Unknown Metric',
      unit: metric?.unit || '',
    }
  }

  function getAlarmMetricMeta(alarm) {
    const metric = getMetricMeta(alarm.device_id, alarm.metric)

    return {
      displayName: metric.label || alarm.metric || 'Unknown Metric',
      unit: metric.unit || '',
    }
  }

  const alarmStats = useMemo(() => {
    const active = alarms.filter((alarm) => alarm.status === 'active').length
    const acknowledged = alarms.filter(
      (alarm) => alarm.status === 'acknowledged'
    ).length
    const critical = alarms.filter(
      (alarm) =>
        alarm.status === 'active' &&
        alarm.severity?.toLowerCase() === 'critical'
    ).length
    const warning = alarms.filter(
      (alarm) =>
        alarm.status === 'active' && alarm.severity?.toLowerCase() === 'warning'
    ).length

    return {
      total: alarms.length,
      active,
      critical,
      warning,
      acknowledged,
    }
  }, [alarms])

  const ruleStats = useMemo(() => {
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

  const filteredAlarms = useMemo(() => {
    const search = query.trim().toLowerCase()

    return alarms
      .filter((alarm) => {
        if (statusFilter === 'all') return true
        return alarm.status === statusFilter
      })
      .filter((alarm) => {
        if (severityFilter === 'all') return true
        return alarm.severity?.toLowerCase() === severityFilter
      })
      .filter((alarm) => {
        if (!search || activeTab !== 'events') return true
        const haystack = [
          alarm.device_name,
          alarm.device_code,
          alarm.device_id,
          alarm.metric,
          alarm.value,
          alarm.operator,
          alarm.threshold,
          alarm.severity,
          alarm.status,
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(search)
      })
      .sort((a, b) => new Date(b.triggered_at) - new Date(a.triggered_at))
  }, [alarms, statusFilter, severityFilter, query, activeTab])

  const filteredRules = useMemo(() => {
    const search = query.trim().toLowerCase()

    return rules
      .filter((rule) => {
        const isActive = Boolean(rule.is_active)
        if (ruleFilter === 'active') return isActive
        if (ruleFilter === 'disabled') return !isActive
        if (ruleFilter === 'critical') return rule.severity === 'critical'
        if (ruleFilter === 'warning') return rule.severity === 'warning'
        return true
      })
      .filter((rule) => {
        if (!search || activeTab !== 'rules') return true

        const deviceId = getDeviceId(rule)
        const deviceName = getDeviceName(deviceId).toLowerCase()
        const metricMeta = getMetricMeta(deviceId, rule.metric)
        const haystack = [
          deviceName,
          metricMeta.label,
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
  }, [rules, ruleFilter, query, devices, deviceMetrics, activeTab])

  const currentStats = activeTab === 'events' ? alarmStats : ruleStats

  return (
    <div className="unified-page alarms-page">
      <header className="unified-page-header">
        <div>
          <span className="page-eyebrow">Operation Center</span>
          <h1>Alarm Center</h1>
          <p>
            ติดตาม Alarm Events และตรวจสอบ Alarm Rules ทั้งหมดในระบบจากหน้าเดียว
          </p>
        </div>

        <div className="unified-header-actions">
          <button type="button" className="ghost-button" onClick={loadData}>
            Refresh
          </button>
        </div>
      </header>

      <section className="unified-stat-grid five">
        {activeTab === 'events' ? (
          <>
            <StatCard label="Total Alarms" value={currentStats.total} />
            <StatCard
              label="Active"
              value={currentStats.active}
              tone="critical"
            />
            <StatCard
              label="Critical"
              value={currentStats.critical}
              tone="critical"
            />
            <StatCard
              label="Warning"
              value={currentStats.warning}
              tone="warning"
            />
            <StatCard
              label="Acknowledged"
              value={currentStats.acknowledged}
              tone="muted"
            />
          </>
        ) : (
          <>
            <StatCard label="Total Rules" value={currentStats.total} />
            <StatCard
              label="Active"
              value={currentStats.active}
              tone="online"
            />
            <StatCard
              label="Critical"
              value={currentStats.critical}
              tone="critical"
            />
            <StatCard
              label="Warning"
              value={currentStats.warning}
              tone="warning"
            />
            <StatCard
              label="Protected Devices"
              value={currentStats.protectedDevices}
            />
          </>
        )}
      </section>

      {(message || error) && (
        <section className="unified-feedback-card">
          {message && <div className="auth-success">{message}</div>}
          {error && <div className="auth-error">{error}</div>}
        </section>
      )}

      <section className="unified-card">
        <div className="unified-card-header with-actions">
          <div>
            <h2>{activeTab === 'events' ? 'Alarm Events' : 'Alarm Rules'}</h2>
            <p>
              {activeTab === 'events'
                ? 'รายการ Alarm ล่าสุด ระบบจะ refresh อัตโนมัติทุก 10 วินาที'
                : 'รายการกฎแจ้งเตือนที่ตั้งค่าไว้ โดยสร้างและแก้ไขจากหน้า Device แต่ละตัว'}
            </p>
          </div>

          <div className="unified-toolbar compact">
            <div className="device-view-switch">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={activeTab === tab.value ? 'active' : ''}
                  onClick={() => {
                    setActiveTab(tab.value)
                    setQuery('')
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="unified-search-box">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  activeTab === 'events'
                    ? 'Search alarm, device, metric...'
                    : 'Search rule, device, metric...'
                }
              />
            </div>

            {activeTab === 'events' ? (
              <>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {STATUS_FILTERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <select
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                >
                  {SEVERITY_FILTERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select
                value={ruleFilter}
                onChange={(event) => setRuleFilter(event.target.value)}
              >
                {RULE_FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {loading && (
          <div className="unified-loading">
            {activeTab === 'events' ? 'Loading alarms...' : 'Loading rules...'}
          </div>
        )}

        {!loading && activeTab === 'events' && filteredAlarms.length === 0 && (
          <div className="unified-empty-state">
            <h3>No alarms found</h3>
            <p>ยังไม่มี Alarm ในเงื่อนไขที่เลือก</p>
          </div>
        )}

        {!loading && activeTab === 'rules' && filteredRules.length === 0 && (
          <div className="unified-empty-state">
            <h3>No rules found</h3>
            <p>ยังไม่มี Alarm Rule ในเงื่อนไขที่เลือก</p>
          </div>
        )}

        {!loading && activeTab === 'events' && filteredAlarms.length > 0 && (
          <div className="unified-table-wrap">
            <table className="unified-table alarms-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Device</th>
                  <th>Alarm</th>
                  <th>Current</th>
                  <th>Threshold</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlarms.map((alarm) => {
                  const severity = alarm.severity?.toLowerCase() || 'warning'
                  const isActive = alarm.status === 'active'
                  const metricMeta = getAlarmMetricMeta(alarm)
                  const metricLabel = metricMeta.displayName
                  const unit = metricMeta.unit

                  return (
                    <tr key={alarm.id} className={isActive ? 'active-row' : ''}>
                      <td>
                        <strong>{formatDateTime(alarm.triggered_at)}</strong>
                        <span>
                          Ack: {formatDateTime(alarm.acknowledged_at)}
                        </span>
                      </td>

                      <td>
                        <strong>{alarm.device_name || 'Unknown Device'}</strong>
                        <span>
                          {alarm.device_code || `Device #${alarm.device_id}`}
                        </span>
                      </td>

                      <td>
                        <strong>{metricLabel}</strong>
                        <span>Metric abnormal detected</span>
                      </td>

                      <td>
                        <strong>{formatMetricValue(alarm.value, unit)}</strong>
                      </td>

                      <td>
                        <strong>
                          {alarm.operator}{' '}
                          {formatMetricValue(alarm.threshold, unit)}
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
                              ? 'status-pill critical'
                              : 'status-pill muted'
                          }
                        >
                          {alarm.status}
                        </span>
                      </td>

                      <td>
                        {isActive ? (
                          <button
                            type="button"
                            className="primary-button"
                            disabled={actionLoading === String(alarm.id)}
                            onClick={() => handleAcknowledge(alarm.id)}
                          >
                            {actionLoading === String(alarm.id)
                              ? 'Processing...'
                              : 'Acknowledge'}
                          </button>
                        ) : (
                          <span className="status-pill muted">Done</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && activeTab === 'rules' && filteredRules.length > 0 && (
          <div className="unified-table-wrap">
            <table className="unified-table alarm-rules-table">
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
                  const deviceId = getDeviceId(rule)
                  const metricMeta = getMetricMeta(deviceId, rule.metric)

                  return (
                    <tr key={rule.id}>
                      <td>
                        <strong>{getDeviceName(deviceId)}</strong>
                        <span>Rule #{rule.id}</span>
                      </td>

                      <td>{metricMeta.label}</td>

                      <td>
                        <strong>
                          {metricMeta.label} {rule.operator}{' '}
                          {formatMetricValue(rule.threshold, metricMeta.unit)}
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
                            onClick={() => handleRuleToggle(rule)}
                          >
                            {isActive ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            type="button"
                            className="delete-btn"
                            disabled={actionLoading === String(rule.id)}
                            onClick={() => handleRuleDelete(rule.id)}
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

export default Alarms
