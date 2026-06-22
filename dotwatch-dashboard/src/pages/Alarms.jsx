import { useEffect, useMemo, useState } from 'react'
import { acknowledgeAlarm, getAlarms } from '../services/api'

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

function formatDateTime(value) {
  if (!value) return '--'

  return new Date(value).toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function formatValue(value) {
  if (value == null || value === '') return '--'
  const number = Number(value)
  if (Number.isNaN(number)) return String(value)
  return number.toFixed(1)
}

function getUnit(metric) {
  if (metric === 'temperature') return '°C'
  if (metric === 'humidity') return '%'
  if (metric === 'rssi') return 'dBm'
  return ''
}

function getMetricLabel(metric) {
  if (metric === 'temperature') return 'Temperature'
  if (metric === 'humidity') return 'Humidity'
  if (metric === 'rssi') return 'RSSI'
  return metric || '--'
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
  const [alarms, setAlarms] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [error, setError] = useState('')

  async function loadAlarms() {
    try {
      setError('')
      const data = await getAlarms()
      setAlarms(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setError('โหลดข้อมูล Alarm ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlarms()

    const timer = setInterval(loadAlarms, 10000)
    return () => clearInterval(timer)
  }, [])

  async function handleAcknowledge(id) {
    try {
      setActionLoading(String(id))
      await acknowledgeAlarm(id)
      await loadAlarms()
    } catch (err) {
      console.error(err)
      setError('Acknowledge Alarm ไม่สำเร็จ')
    } finally {
      setActionLoading('')
    }
  }

  const stats = useMemo(() => {
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
        if (!search) return true
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
  }, [alarms, statusFilter, severityFilter, query])

  return (
    <div className="unified-page alarms-page">
      <header className="unified-page-header">
        <div>
          <span className="page-eyebrow">Operation Center</span>
          <h1>Alarm Center</h1>
          <p>ติดตามเหตุการณ์ผิดปกติของอุปกรณ์ทั้งหมดในระบบแบบรวมศูนย์</p>
        </div>

        <div className="unified-header-actions">
          <button type="button" className="ghost-button" onClick={loadAlarms}>
            Refresh
          </button>
        </div>
      </header>

      <section className="unified-stat-grid five">
        <StatCard label="Total Alarms" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="critical" />
        <StatCard label="Critical" value={stats.critical} tone="critical" />
        <StatCard label="Warning" value={stats.warning} tone="warning" />
        <StatCard
          label="Acknowledged"
          value={stats.acknowledged}
          tone="muted"
        />
      </section>

      {error && (
        <section className="unified-feedback-card">
          <div className="auth-error">{error}</div>
        </section>
      )}

      <section className="unified-card">
        <div className="unified-card-header with-actions">
          <div>
            <h2>Alarm Events</h2>
            <p>รายการ Alarm ล่าสุด ระบบจะ refresh อัตโนมัติทุก 10 วินาที</p>
          </div>

          <div className="unified-toolbar compact">
            <div className="unified-search-box">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search alarm, device, metric..."
              />
            </div>

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
          </div>
        </div>

        {loading && <div className="unified-loading">Loading alarms...</div>}

        {!loading && filteredAlarms.length === 0 && (
          <div className="unified-empty-state">
            <h3>No alarms found</h3>
            <p>ยังไม่มี Alarm ในเงื่อนไขที่เลือก</p>
          </div>
        )}

        {!loading && filteredAlarms.length > 0 && (
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
                  const metricLabel = getMetricLabel(alarm.metric)
                  const unit = getUnit(alarm.metric)

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
                        <strong>
                          {formatValue(alarm.value)}
                          {unit}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          {alarm.operator} {formatValue(alarm.threshold)}
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
      </section>
    </div>
  )
}

export default Alarms
