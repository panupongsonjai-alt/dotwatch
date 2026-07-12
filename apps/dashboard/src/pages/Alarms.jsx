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
  Download,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { PageHeader, StatCard } from '../components/common'
import { confirmDeleteAction } from '../utils/typedConfirm'
import {
  downloadCsv,
  getLocalDateInputValue,
  isDateInRange,
  openPrintableTable,
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
  const [eventExportFormat, setEventExportFormat] = useState('pdf')
  const [alarmPageSize, setAlarmPageSize] = useState(20)
  const [alarmSortOrder, setAlarmSortOrder] = useState('desc')
  const [alarmPage, setAlarmPage] = useState(1)
  const [ruleSearch, setRuleSearch] = useState('')
  const [ruleStatusFilter, setRuleStatusFilter] = useState('all')
  const [ruleSeverityFilter, setRuleSeverityFilter] = useState('all')
  const [rulePageSize, setRulePageSize] = useState(20)
  const [ruleSortOrder, setRuleSortOrder] = useState('desc')
  const [rulePage, setRulePage] = useState(1)

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

  function handleClearAlarms() {
    if (filteredAlarms.length === 0) return

    const ok = window.confirm(
      `ต้องการ Clear Alarm Events ตามตัวกรองจำนวน ${filteredAlarms.length} รายการใช่ไหม?\n\nรายการจะถูกซ่อนจากหน้า Alarm Center จนกว่าจะกด Refresh หรือมีข้อมูลใหม่จาก Realtime`
    )

    if (!ok) return

    const filteredKeys = new Set(filteredAlarms.map(getAlarmKey))
    setAlarms((prev) =>
      prev.filter((alarm) => !filteredKeys.has(getAlarmKey(alarm)))
    )
    setAlarmPage(1)
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

    if (eventExportFormat === 'csv') {
      downloadCsv({ fileName, columns, rows, metadata })
      return
    }

    openPrintableTable({
      title: 'dotWatch Alarm Events',
      subtitle: 'Alarm events filtered by device, metric and date range',
      fileName,
      columns,
      rows,
      metadata,
    })
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

  const filteredRules = useMemo(() => {
    const keyword = ruleSearch.trim().toLowerCase()

    return rules
      .filter((rule) => {
        const metricInfo = getMetricInfo(rule.device_id, rule.metric)
        const text = [
          rule.device_name,
          rule.device_code,
          rule.metric,
          rule.metric_name,
          metricInfo.name,
          rule.severity,
          rule.is_active ? 'active' : 'disabled',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        const matchSearch = !keyword || text.includes(keyword)
        const matchStatus =
          ruleStatusFilter === 'all' ||
          (ruleStatusFilter === 'active' && rule.is_active) ||
          (ruleStatusFilter === 'disabled' && !rule.is_active)
        const matchSeverity =
          ruleSeverityFilter === 'all' || rule.severity === ruleSeverityFilter

        return matchSearch && matchStatus && matchSeverity
      })
      .sort((a, b) => {
        const difference =
          getTimestamp(a, ['created_at', 'updated_at']) -
          getTimestamp(b, ['created_at', 'updated_at'])
        return ruleSortOrder === 'asc' ? difference : -difference
      })
  }, [
    rules,
    ruleSearch,
    ruleStatusFilter,
    ruleSeverityFilter,
    ruleSortOrder,
    deviceMetrics,
  ])

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


  const totalRulePages = Math.max(
    1,
    Math.ceil(filteredRules.length / rulePageSize)
  )
  const safeRulePage = Math.min(rulePage, totalRulePages)
  const paginatedRules = filteredRules.slice(
    (safeRulePage - 1) * rulePageSize,
    safeRulePage * rulePageSize
  )

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
    setRulePage(1)
  }, [ruleSearch, ruleStatusFilter, ruleSeverityFilter, rulePageSize, ruleSortOrder])

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
    if (rulePage > totalRulePages) setRulePage(totalRulePages)
  }, [rulePage, totalRulePages])

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

          <TableViewControls
            page={safeRulePage}
            pageSize={rulePageSize}
            sortOrder={ruleSortOrder}
            total={filteredRules.length}
            onPageSizeChange={setRulePageSize}
            onSortOrderChange={setRuleSortOrder}
          />
        </div>

        <div className="alarm-toolbar alarm-rules-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              value={ruleSearch}
              onChange={(event) => setRuleSearch(event.target.value)}
              placeholder="Search device, metric, severity..."
              aria-label="ค้นหา Alarm Rules"
            />
          </label>

          <select
            value={ruleStatusFilter}
            onChange={(event) => setRuleStatusFilter(event.target.value)}
            aria-label="กรองสถานะ Alarm Rule"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>

          <select
            value={ruleSeverityFilter}
            onChange={(event) => setRuleSeverityFilter(event.target.value)}
            aria-label="กรองระดับ Alarm Rule"
          >
            <option value="all">All Severity</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {filteredRules.length === 0 ? (
          <div className="app-empty-state">
            <AlertTriangle size={30} />
            <h3>ไม่พบ Alarm Rule</h3>
            <p>ลองเปลี่ยนตัวกรอง หรือไปที่หน้า Device เพื่อตั้ง Rule</p>
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
                  {paginatedRules.map((rule) => {
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

            <TablePagination
              page={safeRulePage}
              pageSize={rulePageSize}
              total={filteredRules.length}
              onPageChange={setRulePage}
            />
          </>
        )}
      </section>

      <section className="app-card alarm-filter-card alarm-export-filter-card alarm-standalone-filter-card">
        <div className="alarm-filter-heading">
            <h2>Filter</h2>
            <p>เลือก Device, ช่วงวันที่, Metric และรูปแบบไฟล์ที่ต้องการ</p>
          </div>

        <div className="alarm-filter-grid alarm-event-export-filter-grid">
            <label className="alarm-filter-field">
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

            <label className="alarm-filter-field">
              <span>Start Date</span>
              <input
                type="date"
                value={eventStartDate}
                max={eventEndDate || undefined}
                onChange={(event) => setEventStartDate(event.target.value)}
                aria-label="วันที่เริ่มต้น Alarm Events"
              />
            </label>

            <label className="alarm-filter-field">
              <span>End Date</span>
              <input
                type="date"
                value={eventEndDate}
                min={eventStartDate || undefined}
                onChange={(event) => setEventEndDate(event.target.value)}
                aria-label="วันที่สิ้นสุด Alarm Events"
              />
            </label>

            <label className="alarm-filter-field">
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

            <label className="alarm-filter-field alarm-format-field">
              <span>Export</span>
              <select
                value={eventExportFormat}
                onChange={(event) => setEventExportFormat(event.target.value)}
                aria-label="รูปแบบไฟล์ Alarm Events"
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            <div className="alarm-filter-actions">
              <button
                type="button"
                className="primary-button alarm-export-button"
                onClick={handleExportAlarmEvents}
                disabled={filteredAlarms.length === 0}
              >
                <Download size={17} />
                Export
              </button>

              <button
                type="button"
                className="danger-button alarm-filter-clear-button"
                onClick={handleClearAlarms}
                disabled={loading || saving || filteredAlarms.length === 0}
              >
                <Trash2 size={17} />
                Clear Alarm
              </button>
            </div>
        </div>
      </section>

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
    </div>
  )
}

export default Alarms
