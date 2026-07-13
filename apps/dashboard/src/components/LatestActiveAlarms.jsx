import { useEffect, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react'
import { getActiveAlarms } from '../services/api'
import { formatMetricValue } from '../utils/metricDisplayConfig'
import './LatestActiveAlarms.css'

function formatValue(value, unit = '', decimalPlaces = 2) {
  return formatMetricValue(value, unit, decimalPlaces)
}

function formatRelativeTime(value) {
  if (!value) return '--'

  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  )

  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return new Date(value).toLocaleDateString('th-TH')
}

function getAlarmIcon(state) {
  if (state === 'critical') return <AlertTriangle size={17} />
  if (state === 'warning') return <BellRing size={17} />
  return <CheckCircle2 size={17} />
}

function LatestActiveAlarms({ limit = 6 }) {
  const [alarms, setAlarms] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadActiveAlarms() {
    try {
      const data = await getActiveAlarms(limit)
      setAlarms(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Load active alarms error:', error)
      setAlarms([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadActiveAlarms()

    const timer = window.setInterval(loadActiveAlarms, 30000)

    return () => window.clearInterval(timer)
  }, [limit])

  return (
    <section className="app-card latest-active-alarms-card">
      <div className="latest-active-alarms-header">
        <div>
          <h2>Latest Active Alarms</h2>
          <p>แสดง Alarm ที่ยัง Active อยู่จาก alarm_states</p>
        </div>

        <span
          className={
            alarms.length > 0
              ? 'alarm-live-badge danger'
              : 'alarm-live-badge healthy'
          }
        >
          {alarms.length} Active
        </span>
      </div>

      {loading ? (
        <div className="latest-active-alarms-empty">
          <strong>Loading alarms...</strong>
          <p>กำลังโหลด Active Alarm ล่าสุด</p>
        </div>
      ) : alarms.length === 0 ? (
        <div className="latest-active-alarms-empty healthy">
          <CheckCircle2 size={22} />
          <strong>No active alarms</strong>
          <p>อุปกรณ์ทั้งหมดอยู่ในสถานะปกติ</p>
        </div>
      ) : (
        <div className="latest-active-alarms-list">
          {alarms.map((alarm) => (
            <article
              key={`${alarm.device_id}-${alarm.metric}`}
              className={`latest-active-alarm-item ${alarm.state || alarm.severity || 'warning'}`}
            >
              <div className="latest-active-alarm-icon">
                {getAlarmIcon(alarm.state || alarm.severity)}
              </div>

              <div className="latest-active-alarm-main">
                <div className="latest-active-alarm-title">
                  <strong>
                    {alarm.device_name ||
                      alarm.device_code ||
                      `Device ${alarm.device_id}`}
                  </strong>
                  <span>{alarm.state || alarm.severity}</span>
                </div>

                <p>
                  {alarm.notification_message || (
                    <>
                      {alarm.metric_name || alarm.metric}
                      {alarm.operator && alarm.threshold != null
                        ? ` ${alarm.operator} ${formatValue(alarm.threshold, alarm.unit, alarm.decimal_places)}`
                        : ''}
                    </>
                  )}
                </p>

                <small>
                  Current {formatValue(alarm.current_value, alarm.unit, alarm.decimal_places)}
                  {' • '}
                  Updated{' '}
                  {formatRelativeTime(alarm.updated_at || alarm.triggered_at)}
                </small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default LatestActiveAlarms
