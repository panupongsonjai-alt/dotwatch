import { useEffect, useMemo, useState } from 'react'
import {
  acknowledgeAlarm,
  deleteAlarmRule,
  getAlarmRules,
  getAlarms,
  getDevices,
  getDeviceMetrics,
  updateAlarmRule,
} from '../services/api'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../components/common'

function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function formatValue(value, unit = '') {
  if (value == null || value === '' || Number.isNaN(Number(value))) {
    return '--'
  }

  const numberValue = Number(value)
  const displayValue = Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1)

  return `${displayValue}${unit ? ` ${unit}` : ''}`
}

function getSeverityLabel(severity) {
  if (severity === 'critical') return 'Critical'
  if (severity === 'warning') return 'Warning'
  return severity || 'Unknown'
}

function getStatusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'acknowledged') return 'Acknowledged'
  return status || 'Unknown'
}

function getRelativeTime(value) {
  if (!value) return '--'

  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '--'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - time) / 1000))

  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  return `${Math.floor(diffSeconds / 86400)}d ago`
}

function getAlarmTone(alarm) {
  if (alarm?.severity === 'critical') return 'danger'
  if (alarm?.severity === 'warning') return 'warning'
  return 'default'
}

function AlarmPriorityCard({ alarm, metricInfo, saving, onAcknowledge }) {
  if (!alarm) {
    return (
      <section className="dw-card alarm-focus-card empty">
        <div className="alarm-focus-icon healthy">
          <CheckCircle2 size={28} />
        </div>
        <div>
          <span className="page-eyebrow">Priority</span>
          <h2>No Active Alarm</h2>
          <p>ระบบยังไม่มี Alarm ที่ต้องดำเนินการตอนนี้</p>
        </div>
      </section>
    )
  }

  return (
    <section className={`dw-card alarm-focus-card ${alarm.severity}`}>
      <div className="alarm-focus-icon">
        <AlertTriangle size={28} />
      </div>

      <div className="alarm-focus-main">
        <div className="alarm-focus-topline">
          <span className="page-eyebrow">Priority Alarm</span>
          <StatusBadge
            status={alarm.severity}
            label={getSeverityLabel(alarm.severity)}
          />
        </div>

        <h2>{alarm.device_name || 'Unnamed Device'}</h2>
        <p>
          {alarm.metric_name || metricInfo.name} {alarm.operator}{' '}
          {formatValue(alarm.threshold, metricInfo.unit)}
        </p>

        <div className="alarm-focus-meta">
          <span>
            Current:{' '}
            <strong>{formatValue(alarm.value, metricInfo.unit)}</strong>
          </span>
          <span>{getRelativeTime(alarm.triggered_at)}</span>
          <span>{alarm.device_code || `ID ${alarm.device_id}`}</span>
        </div>
      </div>

      {alarm.status === 'active' && (
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={() => onAcknowledge(alarm.id)}
        >
          <CheckCircle2 size={16} />
          Acknowledge
        </button>
      )}
    </section>
  )
}

function Alarms() {
  const [alarms, setAlarms] = useState([])
  const [rules, setRules] = useState([])
  const [devices, setDevices] = useState([])
  const [deviceMetrics, setDeviceMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')

  async function loadData() {
    try {
      setLoading(true)

      const [alarmData, ruleData, deviceData] = await Promise.all([
        getAlarms(),
        getAlarmRules(),
        getDevices(),
      ])

      const nextAlarms = Array.isArray(alarmData) ? alarmData : []
      const nextRules = Array.isArray(ruleData) ? ruleData : []
      const nextDevices = Array.isArray(deviceData) ? deviceData : []

      setAlarms(nextAlarms)
      setRules(nextRules)
      setDevices(nextDevices)

      const metricEntries = await Promise.all(
        nextDevices.map(async (device) => {
          try {
            const metrics = await getDeviceMetrics(device.id)
            return [device.id, Array.isArray(metrics) ? metrics : []]
          } catch (error) {
            console.error(`Load metrics error device ${device.id}:`, error)
            return [device.id, []]
          }
        })
      )

      setDeviceMetrics(Object.fromEntries(metricEntries))
    } catch (error) {
      console.error('Load alarms error:', error)
      alert(error.message || 'โหลดข้อมูล Alarm ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function getMetricInfo(deviceId, metricKey) {
    const metrics = deviceMetrics[deviceId] || []
    const metric = metrics.find((item) => item.metric_key === metricKey)

    return {
      name: metric?.metric_name || metricKey || '--',
      unit: metric?.unit || '',
    }
  }

  async function handleAcknowledge(alarmId) {
    try {
      setSaving(true)
      await acknowledgeAlarm(alarmId)
      await loadData()
    } catch (error) {
      console.error('Acknowledge alarm error:', error)
      alert(error.message || 'Acknowledge ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleRule(rule) {
    try {
      setSaving(true)

      await updateAlarmRule(rule.id, {
        device_id: rule.device_id,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        severity: rule.severity,
        is_active: !rule.is_active,
      })

      await loadData()
    } catch (error) {
      console.error('Toggle rule error:', error)
      alert(error.message || 'แก้ไขสถานะ Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRule(ruleId) {
    const ok = confirm('ต้องการลบ Alarm Rule นี้ใช่ไหม?')
    if (!ok) return

    try {
      setSaving(true)
      await deleteAlarmRule(ruleId)
      await loadData()
    } catch (error) {
      console.error('Delete rule error:', error)
      alert(error.message || 'ลบ Alarm Rule ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const summary = useMemo(() => {
    return alarms.reduce(
      (acc, alarm) => {
        acc.total += 1

        if (alarm.status === 'active') acc.active += 1
        if (alarm.status === 'acknowledged') acc.acknowledged += 1
        if (alarm.severity === 'critical') acc.critical += 1
        if (alarm.severity === 'warning') acc.warning += 1

        return acc
      },
      {
        total: 0,
        active: 0,
        acknowledged: 0,
        critical: 0,
        warning: 0,
      }
    )
  }, [alarms])

  const activeAlarms = useMemo(() => {
    return alarms.filter((alarm) => alarm.status === 'active')
  }, [alarms])

  const priorityAlarm = useMemo(() => {
    return [...activeAlarms].sort((a, b) => {
      const severityA = a.severity === 'critical' ? 0 : 1
      const severityB = b.severity === 'critical' ? 0 : 1

      if (severityA !== severityB) return severityA - severityB

      return new Date(b.triggered_at || 0) - new Date(a.triggered_at || 0)
    })[0]
  }, [activeAlarms])

  const filteredAlarms = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return alarms.filter((alarm) => {
      const metricInfo = getMetricInfo(alarm.device_id, alarm.metric)

      const text = [
        alarm.device_name,
        alarm.device_code,
        alarm.metric,
        metricInfo.name,
        alarm.severity,
        alarm.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchSearch = !keyword || text.includes(keyword)
      const matchStatus =
        statusFilter === 'all' || alarm.status === statusFilter
      const matchSeverity =
        severityFilter === 'all' || alarm.severity === severityFilter

      return matchSearch && matchStatus && matchSeverity
    })
  }, [alarms, search, statusFilter, severityFilter, deviceMetrics])

  const activeRuleCount = rules.filter((rule) => rule.is_active).length

  return (
    <div className="page app-page alarms-page alarms-center-page">
      <PageHeader
        eyebrow="Alarm Center"
        title="Alarm Operations"
        description="ติดตาม Alarm Events, Priority Alarm และ Rule ทั้งหมดของอุปกรณ์ dotWatch"
        meta={`${summary.active} Active • ${summary.critical} Critical • ${activeRuleCount}/${rules.length} Rules Active`}
        actions={
          <button
            type="button"
            className="ghost-button"
            onClick={loadData}
            disabled={loading || saving}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        }
      />

      <section className="dw-stat-grid alarms-stat-grid">
        <StatCard label="Active" value={summary.active} tone="danger" />
        <StatCard label="Critical" value={summary.critical} tone="danger" />
        <StatCard label="Warning" value={summary.warning} tone="warning" />
        <StatCard label="Rules" value={rules.length} hint={`${activeRuleCount} active`} />
      </section>

      <AlarmPriorityCard
        alarm={priorityAlarm}
        metricInfo={
          priorityAlarm
            ? getMetricInfo(priorityAlarm.device_id, priorityAlarm.metric)
            : { name: '--', unit: '' }
        }
        saving={saving}
        onAcknowledge={handleAcknowledge}
      />

      <section className="dw-card alarms-events-card">
        <SectionHeader
          title="Alarm Events"
          description="รายการแจ้งเตือนล่าสุดจาก Dynamic Metrics"
          actions={
            <div className="alarm-mini-summary">
              <span>{filteredAlarms.length} shown</span>
            </div>
          }
        />

        <div className="alarm-toolbar clean">
          <label className="search-input alarm-search-input">
            <Search size={16} />
            <input
              value={search}
              placeholder="Search device, metric, severity..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>
        </div>

        {loading ? (
          <EmptyState
            title="กำลังโหลดข้อมูล"
            description="กำลังดึงข้อมูล Alarm จาก Backend"
          />
        ) : filteredAlarms.length === 0 ? (
          <EmptyState
            title="ยังไม่มี Alarm"
            description="เมื่อมีค่าเกินเงื่อนไข ระบบจะแสดงรายการที่นี่"
          />
        ) : (
          <div className="alarm-event-list">
            {filteredAlarms.map((alarm) => {
              const metricInfo = getMetricInfo(alarm.device_id, alarm.metric)

              return (
                <article
                  key={alarm.id}
                  className={`alarm-event-card ${getAlarmTone(alarm)}`}
                >
                  <div className="alarm-event-main">
                    <div className="alarm-event-icon">
                      <AlertTriangle size={18} />
                    </div>

                    <div>
                      <div className="alarm-event-title-row">
                        <h3>{alarm.device_name || 'Unnamed Device'}</h3>
                        <StatusBadge
                          status={alarm.severity}
                          label={getSeverityLabel(alarm.severity)}
                          size="sm"
                        />
                      </div>

                      <p>
                        {alarm.metric_name || metricInfo.name} {alarm.operator}{' '}
                        {formatValue(alarm.threshold, metricInfo.unit)}
                      </p>

                      <div className="alarm-event-meta">
                        <span>{alarm.device_code || `ID ${alarm.device_id}`}</span>
                        <span>
                          Current:{' '}
                          {formatValue(alarm.value, metricInfo.unit)}
                        </span>
                        <span>{formatDate(alarm.triggered_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="alarm-event-actions">
                    <StatusBadge
                      status={alarm.status}
                      label={getStatusLabel(alarm.status)}
                      size="sm"
                    />

                    {alarm.status === 'active' && (
                      <button
                        type="button"
                        className="save-btn"
                        disabled={saving}
                        onClick={() => handleAcknowledge(alarm.id)}
                      >
                        <CheckCircle2 size={15} />
                        Ack
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="dw-card alarm-rules-card">
        <SectionHeader
          title="Alarm Rules"
          description="Rule ทั้งหมดที่ตั้งไว้ในหน้า Device"
          actions={
            <div className="alarm-mini-summary">
              <span>{activeRuleCount} active</span>
            </div>
          }
        />

        {rules.length === 0 ? (
          <EmptyState
            title="ยังไม่มี Alarm Rule"
            description="ไปที่หน้า Device → Manage เพื่อตั้ง Rule ให้แต่ละ Metric"
          />
        ) : (
          <div className="alarm-rule-list-clean">
            {rules.map((rule) => {
              const metricInfo = getMetricInfo(rule.device_id, rule.metric)

              return (
                <article key={rule.id} className="alarm-rule-card-clean">
                  <div className="alarm-rule-main-clean">
                    <div>
                      <h3>{rule.device_name || 'Unnamed Device'}</h3>
                      <p>{rule.device_code || `ID ${rule.device_id}`}</p>
                    </div>

                    <div>
                      <strong>{rule.metric_name || metricInfo.name}</strong>
                      <span>{rule.metric}</span>
                    </div>

                    <div>
                      <strong>
                        {rule.operator} {formatValue(rule.threshold, metricInfo.unit)}
                      </strong>
                      <span>Condition</span>
                    </div>
                  </div>

                  <div className="alarm-rule-actions-clean">
                    <StatusBadge
                      status={rule.severity}
                      label={getSeverityLabel(rule.severity)}
                      size="sm"
                    />

                    <button
                      type="button"
                      className={rule.is_active ? 'save-btn' : 'secondary-button'}
                      disabled={saving}
                      onClick={() => handleToggleRule(rule)}
                    >
                      {rule.is_active ? 'Active' : 'Disabled'}
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      disabled={saving}
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default Alarms
