import { useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'
import {
  acknowledgeAlarm,
  clearAlarmEvents,
  deleteAlarmRule,
  getAlarmRules,
  getAlarms,
  getDevices,
  getDeviceMetrics,
  updateAlarmRule,
} from '../services/api'
import {
  AlertTriangle,
  CalendarDays,
  Bell,
  CheckCircle2,
  Download,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  ClearFilteredDataDialog,
  NoticeBanner,
  PageHeader,
  StatCard,
} from '../components/common'
import { confirmDeleteAction } from '../utils/typedConfirm'
import {
  downloadCsv,
  getLocalDateInputValue,
  isDateInRange,
} from '../utils/tableExport'

const TABLE_PAGE_SIZES = [20, 50, 100]
const EVENT_PAGE_SIZES = [10, 20, 50, 100]

function getTimestamp(item, fields) {
  for (const field of fields) {
    const value = item?.[field]
    if (!value) continue

    const timestamp = new Date(value).getTime()
    if (!Number.isNaN(timestamp)) return timestamp
  }

  return 0
}

function getPageRange(page, pageSize, total) {
  if (total === 0) return { start: 0, end: 0 }

  const start = (page - 1) * pageSize + 1
  return { start, end: Math.min(total, start + pageSize - 1) }
}

function TableViewControls({
  page,
  pageSize,
  sortOrder,
  total,
  onPageSizeChange,
  onSortOrderChange,
  pageSizes = TABLE_PAGE_SIZES,
}) {
  const range = getPageRange(page, pageSize, total)

  return (
    <div className="alarm-table-actions">
      <span>
        {range.start}-{range.end} / {total} rows
      </span>

      <label>
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label="จำนวนแถวต่อหน้า"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size} rows
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Sort</span>
        <select
          value={sortOrder}
          onChange={(event) => onSortOrderChange(event.target.value)}
          aria-label="ลำดับข้อมูล"
        >
          <option value="desc">ล่าสุดก่อน</option>
          <option value="asc">เก่าสุดก่อน</option>
        </select>
      </label>
    </div>
  )
}

function TablePagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null

  const range = getPageRange(page, pageSize, total)

  return (
    <div className="alarm-table-pagination">
      <div>
        Showing {range.start}-{range.end} of {total}
      </div>

      <div className="alarm-pagination-actions">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
        >
          First
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
        >
          Last
        </button>
      </div>
    </div>
  )
}

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
  if (status === 'resolved') return 'Resolved'
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
    const aTime = new Date(
      a.triggered_at || a.time || a.created_at || 0
    ).getTime()
    const bTime = new Date(
      b.triggered_at || b.time || b.created_at || 0
    ).getTime()
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

function showDatePicker(inputRef) {
  const input = inputRef.current
  if (!input) return

  if (typeof input.showPicker === 'function') {
    input.showPicker()
    return
  }

  input.focus()
  input.click()
}

function formatDateOnly(value) {
  if (!value) return '--'

  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('th-TH')
}

function Alarms() {
  const [alarms, setAlarms] = useState([])
  const [rules, setRules] = useState([])
  const [devices, setDevices] = useState([])
  const [deviceMetrics, setDeviceMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const today = getLocalDateInputValue()
  const [eventDeviceFilter, setEventDeviceFilter] = useState('all')
  const [eventMetricFilter, setEventMetricFilter] = useState('all')
  const [eventStartDate, setEventStartDate] = useState(today)
  const [eventEndDate, setEventEndDate] = useState(today)
  const eventStartDateInputRef = useRef(null)
  const eventEndDateInputRef = useRef(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearingAlarms, setClearingAlarms] = useState(false)
  const [notice, setNotice] = useState('')
  const [pageError, setPageError] = useState('')
  const [alarmPageSize, setAlarmPageSize] = useState(20)
  const [alarmSortOrder, setAlarmSortOrder] = useState('desc')
  const [alarmPage, setAlarmPage] = useState(1)

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
            const metricResult = await getDeviceMetrics(device.id)
            const metrics = Array.isArray(metricResult?.metrics)
              ? metricResult.metrics
              : Array.isArray(metricResult)
                ? metricResult
                : []

            return [device.id, metrics]
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

  function openClearAlarmDialog() {
    if (filteredAlarms.length === 0 || clearingAlarms) return
    setClearDialogOpen(true)
  }

  function closeClearAlarmDialog() {
    if (clearingAlarms) return
    setClearDialogOpen(false)
  }

  async function handleClearAlarms() {
    if (filteredAlarms.length === 0 || clearingAlarms) return

    try {
      setClearingAlarms(true)
      setNotice('')
      setPageError('')

      const result = await clearAlarmEvents({
        deviceId: eventDeviceFilter,
        metric: eventMetricFilter,
        from: eventStartDate,
        to: eventEndDate,
      })
      const deletedCount = Number(
        result?.deletedCount ?? result?.deleted_count ?? 0
      )

      setClearDialogOpen(false)
      setAlarmPage(1)
      setNotice(
        deletedCount > 0
          ? `ลบ Alarm Events สำเร็จ ${deletedCount.toLocaleString('th-TH')} รายการ`
          : 'ไม่พบ Alarm Events ที่ตรงกับตัวกรองสำหรับลบ'
      )
      await loadData()
    } catch (error) {
      console.error('Clear alarm events error:', error)
      setPageError(error.message || 'ลบ Alarm Events ไม่สำเร็จ')
    } finally {
      setClearingAlarms(false)
    }
  }

  function handleExportAlarmEvents() {
    if (filteredAlarms.length === 0) return

    const selectedDevice = devices.find(
      (device) => String(device.id) === String(eventDeviceFilter)
    )
    const selectedMetric = eventMetricOptions.find(
      (metric) => metric.key === eventMetricFilter
    )
    const columns = [
      { key: 'device', label: 'Device' },
      { key: 'metric', label: 'Metric' },
      { key: 'condition', label: 'Condition' },
      { key: 'value', label: 'Value' },
      { key: 'severity', label: 'Severity' },
      { key: 'status', label: 'Status' },
      { key: 'triggered', label: 'Triggered' },
    ]
    const rows = filteredAlarms.map((alarm) => {
      const metricInfo = getMetricInfo(alarm.device_id, alarm.metric)
      return {
        device: alarm.device_name || alarm.device_code || 'Unnamed Device',
        metric: alarm.metric_name || metricInfo.name,
        condition: `${alarm.operator || ''} ${formatValue(alarm.threshold, metricInfo.unit)}`.trim(),
        value: formatValue(alarm.value, metricInfo.unit),
        severity: getSeverityLabel(alarm.severity),
        status: getStatusLabel(alarm.status),
        triggered: formatDate(alarm.triggered_at),
      }
    })
    const metadata = [
      ['Device', selectedDevice?.name || 'All Devices'],
      ['Metric', selectedMetric?.name || 'All Metrics'],
      ['Start Date', eventStartDate || '--'],
      ['End Date', eventEndDate || '--'],
      ['Records', filteredAlarms.length],
    ]
    const fileName = `dotWatch-alarm-events-${eventStartDate || 'all'}-to-${eventEndDate || 'all'}`

    downloadCsv({ fileName, columns, rows, metadata })
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
        notification_message: rule.notification_message || '',
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

  const displayedRules = useMemo(() => {
    return [...rules].sort((a, b) => {
      return (
        getTimestamp(b, ['created_at', 'updated_at']) -
        getTimestamp(a, ['created_at', 'updated_at'])
      )
    })
  }, [rules])

  const eventMetricOptions = useMemo(() => {
    const options = new Map()

    alarms.forEach((alarm) => {
      if (
        eventDeviceFilter !== 'all' &&
        String(alarm.device_id) !== String(eventDeviceFilter)
      ) {
        return
      }

      const metricKey = alarm.metric || alarm.metric_key
      if (!metricKey) return
      const metricInfo = getMetricInfo(alarm.device_id, metricKey)
      options.set(metricKey, {
        key: metricKey,
        name: alarm.metric_name || metricInfo.name,
        unit: metricInfo.unit,
      })
    })

    return Array.from(options.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    )
  }, [alarms, eventDeviceFilter, deviceMetrics])

  const filteredAlarms = useMemo(() => {
    return alarms
      .filter((alarm) => {
        const matchDevice =
          eventDeviceFilter === 'all' ||
          String(alarm.device_id) === String(eventDeviceFilter)
        const metricKey = alarm.metric || alarm.metric_key
        const matchMetric =
          eventMetricFilter === 'all' || metricKey === eventMetricFilter
        const matchDate = isDateInRange(
          alarm.triggered_at || alarm.time || alarm.created_at,
          eventStartDate,
          eventEndDate
        )

        return matchDevice && matchMetric && matchDate
      })
      .sort((a, b) => {
        const difference =
          getTimestamp(a, ['triggered_at', 'time', 'created_at']) -
          getTimestamp(b, ['triggered_at', 'time', 'created_at'])
        return alarmSortOrder === 'asc' ? difference : -difference
      })
  }, [
    alarms,
    eventDeviceFilter,
    eventMetricFilter,
    eventStartDate,
    eventEndDate,
    alarmSortOrder,
  ])


  const totalAlarmPages = Math.max(
    1,
    Math.ceil(filteredAlarms.length / alarmPageSize)
  )
  const safeAlarmPage = Math.min(alarmPage, totalAlarmPages)
  const paginatedAlarms = filteredAlarms.slice(
    (safeAlarmPage - 1) * alarmPageSize,
    safeAlarmPage * alarmPageSize
  )

  useEffect(() => {
    setAlarmPage(1)
  }, [
    eventDeviceFilter,
    eventMetricFilter,
    eventStartDate,
    eventEndDate,
    alarmPageSize,
    alarmSortOrder,
  ])

  useEffect(() => {
    if (
      eventMetricFilter !== 'all' &&
      !eventMetricOptions.some((metric) => metric.key === eventMetricFilter)
    ) {
      setEventMetricFilter('all')
    }
  }, [eventMetricFilter, eventMetricOptions])

  useEffect(() => {
    if (alarmPage > totalAlarmPages) setAlarmPage(totalAlarmPages)
  }, [alarmPage, totalAlarmPages])

  return (
    <div className="page app-page alarms-page">
      <PageHeader
        eyebrow="Alarm Center"
        title="Alarms"
        description="ติดตาม Alarm Events และ Alarm Rules ของอุปกรณ์ทั้งหมด"
        actions={
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={loadData}
              disabled={loading || saving}
            >
              <RefreshCw size={17} />
              Refresh
            </button>
          </>
        }
      />

      <section className="alarms-stat-grid dashboard-style-stat-grid">
        <StatCard
          label="Total Alarms"
          value={summary.total}
          hint="จำนวน Alarm ทั้งหมด"
        />
        <StatCard
          label="Active"
          value={summary.active}
          hint="Alarm ที่ยังไม่ถูก Acknowledge"
          tone={summary.active > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Critical"
          value={summary.critical}
          hint="Alarm ที่มีความสำคัญสูง"
          tone={summary.critical > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Warning"
          value={summary.warning}
          hint="Alarm ที่มีระดับ Warning"
          tone={summary.warning > 0 ? 'warning' : 'default'}
        />
      </section>

      <section className="app-card alarm-data-section">
        <div className="app-section-title alarm-section-heading">
          <div>
            <h2>Alarm Rules</h2>
            <p>Rule ทั้งหมดที่ตั้งไว้ในหน้า Device</p>
          </div>
        </div>


        {displayedRules.length === 0 ? (
          <div className="app-empty-state">
            <AlertTriangle size={30} />
            <h3>ไม่พบ Alarm Rule</h3>
            <p>ไปที่หน้า Device เพื่อตั้ง Alarm Rule</p>
          </div>
        ) : (
          <>
            <div className="history-table-wrap alarm-table-wrap alarm-rules-table-wrap">
              <table className="history-table alarm-table alarm-history-table alarm-rules-history-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Metric</th>
                    <th>Condition</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>

                <tbody>
                  {displayedRules.map((rule) => {
                    const metricInfo = getMetricInfo(
                      rule.device_id,
                      rule.metric
                    )

                    return (
                      <tr key={rule.id}>
                        <td>
                          <strong>{rule.device_name || 'Unnamed Device'}</strong>
                        </td>

                        <td>
                          <strong>{rule.metric_name || metricInfo.name}</strong>
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
                              rule.is_active
                                ? 'status online'
                                : 'status offline'
                            }
                            disabled={saving}
                            onClick={() => handleToggleRule(rule)}
                          >
                            {rule.is_active ? 'Active' : 'Disabled'}
                          </button>
                        </td>

                        <td>{formatDate(rule.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="app-card history-filter-card alarm-standalone-filter-card">
        <div className="history-section-title">
          <div>
            <h2>Filter</h2>
            <p>เลือก Device, ช่วงวันที่ และ Metric ที่ต้องการตรวจสอบ</p>
          </div>
        </div>

        <div className="history-filter-grid alarm-history-filter-grid">
          <label>
            <span>Device</span>
            <select
              value={eventDeviceFilter}
              onChange={(event) => {
                setEventDeviceFilter(event.target.value)
                setEventMetricFilter('all')
              }}
              aria-label="กรอง Alarm Events ตาม Device"
            >
              <option value="all">All Devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name || device.device_code || `Device ${device.id}`}
                </option>
              ))}
            </select>
          </label>

          <div className="history-filter-field">
            <label htmlFor="alarm-start-date-input">Start Date</label>
            <div className="history-date-picker">
              <input
                id="alarm-start-date-input"
                ref={eventStartDateInputRef}
                type="date"
                value={eventStartDate}
                max={eventEndDate || undefined}
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setEventStartDate(nextStartDate)
                  if (eventEndDate && nextStartDate > eventEndDate) {
                    setEventEndDate(nextStartDate)
                  }
                }}
                aria-label="วันที่เริ่มต้น Alarm Events"
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(eventStartDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันเริ่มต้น Alarm Events"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="history-filter-field">
            <label htmlFor="alarm-end-date-input">End Date</label>
            <div className="history-date-picker">
              <input
                id="alarm-end-date-input"
                ref={eventEndDateInputRef}
                type="date"
                value={eventEndDate}
                min={eventStartDate || undefined}
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setEventEndDate(nextEndDate)
                  if (eventStartDate && nextEndDate < eventStartDate) {
                    setEventStartDate(nextEndDate)
                  }
                }}
                aria-label="วันที่สิ้นสุด Alarm Events"
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(eventEndDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันสิ้นสุด Alarm Events"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <label>
            <span>Metric</span>
            <select
              value={eventMetricFilter}
              onChange={(event) => setEventMetricFilter(event.target.value)}
              aria-label="กรอง Alarm Events ตาม Metric"
            >
              <option value="all">All Metrics</option>
              {eventMetricOptions.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.name}{metric.unit ? ` (${metric.unit})` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="history-filter-actions alarm-history-filter-actions">
            <button
              type="button"
              className="history-export-btn"
              onClick={handleExportAlarmEvents}
              disabled={filteredAlarms.length === 0}
            >
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>

            <button
              type="button"
              className="history-clear-btn"
              onClick={openClearAlarmDialog}
              disabled={
                loading ||
                saving ||
                clearingAlarms ||
                filteredAlarms.length === 0
              }
            >
              <Trash2 size={16} aria-hidden="true" />
              Clear Alarm
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <NoticeBanner
          type="success"
          title="Alarm Events updated"
          message={notice}
          onDismiss={() => setNotice('')}
        />
      )}
      {pageError && (
        <NoticeBanner
          type="error"
          title="Unable to clear Alarm Events"
          message={pageError}
          onDismiss={() => setPageError('')}
        />
      )}

      <section className="app-card alarm-data-section">
        <div className="app-section-title alarm-section-heading">
          <div>
            <h2>Alarm Events</h2>
            <p>รายการแจ้งเตือนล่าสุดจาก Dynamic Metrics</p>
          </div>

          <TableViewControls
            page={safeAlarmPage}
            pageSize={alarmPageSize}
            sortOrder={alarmSortOrder}
            total={filteredAlarms.length}
            onPageSizeChange={setAlarmPageSize}
            onSortOrderChange={setAlarmSortOrder}
            pageSizes={EVENT_PAGE_SIZES}
          />
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
          <>
            <div className="history-table-wrap alarm-table-wrap alarm-events-table-wrap">
              <table className="history-table alarm-table alarm-history-table alarm-events-history-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Metric</th>
                    <th>Condition</th>
                    <th>Value</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Triggered</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedAlarms.map((alarm) => {
                    const metricInfo = getMetricInfo(
                      alarm.device_id,
                      alarm.metric
                    )

                    return (
                      <tr key={alarm.id}>
                        <td>
                          <strong>{alarm.device_name || 'Unnamed Device'}</strong>
                        </td>

                        <td>
                          <strong>{alarm.metric_name || metricInfo.name}</strong>
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

            <TablePagination
              page={safeAlarmPage}
              pageSize={alarmPageSize}
              total={filteredAlarms.length}
              onPageChange={setAlarmPage}
            />
          </>
        )}
      </section>

      <ClearFilteredDataDialog
        open={clearDialogOpen}
        idPrefix="alarm-events-clear"
        title="ยืนยันการ Clear Alarm"
        description="Alarm Events ที่ตรงกับตัวกรองจะถูกลบออกจากฐานข้อมูลจริง และไม่สามารถกู้คืนจากหน้า Dashboard ได้"
        summaryItems={[
          {
            label: 'Device',
            value:
              eventDeviceFilter === 'all'
                ? 'All Devices'
                : devices.find(
                    (device) =>
                      String(device.id) === String(eventDeviceFilter)
                  )?.name || `Device ${eventDeviceFilter}`,
          },
          { label: 'Start Date', value: formatDateOnly(eventStartDate) },
          { label: 'End Date', value: formatDateOnly(eventEndDate) },
          {
            label: 'Metric',
            value:
              eventMetricFilter === 'all'
                ? 'All Metrics'
                : eventMetricOptions.find(
                    (metric) => metric.key === eventMetricFilter
                  )?.name || eventMetricFilter,
          },
          {
            label: 'Records',
            value: `${filteredAlarms.length.toLocaleString('th-TH')} rows`,
          },
        ]}
        confirmText="ฉันตรวจสอบ Device, ช่วงวันที่ และ Metric แล้ว และยืนยันว่าต้องการลบ Alarm Events ชุดนี้จริง"
        confirmLabel="ยืนยัน Clear Alarm"
        busyLabel="กำลังลบ Alarm..."
        busy={clearingAlarms}
        onClose={closeClearAlarmDialog}
        onConfirm={handleClearAlarms}
      />
    </div>
  )
}

export default Alarms
