import { useEffect, useMemo, useState } from 'react'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'
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
import { StatCard } from '../components/common'

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

function normalizeAlarmPayload(payload) {
  const data = payload?.data ?? payload?.alarm ?? payload?.alarms ?? []
  return (Array.isArray(data) ? data : [data]).filter(Boolean)
}

function getAlarmKey(alarm) {
  return String(
    alarm.id ||
      alarm.alarm_id ||
      `${alarm.device_id || alarm.deviceId || alarm.device_code || 'device'}-${
        alarm.metric || alarm.metric_key || 'metric'
      }-${alarm.triggered_at || alarm.time || alarm.created_at || Date.now()}`
  )
}

function mergeAlarmEvents(prev, nextAlarms) {
  const unique = new Map()

  ;[...nextAlarms, ...prev].forEach((alarm) => {
    unique.set(getAlarmKey(alarm), alarm)
  })

  return Array.from(unique.values()).sort((a, b) => {
    const aTime = new Date(a.triggered_at || a.time || a.created_at || 0).getTime()
    const bTime = new Date(b.triggered_at || b.time || b.created_at || 0).getTime()
    return bTime - aTime
  })
}

function isSameRealtimeDevice(device, reading) {
  return (
    String(device.id) === String(reading.id) ||
    String(device.id) === String(reading.device_id) ||
    String(device.device_code) === String(reading.device_code)
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

    let unsubscribeRealtime = null

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRealtime?.()
      unsubscribeRealtime = null

      if (!user) return

      unsubscribeRealtime = connectRealtime(user.uid, (payload) => {
        if (payload.type === 'alarm') {
          const nextAlarms = normalizeAlarmPayload(payload)
          if (nextAlarms.length > 0) {
            setAlarms((prev) => mergeAlarmEvents(prev, nextAlarms))
          }
        }

        if (payload.type === 'alarm:sync') {
          const nextAlarms = Array.isArray(payload.data) ? payload.data : []
          setAlarms(nextAlarms)
        }

        if (payload.type === 'device:update' || payload.type === 'reading') {
          const reading = payload.data || payload.device
          if (!reading) return

          setDevices((prev) =>
            prev.map((device) =>
              isSameRealtimeDevice(device, reading)
                ? { ...device, ...reading, id: device.id }
                : device
            )
          )
        }
      })
    })

    return () => {
      unsubscribeRealtime?.()
      unsubscribeAuth?.()
    }
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
    const rule = rules.find((item) => String(item.id) === String(ruleId))
    const ok = confirmDeleteAction({
      title: 'Confirm Delete Alarm Rule',
      targetName:
        rule?.metric || rule?.metric_key
          ? `${rule.metric || rule.metric_key} / ${rule.severity || 'rule'}`
          : `Rule ID ${ruleId}`,
      description:
        'Alarm Rule นี้จะถูกลบออกจากระบบ กรุณาพิมพ์ delete เพื่อยืนยัน',
    })

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

  return (
    <div className="page app-page alarms-page">
      <section className="app-page-header">
        <div>
          <span className="page-eyebrow">Alarm Center</span>
          <h2>Alarms</h2>
          <p>ติดตาม Alarm Events และ Alarm Rules ของอุปกรณ์ทั้งหมด</p>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={loadData}
          disabled={loading || saving}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </section>

      <section className="alarms-stat-grid dashboard-style-stat-grid">
        <StatCard
          label="Total Alarms"
          value={summary.total}
          hint="Event history"
        />
        <StatCard
          label="Active"
          value={summary.active}
          hint="Need attention"
          tone={summary.active > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Critical"
          value={summary.critical}
          hint="High priority"
          tone={summary.critical > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Warning"
          value={summary.warning}
          hint="Warning level"
          tone={summary.warning > 0 ? 'warning' : 'default'}
        />
      </section>

      <section className="app-card">
        <div className="app-section-title">
          <div>
            <h2>Alarm Events</h2>
            <p>รายการแจ้งเตือนล่าสุดจาก Dynamic Metrics</p>
          </div>
        </div>

        <div className="alarm-toolbar">
          <label className="search-input">
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
          <div className="app-empty-state">
            <h3>กำลังโหลดข้อมูล</h3>
            <p>กำลังดึงข้อมูล Alarm จาก Backend</p>
          </div>
        ) : filteredAlarms.length === 0 ? (
          <div className="app-empty-state">
            <Bell size={30} />
            <h3>ยังไม่มี Alarm</h3>
            <p>เมื่อมีค่าเกินเงื่อนไข ระบบจะแสดงรายการที่นี่</p>
          </div>
        ) : (
          <div className="alarm-table-wrap">
            <table className="device-v2-table alarm-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Metric</th>
                  <th>Condition</th>
                  <th>Value</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Triggered</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredAlarms.map((alarm) => {
                  const metricInfo = getMetricInfo(
                    alarm.device_id,
                    alarm.metric
                  )

                  return (
                    <tr key={alarm.id}>
                      <td>
                        <strong>{alarm.device_name || 'Unnamed Device'}</strong>
                        <span>
                          {alarm.device_code || `ID ${alarm.device_id}`}
                        </span>
                      </td>

                      <td>
                        <strong>{alarm.metric_name || metricInfo.name}</strong>
                        <span>{alarm.metric}</span>
                      </td>

                      <td>
                        {alarm.operator}{' '}
                        {formatValue(alarm.threshold, metricInfo.unit)}
                      </td>

                      <td>
                        <strong>
                          {formatValue(alarm.value, metricInfo.unit)}
                        </strong>
                      </td>

                      <td>
                        <span className={`status ${alarm.severity}`}>
                          {getSeverityLabel(alarm.severity)}
                        </span>
                      </td>

                      <td>
                        <span className={`status ${alarm.status}`}>
                          {getStatusLabel(alarm.status)}
                        </span>
                      </td>

                      <td>{formatDate(alarm.triggered_at)}</td>

                      <td>
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="app-card">
        <div className="app-section-title">
          <div>
            <h2>Alarm Rules</h2>
            <p>Rule ทั้งหมดที่ตั้งไว้ในหน้า Device</p>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="app-empty-state">
            <AlertTriangle size={30} />
            <h3>ยังไม่มี Alarm Rule</h3>
            <p>ไปที่หน้า Device → Manage เพื่อตั้ง Rule ให้แต่ละ Metric</p>
          </div>
        ) : (
          <div className="alarm-table-wrap">
            <table className="device-v2-table alarm-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Metric</th>
                  <th>Condition</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {rules.map((rule) => {
                  const metricInfo = getMetricInfo(rule.device_id, rule.metric)

                  return (
                    <tr key={rule.id}>
                      <td>
                        <strong>{rule.device_name || 'Unnamed Device'}</strong>
                        <span>
                          {rule.device_code || `ID ${rule.device_id}`}
                        </span>
                      </td>

                      <td>
                        <strong>{rule.metric_name || metricInfo.name}</strong>
                        <span>{rule.metric}</span>
                      </td>

                      <td>
                        {rule.operator}{' '}
                        {formatValue(rule.threshold, metricInfo.unit)}
                      </td>

                      <td>
                        <span className={`status ${rule.severity}`}>
                          {getSeverityLabel(rule.severity)}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={
                            rule.is_active ? 'status online' : 'status offline'
                          }
                          disabled={saving}
                          onClick={() => handleToggleRule(rule)}
                        >
                          {rule.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>

                      <td>{formatDate(rule.created_at)}</td>

                      <td>
                        <button
                          type="button"
                          className="delete-btn"
                          disabled={saving}
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
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
