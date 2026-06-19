import { useEffect, useMemo, useState } from 'react'
import { acknowledgeAlarm, getAlarms } from '../services/api'

function formatDateTime(value) {
  if (!value) return '--'

  return new Date(value).toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function formatValue(value) {
  if (value == null) return '--'
  return Number(value).toFixed(1)
}

function Alarms() {
  const [alarms, setAlarms] = useState([])
  const [filter, setFilter] = useState('all')
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

  const activeCount = alarms.filter((a) => a.status === 'active').length
  const acknowledgedCount = alarms.filter(
    (a) => a.status === 'acknowledged'
  ).length

  const criticalCount = alarms.filter(
    (a) =>
      a.status === 'active' &&
      a.severity?.toLowerCase() === 'critical'
  ).length

  const warningCount = alarms.filter(
    (a) =>
      a.status === 'active' &&
      a.severity?.toLowerCase() === 'warning'
  ).length

  const filteredAlarms = useMemo(() => {
    const list =
      filter === 'all'
        ? alarms
        : alarms.filter((alarm) => alarm.status === filter)

    return [...list].sort(
      (a, b) => new Date(b.triggered_at) - new Date(a.triggered_at)
    )
  }, [alarms, filter])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Alarm Center</h1>
          <p>ติดตามเหตุการณ์ผิดปกติของอุปกรณ์ทั้งหมดในระบบ</p>
        </div>

        <button type="button" className="ghost-button" onClick={loadAlarms}>
          Refresh
        </button>
      </div>

      <section className="alarm-summary-grid">
        <article className="summary-card">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </article>

        <article className="summary-card">
          <span>Critical</span>
          <strong>{criticalCount}</strong>
        </article>

        <article className="summary-card">
          <span>Warning</span>
          <strong>{warningCount}</strong>
        </article>

        <article className="summary-card">
          <span>Acknowledged</span>
          <strong>{acknowledgedCount}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="alarm-toolbar">
          <div className="alarm-filter-row">
            <button
              type="button"
              className={filter === 'all' ? 'filter-button active' : 'filter-button'}
              onClick={() => setFilter('all')}
            >
              All
            </button>

            <button
              type="button"
              className={filter === 'active' ? 'filter-button active' : 'filter-button'}
              onClick={() => setFilter('active')}
            >
              Active
            </button>

            <button
              type="button"
              className={
                filter === 'acknowledged' ? 'filter-button active' : 'filter-button'
              }
              onClick={() => setFilter('acknowledged')}
            >
              Acknowledged
            </button>
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {loading && <div className="loading">Loading alarms...</div>}

        {!loading && filteredAlarms.length === 0 && (
          <div className="empty-state">
            <h3>No alarms found</h3>
            <p>ยังไม่มี Alarm ในเงื่อนไขที่เลือก</p>
          </div>
        )}

        {!loading && filteredAlarms.length > 0 && (
          <div className="alarm-list">
            {filteredAlarms.map((alarm) => {
              const severity = alarm.severity?.toLowerCase() || 'warning'
              const isActive = alarm.status === 'active'

              return (
                <article
                  key={alarm.id}
                  className={`alarm-card ${severity} ${alarm.status}`}
                >
                  <div className="alarm-card-main">
                    <div className="alarm-title-row">
                      <div>
                        <h3>{alarm.device_name || 'Unknown Device'}</h3>
                        <p>{alarm.device_code || `Device #${alarm.device_id}`}</p>
                      </div>

                      <div className="alarm-badges">
                        <span className={`alarm-severity ${severity}`}>
                          {alarm.severity || 'warning'}
                        </span>

                        <span
                          className={
                            isActive
                              ? 'alarm-status active'
                              : 'alarm-status acknowledged'
                          }
                        >
                          {alarm.status}
                        </span>
                      </div>
                    </div>

                    <div className="alarm-detail-grid">
                      <div>
                        <label>Metric</label>
                        <strong>{alarm.metric}</strong>
                      </div>

                      <div>
                        <label>Current Value</label>
                        <strong>{formatValue(alarm.value)}</strong>
                      </div>

                      <div>
                        <label>Threshold</label>
                        <strong>
                          {alarm.operator} {formatValue(alarm.threshold)}
                        </strong>
                      </div>

                      <div>
                        <label>Triggered At</label>
                        <strong>{formatDateTime(alarm.triggered_at)}</strong>
                      </div>

                      <div>
                        <label>Acknowledged At</label>
                        <strong>{formatDateTime(alarm.acknowledged_at)}</strong>
                      </div>
                    </div>
                  </div>

                  {isActive && (
                    <button
                      type="button"
                      className="primary-button alarm-action"
                      disabled={actionLoading === String(alarm.id)}
                      onClick={() => handleAcknowledge(alarm.id)}
                    >
                      {actionLoading === String(alarm.id)
                        ? 'Processing...'
                        : 'Acknowledge'}
                    </button>
                  )}
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