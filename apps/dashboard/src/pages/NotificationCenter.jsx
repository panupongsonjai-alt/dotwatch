import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CheckCheck,
  Download,
  RefreshCcw,
  Trash2,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import {
  ClearFilteredDataDialog,
  EmptyState,
  FilterActionsMenu,
  NoticeBanner,
  PageHeader,
  StatCard,
  UnifiedSelect,
} from '../components/common'
import {
  clearNotificationFeed,
  getAlarms,
  getDeviceMetrics,
  getDevices,
  getNotificationFeedDeletions,
} from '../services/api'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'
import {
  downloadCsv,
  getLocalDateInputValue,
  isDateInRange,
} from '../utils/tableExport'

import { showSuccessToast } from '../utils/uiFeedback'
import {
  formatMetricValue,
  getMetricDecimalPlaces,
} from '../utils/metricDisplayConfig'

const READ_STORAGE_KEY = 'dotwatchReadNotifications'

const TABLE_PAGE_SIZES = [10, 20, 50, 100]

function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

function getRelativeTime(value) {
  if (!value) return '--'

  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return formatDate(value)

  const diffSeconds = Math.max(0, Math.floor((Date.now() - time) / 1000))

  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`

  return `${Math.floor(diffSeconds / 86400)}d ago`
}

function getPageRange(page, pageSize, total) {
  if (total === 0) return { start: 0, end: 0 }

  const start = (page - 1) * pageSize + 1
  return { start, end: Math.min(total, start + pageSize - 1) }
}

function readStoredIds() {
  try {
    const value = localStorage.getItem(READ_STORAGE_KEY)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function storeReadIds(ids) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...ids]))
}

function getAlarmTitle(alarm) {
  const metric = alarm.metric_name || alarm.metric || 'Metric'
  const device = alarm.device_name || alarm.device_code || 'Unknown Device'

  if (alarm.status === 'acknowledged') {
    return `Alarm acknowledged: ${metric}`
  }

  return `${alarm.severity === 'critical' ? 'Critical' : 'Warning'} alarm: ${metric}`
    .replace(/^./, (char) => char.toUpperCase())
    .concat(` on ${device}`)
}

function buildAlarmNotification(alarm, metricInfo = {}) {
  const id = `alarm-${alarm.id}-${alarm.status || 'active'}`
  const metric =
    alarm.metric_name || metricInfo.name || alarm.metric || 'Metric'
  const metricKey = alarm.metric || alarm.metric_key || metric
  const unit = alarm.unit || metricInfo.unit || ''
  const decimalPlaces = getMetricDecimalPlaces(
    { decimal_places: alarm.decimal_places ?? metricInfo.decimalPlaces }
  )
  const valueText =
    alarm.value != null
      ? formatMetricValue(alarm.value, unit, decimalPlaces)
      : '--'
  const thresholdText =
    alarm.threshold != null
      ? `${alarm.operator || ''} ${formatMetricValue(alarm.threshold, unit, decimalPlaces)}`
      : '--'
  const notificationMessage = String(alarm.notification_message || '').trim()

  return {
    id,
    alarmId: alarm.id,
    alarmKey: getAlarmKey(alarm),
    deviceId: alarm.device_id || alarm.deviceId || '',
    deviceCode: alarm.device_code || '',
    metricKey,
    metricName: metric,
    unit,
    type: 'alarm',
    severity: alarm.severity || 'warning',
    status: alarm.status || 'active',
    title: getAlarmTitle({ ...alarm, metric_name: metric }),
    description:
      notificationMessage ||
      `${metric} value ${valueText} matched rule ${thresholdText}`,
    source: alarm.device_name || alarm.device_code || 'Unknown Device',
    time: alarm.triggered_at || alarm.acknowledged_at || alarm.created_at,
    icon: ShieldAlert,
  }
}

function buildDeviceNotification(device) {
  const status = device.status || 'offline'
  const id = `device-${device.id || device.device_code}-${status}`
  const isOffline = status === 'offline'

  return {
    id,
    deviceId: device.id || '',
    deviceCode: device.device_code || '',
    metricKey: 'device_status',
    metricName: 'Device Status',
    unit: '',
    type: 'device',
    severity: isOffline ? 'critical' : 'warning',
    status,
    title: isOffline ? 'Device offline' : 'Device warning',
    description: `${device.name || device.device_code || 'Unnamed Device'} is currently ${status}.`,
    source: device.device_code || 'Unknown Device',
    time: device.last_ingest_at || device.last_seen_at || device.latest_time,
    icon: isOffline ? WifiOff : Bell,
  }
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH')
}

function NotificationCenter() {
  const [alarms, setAlarms] = useState([])
  const [devices, setDevices] = useState([])
  const [deviceMetrics, setDeviceMetrics] = useState({})
  const [readIds, setReadIds] = useState(() => new Set(readStoredIds()))
  const [loading, setLoading] = useState(true)
  const today = getLocalDateInputValue()
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [metricFilter, setMetricFilter] = useState('all')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const startDateInputRef = useRef(null)
  const endDateInputRef = useRef(null)
  const [deletedNotificationIds, setDeletedNotificationIds] = useState(
    () => new Set()
  )
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearingNotifications, setClearingNotifications] = useState(false)
  const [notice, setNotice] = useState('')
  const [pageError, setPageError] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)

  async function loadData() {
    try {
      setLoading(true)
      const [alarmData, deviceData, deletionData] = await Promise.all([
        getAlarms(),
        getDevices(),
        getNotificationFeedDeletions().catch((error) => {
          console.error('Load notification deletions error:', error)
          return { keys: [] }
        }),
      ])

      const nextAlarms = Array.isArray(alarmData) ? alarmData : []
      const nextDevices = Array.isArray(deviceData) ? deviceData : []
      const deletedKeys = Array.isArray(deletionData?.keys)
        ? deletionData.keys
        : []
      setAlarms(nextAlarms)
      setDevices(nextDevices)
      setDeletedNotificationIds(new Set(deletedKeys.map(String)))

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
            console.error(
              `Load notification metrics error device ${device.id}:`,
              error
            )
            return [device.id, []]
          }
        })
      )
      setDeviceMetrics(Object.fromEntries(metricEntries))
    } catch (error) {
      console.error('Load notifications error:', error)
      setAlarms([])
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  function getMetricInfo(deviceId, metricKey) {
    const metrics = deviceMetrics[deviceId] || []
    const metric = metrics.find((item) => item.metric_key === metricKey)
    return {
      name: metric?.metric_name || metricKey || '--',
      unit: metric?.unit || '',
      decimalPlaces: getMetricDecimalPlaces(metric),
    }
  }

  function handleExportNotifications() {
    if (filteredNotifications.length === 0) return

    const selectedDevice = devices.find(
      (device) => String(device.id) === String(deviceFilter)
    )
    const selectedMetric = notificationMetricOptions.find(
      (metric) => metric.key === metricFilter
    )
    const columns = [
      { key: 'notification', label: 'Notification' },
      { key: 'device', label: 'Device' },
      { key: 'metric', label: 'Metric' },
      { key: 'type', label: 'Type' },
      { key: 'severity', label: 'Severity' },
      { key: 'readStatus', label: 'Read Status' },
      { key: 'triggered', label: 'Triggered' },
    ]
    const rows = filteredNotifications.map((item) => ({
      notification: `${item.title} — ${item.description}`,
      device: item.source,
      metric: item.metricName || item.metricKey || '--',
      type: item.type === 'alarm' ? 'Alarm' : 'Device',
      severity: item.severity === 'critical' ? 'Critical' : 'Warning',
      readStatus: readIds.has(item.id) ? 'Read' : 'Unread',
      triggered: formatDate(item.time),
    }))
    const metadata = [
      ['Device', selectedDevice?.name || 'All Devices'],
      ['Metric', selectedMetric?.name || 'All Metrics'],
      ['Start Date', startDate || '--'],
      ['End Date', endDate || '--'],
      ['Records', filteredNotifications.length],
    ]
    const fileName = `dotWatch-notifications-${startDate || 'all'}-to-${endDate || 'all'}`

    downloadCsv({ fileName, columns, rows, metadata })
    showSuccessToast('ส่งออก Notification Feed เป็น CSV สำเร็จ')
  }

  function openClearNotificationDialog() {
    if (filteredNotifications.length === 0 || clearingNotifications) return
    setClearDialogOpen(true)
  }

  function closeClearNotificationDialog() {
    if (clearingNotifications) return
    setClearDialogOpen(false)
  }

  async function handleClearNotifications() {
    if (filteredNotifications.length === 0 || clearingNotifications) return

    const keys = filteredNotifications.map((item) => item.id)

    try {
      setClearingNotifications(true)
      setNotice('')
      setPageError('')

      const result = await clearNotificationFeed(keys)
      const deletedKeys = Array.isArray(result?.keys) ? result.keys : keys
      const deletedCount = Number(
        result?.deletedCount ?? result?.deleted_count ?? deletedKeys.length
      )

      setDeletedNotificationIds((previous) => {
        const next = new Set(previous)
        deletedKeys.forEach((key) => next.add(String(key)))
        return next
      })
      setClearDialogOpen(false)
      setPage(1)
      const clearMessage =
        deletedCount > 0
          ? `ลบ Notification Feed สำเร็จ ${deletedCount.toLocaleString('th-TH')} รายการ`
          : 'ไม่พบ Notification ที่ตรงกับตัวกรองสำหรับลบ'
      setNotice(clearMessage)
      showSuccessToast(clearMessage)
    } catch (error) {
      console.error('Clear notification feed error:', error)
      setPageError(error.message || 'ลบ Notification Feed ไม่สำเร็จ')
    } finally {
      setClearingNotifications(false)
    }
  }

  function markAsRead(id) {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      storeReadIds(next)
      return next
    })
  }

  function markAllAsRead() {
    setReadIds((prev) => {
      const next = new Set(prev)
      notifications.forEach((item) => next.add(item.id))
      storeReadIds(next)
      return next
    })
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

          setDevices((prev) => {
            const exists = prev.some((device) =>
              isSameRealtimeDevice(device, reading)
            )

            if (!exists && reading.id) {
              return [reading, ...prev]
            }

            return prev.map((device) =>
              isSameRealtimeDevice(device, reading)
                ? { ...device, ...reading, id: device.id }
                : device
            )
          })
        }

        if (payload.type === 'device:delete') {
          const deletedDevice = payload.data || payload.device
          if (!deletedDevice) return

          setDevices((prev) =>
            prev.filter(
              (device) => !isSameRealtimeDevice(device, deletedDevice)
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

  const notifications = useMemo(() => {
    const alarmNotifications = alarms.map((alarm) =>
      buildAlarmNotification(
        alarm,
        getMetricInfo(alarm.device_id, alarm.metric || alarm.metric_key)
      )
    )
    const deviceAlerts = devices
      .filter((device) => ['offline', 'warning'].includes(device.status))
      .map(buildDeviceNotification)

    return [...alarmNotifications, ...deviceAlerts].filter(
      (item) => !deletedNotificationIds.has(String(item.id))
    )
  }, [alarms, devices, deviceMetrics, deletedNotificationIds])

  const notificationMetricOptions = useMemo(() => {
    const options = new Map()

    notifications.forEach((item) => {
      if (
        deviceFilter !== 'all' &&
        String(item.deviceId) !== String(deviceFilter)
      ) {
        return
      }

      if (!item.metricKey) return
      options.set(item.metricKey, {
        key: item.metricKey,
        name: item.metricName || item.metricKey,
        unit: item.unit || '',
      })
    })

    return Array.from(options.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    )
  }, [notifications, deviceFilter])

  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((item) => {
        const matchesDevice =
          deviceFilter === 'all' ||
          String(item.deviceId) === String(deviceFilter)
        const matchesMetric =
          metricFilter === 'all' || item.metricKey === metricFilter
        const matchesDate = isDateInRange(item.time, startDate, endDate)
        return matchesDevice && matchesMetric && matchesDate
      })
      .sort((a, b) => {
        const aTime = new Date(a.time || 0).getTime() || 0
        const bTime = new Date(b.time || 0).getTime() || 0
        return sortOrder === 'asc' ? aTime - bTime : bTime - aTime
      })
  }, [notifications, deviceFilter, metricFilter, startDate, endDate, sortOrder])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredNotifications.length / pageSize)
  )
  const safePage = Math.min(page, totalPages)
  const paginatedNotifications = filteredNotifications.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )
  const range = getPageRange(safePage, pageSize, filteredNotifications.length)

  useEffect(() => {
    setPage(1)
  }, [deviceFilter, metricFilter, startDate, endDate, pageSize, sortOrder])

  useEffect(() => {
    if (
      metricFilter !== 'all' &&
      !notificationMetricOptions.some((metric) => metric.key === metricFilter)
    ) {
      setMetricFilter('all')
    }
  }, [metricFilter, notificationMetricOptions])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const unreadCount = notifications.filter(
    (item) => !readIds.has(item.id)
  ).length
  const criticalCount = notifications.filter(
    (item) => item.severity === 'critical'
  ).length
  const deviceCount = notifications.filter(
    (item) => item.type === 'device'
  ).length
  const alarmCount = notifications.filter(
    (item) => item.type === 'alarm'
  ).length

  return (
    <div className="page app-page notifications-page">
      <PageHeader
        eyebrow="Notification Center"
        title="Notifications"
        description="รวมเหตุการณ์สำคัญของระบบ เช่น Alarm, Device Offline และ Warning เพื่อให้ติดตามได้ในหน้าเดียว"
        actions={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={loadData}
            >
              <RefreshCcw size={16} />
              Refresh
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={markAllAsRead}
              disabled={notifications.length === 0 || unreadCount === 0}
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          </>
        }
      />

      <section className="notifications-stat-grid">
        <StatCard
          label="Unread"
          value={loading ? '...' : unreadCount}
          hint="ความแจ้งเตือนที่ยังไม่ได้อ่าน"
          tone={unreadCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Critical"
          value={loading ? '...' : criticalCount}
          hint="ความแจ้งเตือนที่มีความสำคัญสูง"
          tone={criticalCount > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Alarm Events"
          value={loading ? '...' : alarmCount}
          hint="จำนวนเหตุการณ์ Alarm ที่เกิดขึ้น"
        />
        <StatCard
          label="Device Alerts"
          value={loading ? '...' : deviceCount}
          hint="จำนวนการแจ้งเตือนอุปกรณ์"
        />
      </section>

      <section className="app-card history-filter-card notification-standalone-filter-card">
        <div className="history-section-title">
          <div>
            <h2>Filter</h2>
            <p>เลือก Device, ช่วงวันที่ และ Metric ที่ต้องการตรวจสอบ</p>
          </div>
          <FilterActionsMenu
            label="Notification filter actions"
            items={[
              { key: 'csv', label: 'Export CSV', icon: Download, disabled: filteredNotifications.length === 0, onSelect: handleExportNotifications },
              { key: 'clear', label: 'Clear Data', icon: Trash2, tone: 'danger', disabled: loading || clearingNotifications || filteredNotifications.length === 0, onSelect: openClearNotificationDialog },
            ]}
          />
        </div>

        <div className="history-filter-grid notification-history-filter-grid">
          <label>
            <span>Device</span>
            <UnifiedSelect
              value={deviceFilter}
              onChange={(event) => {
                setDeviceFilter(event.target.value)
                setMetricFilter('all')
              }}
              aria-label="กรอง Notification ตาม Device"
            >
              <option value="all">All Devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name || device.device_code || `Device ${device.id}`}
                </option>
              ))}
            </UnifiedSelect>
          </label>

          <div className="history-filter-field">
            <label htmlFor="notification-start-date-input">Start Date</label>
            <div className="history-date-picker">
              <input
                id="notification-start-date-input"
                ref={startDateInputRef}
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setStartDate(nextStartDate)
                  if (endDate && nextStartDate > endDate) {
                    setEndDate(nextStartDate)
                  }
                }}
                aria-label="วันที่เริ่มต้น Notification"
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(startDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันเริ่มต้น Notification"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="history-filter-field">
            <label htmlFor="notification-end-date-input">End Date</label>
            <div className="history-date-picker">
              <input
                id="notification-end-date-input"
                ref={endDateInputRef}
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setEndDate(nextEndDate)
                  if (startDate && nextEndDate < startDate) {
                    setStartDate(nextEndDate)
                  }
                }}
                aria-label="วันที่สิ้นสุด Notification"
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(endDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันสิ้นสุด Notification"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <label>
            <span>Metric</span>
            <UnifiedSelect
              value={metricFilter}
              onChange={(event) => setMetricFilter(event.target.value)}
              aria-label="กรอง Notification ตาม Metric"
            >
              <option value="all">All Metrics</option>
              {notificationMetricOptions.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.name}
                  {metric.unit ? ` (${metric.unit})` : ''}
                </option>
              ))}
            </UnifiedSelect>
          </label>

          <div className="history-filter-actions notification-history-filter-actions">
            <button
              type="button"
              className="history-export-btn"
              onClick={handleExportNotifications}
              disabled={filteredNotifications.length === 0}
            >
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>

            <button
              type="button"
              className="history-clear-btn"
              onClick={openClearNotificationDialog}
              disabled={
                loading ||
                clearingNotifications ||
                filteredNotifications.length === 0
              }
            >
              <Trash2 size={16} aria-hidden="true" />
              Clear Noti
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <NoticeBanner
          type="success"
          title="Notification Feed updated"
          message={notice}
          onDismiss={() => setNotice('')}
        />
      )}
      {pageError && (
        <NoticeBanner
          type="error"
          title="Unable to clear Notification Feed"
          message={pageError}
          onDismiss={() => setPageError('')}
        />
      )}

      <section className="app-card notifications-panel">
        <div className="app-section-title notification-section-heading">
          <div>
            <h2>Notification Feed</h2>
            <p>รายการแจ้งเตือนตามตัวกรองและลำดับเวลาที่เลือก</p>
          </div>

          <div className="notification-table-actions">
            <span>
              {range.start}-{range.end} / {filteredNotifications.length} rows
            </span>

            <label>
              <span>Show</span>
              <UnifiedSelect
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                aria-label="จำนวนแถว Notification ต่อหน้า"
              >
                {TABLE_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </UnifiedSelect>
            </label>

            <label>
              <span>Sort</span>
              <UnifiedSelect
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                aria-label="ลำดับ Notification"
              >
                <option value="desc">ล่าสุดก่อน</option>
                <option value="asc">เก่าสุดก่อน</option>
              </UnifiedSelect>
            </label>
          </div>
        </div>

        {loading ? (
          <EmptyState
            title="Loading notifications"
            description="กำลังดึงข้อมูล Notification ล่าสุดจากระบบ"
          />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="ยังไม่มี Notification ตามเงื่อนไขที่เลือก"
          />
        ) : (
          <>
            <div className="history-table-wrap notification-table-wrap">
              <table className="history-table notification-history-table">
                <thead>
                  <tr>
                    <th>Notification</th>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Read Status</th>
                    <th>Triggered</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedNotifications.map((item) => {
                    const isUnread = !readIds.has(item.id)

                    return (
                      <tr key={item.id} className={isUnread ? 'unread' : ''}>
                        <td className="notification-message-cell">
                          <strong>{item.title}</strong>
                          <span>{item.description}</span>
                        </td>
                        <td>{item.source}</td>
                        <td>
                          <span className={`notification-type ${item.type}`}>
                            {item.type === 'alarm' ? 'Alarm' : 'Device'}
                          </span>
                        </td>
                        <td>
                          <span className={`status ${item.severity}`}>
                            {item.severity === 'critical'
                              ? 'Critical'
                              : 'Warning'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`notification-read-status ${
                              isUnread ? 'unread' : 'read'
                            }`}
                          >
                            {isUnread ? 'New' : 'Read'}
                          </span>
                        </td>
                        <td>
                          <strong>{formatDate(item.time)}</strong>
                          <span>{getRelativeTime(item.time)}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button notification-mark-button"
                            disabled={!isUnread}
                            onClick={() => markAsRead(item.id)}
                          >
                            {isUnread ? 'Mark read' : 'Read'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredNotifications.length > pageSize && (
              <div className="notification-table-pagination">
                <div>
                  Showing {range.start}-{range.end} of{' '}
                  {filteredNotifications.length}
                </div>

                <div className="notification-pagination-actions">
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={safePage <= 1}
                  >
                    First
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={safePage >= totalPages}
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <ClearFilteredDataDialog
        open={clearDialogOpen}
        idPrefix="notification-feed-clear"
        title="ยืนยันการ Clear Noti"
        description="Notification Feed ที่ตรงกับตัวกรองจะถูกลบออกจากรายการอย่างถาวรสำหรับบัญชีนี้ และไม่กลับมาเมื่อ Refresh หน้า"
        summaryItems={[
          {
            label: 'Device',
            value:
              deviceFilter === 'all'
                ? 'All Devices'
                : devices.find(
                    (device) => String(device.id) === String(deviceFilter)
                  )?.name || `Device ${deviceFilter}`,
          },
          { label: 'Start Date', value: formatDateOnly(startDate) },
          { label: 'End Date', value: formatDateOnly(endDate) },
          {
            label: 'Metric',
            value:
              metricFilter === 'all'
                ? 'All Metrics'
                : notificationMetricOptions.find(
                    (metric) => metric.key === metricFilter
                  )?.name || metricFilter,
          },
          {
            label: 'Records',
            value: `${filteredNotifications.length.toLocaleString('th-TH')} rows`,
          },
        ]}
        confirmationKeyword="Delete"
        confirmationHelp="ตรวจสอบ Device, ช่วงวันที่ และ Metric ให้ถูกต้องก่อนยืนยัน"
        confirmLabel="Delete Notifications"
        busyLabel="กำลังลบ Notification..."
        busy={clearingNotifications}
        onClose={closeClearNotificationDialog}
        onConfirm={handleClearNotifications}
      />
    </div>
  )
}

export default NotificationCenter
