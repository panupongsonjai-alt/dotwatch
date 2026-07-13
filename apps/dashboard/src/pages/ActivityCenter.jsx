import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarDays, RefreshCw, Trash2 } from 'lucide-react'
import { auth } from '../services/firebase'
import { clearActivityLogs, getActivityLogs, getDevices } from '../services/api'
import { connectRealtime } from '../services/realtime'
import {
  ClearFilteredDataDialog,
  EmptyState,
  FilterActionsMenu,
  PageHeader,
  StatCard,
  TablePagination,
  UnifiedSelect,
} from '../components/common'
import { getLocalDateInputValue, isDateInRange } from '../utils/tableExport'
import { showSuccessToast } from '../utils/uiFeedback'
import {
  readTablePageSize,
  TABLE_PAGE_SIZE_OPTIONS,
  TABLE_PAGE_SIZE_STORAGE_KEYS,
  writeTablePageSize,
} from '../utils/tablePageSizePreference'

const ACTIVITY_TYPE_LABELS = {
  all: 'All Activity Types',
  session: 'Sign-in / Sign-out',
  navigation: 'Page Views',
  changes: 'Changes',
  device: 'Device Events',
  other: 'Other',
}

const ACTIVITY_PAGE_SIZES = TABLE_PAGE_SIZE_OPTIONS

function formatActivityDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('th-TH')
}

function formatRelativeActivityTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function formatActivityType(value) {
  const type = String(value || '').trim()
  if (!type) return 'Other'

  return type
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ')
}

function showDatePicker(inputRef) {
  const input = inputRef.current
  if (!input) return

  if (typeof input.showPicker === 'function') input.showPicker()
  else input.focus()
}

function getActivityCategory(activityType) {
  const type = String(activityType || '').toLowerCase()
  if (type.startsWith('session.')) return 'session'
  if (type.startsWith('navigation.')) return 'navigation'
  if (/^(operation|preference|profile)\./.test(type)) return 'changes'
  if (type.startsWith('device.') || type.startsWith('reading.')) return 'device'
  return 'other'
}

function normalizeActivity(item = {}) {
  return {
    ...item,
    created_at: item.created_at || item.createdAt || new Date().toISOString(),
  }
}

function dedupeActivity(items = []) {
  const seen = new Set()

  return items.filter((item) => {
    const key =
      item.id || `${item.activity_type}-${item.device_id}-${item.created_at}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function ActivityCenter() {
  const today = getLocalDateInputValue()
  const [activities, setActivities] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [activityTypeFilter, setActivityTypeFilter] = useState('all')
  const startDateInputRef = useRef(null)
  const endDateInputRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearingActivities, setClearingActivities] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [activityPageSize, setActivityPageSize] = useState(() =>
    readTablePageSize(TABLE_PAGE_SIZE_STORAGE_KEYS.activity)
  )
  const [activitySortOrder, setActivitySortOrder] = useState('desc')

  async function loadActivity({ quiet = false } = {}) {
    try {
      if (quiet) setRefreshing(true)
      else setLoading(true)

      const [activityData, deviceData] = await Promise.all([
        getActivityLogs({
          deviceId: selectedDeviceId || undefined,
          limit: 100,
        }),
        getDevices(),
      ])

      setActivities(
        (Array.isArray(activityData) ? activityData : []).filter(
          (item) => !String(item.activity_type || '').startsWith('alarm.')
        )
      )
      setDevices(Array.isArray(deviceData) ? deviceData : [])
    } catch (error) {
      console.error('Load activity error:', error)
      setActivities([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadActivity()
  }, [selectedDeviceId])

  useEffect(() => {
    let unsubscribeRealtime = null

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRealtime?.()
      unsubscribeRealtime = null

      if (!user) return

      unsubscribeRealtime = connectRealtime(user.uid, (payload) => {
        if (payload.type !== 'activity') return

        const incoming = Array.isArray(payload.data)
          ? payload.data
          : [payload.data]

        const nextItems = incoming
          .filter(Boolean)
          .map(normalizeActivity)
          .filter(
            (item) => !String(item.activity_type || '').startsWith('alarm.')
          )
          .filter((item) => {
            if (!selectedDeviceId) return true
            return String(item.device_id) === String(selectedDeviceId)
          })

        if (nextItems.length === 0) return

        setActivities((prev) =>
          dedupeActivity([...nextItems, ...prev]).slice(0, 100)
        )
      })
    })

    return () => {
      unsubscribeRealtime?.()
      unsubscribeAuth?.()
    }
  }, [selectedDeviceId])

  useEffect(() => {
    const handleRecordedActivity = (event) => {
      const item = normalizeActivity(event.detail)
      if (String(item.activity_type || '').startsWith('alarm.')) return
      if (
        selectedDeviceId &&
        String(item.device_id || '') !== String(selectedDeviceId)
      ) return

      setActivities((previous) =>
        dedupeActivity([item, ...previous]).slice(0, 100)
      )
    }

    window.addEventListener('dotwatchActivityRecorded', handleRecordedActivity)
    return () => {
      window.removeEventListener(
        'dotwatchActivityRecorded',
        handleRecordedActivity
      )
    }
  }, [selectedDeviceId])

  const summary = useMemo(() => {
    const total = activities.length
    const signIns = activities.filter(
      (item) => item.activity_type === 'session.login'
    ).length
    const changes = activities.filter((item) =>
      /^(operation|preference|profile)\./.test(String(item.activity_type || ''))
    ).length
    const pageViews = activities.filter((item) =>
      String(item.activity_type || '').startsWith('navigation.')
    ).length

    return { total, signIns, changes, pageViews }
  }, [activities])

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      const matchesDate = isDateInRange(
        item.created_at || item.createdAt,
        startDate,
        endDate
      )
      const matchesType =
        activityTypeFilter === 'all' ||
        getActivityCategory(item.activity_type) === activityTypeFilter

      return matchesDate && matchesType
    })
  }, [activities, activityTypeFilter, endDate, startDate])

  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((left, right) => {
      const leftTime = new Date(left.created_at || left.createdAt).getTime() || 0
      const rightTime = new Date(right.created_at || right.createdAt).getTime() || 0
      return activitySortOrder === 'asc' ? leftTime - rightTime : rightTime - leftTime
    })
  }, [activitySortOrder, filteredActivities])

  const activityTotalPages = Math.max(
    1,
    Math.ceil(sortedActivities.length / activityPageSize)
  )
  const safeActivityPage = Math.min(activityPage, activityTotalPages)
  const paginatedActivities = sortedActivities.slice(
    (safeActivityPage - 1) * activityPageSize,
    safeActivityPage * activityPageSize
  )

  useEffect(() => {
    setActivityPage(1)
  }, [selectedDeviceId, startDate, endDate, activityTypeFilter, activityPageSize, activitySortOrder])

  useEffect(() => {
    writeTablePageSize(TABLE_PAGE_SIZE_STORAGE_KEYS.activity, activityPageSize)
  }, [activityPageSize])

  useEffect(() => {
    if (activityPage > activityTotalPages) setActivityPage(activityTotalPages)
  }, [activityPage, activityTotalPages])

  function openClearActivityDialog() {
    if (filteredActivities.length === 0 || clearingActivities) return
    setClearDialogOpen(true)
  }

  function closeClearActivityDialog() {
    if (clearingActivities) return
    setClearDialogOpen(false)
  }

  async function handleClearActivities() {
    if (filteredActivities.length === 0 || clearingActivities) return

    try {
      setClearingActivities(true)
      const result = await clearActivityLogs({
        ids: filteredActivities.map((item) => item.id).filter(Boolean),
        deviceId: selectedDeviceId,
        startDate,
        endDate,
        activityType: activityTypeFilter,
      })

      setClearDialogOpen(false)
      await loadActivity({ quiet: true })
      showSuccessToast(
        `ลบ Operations Activity สำเร็จ ${Number(result?.deletedCount || 0).toLocaleString('th-TH')} รายการ`
      )
    } finally {
      setClearingActivities(false)
    }
  }

  return (
    <div className="page app-page activity-center-page">
      <PageHeader
        eyebrow="Activity Center"
        title="Operations Activity"
        description="Audit trail การใช้งานตั้งแต่ Login การเข้าหน้า และการเปลี่ยนค่าระบบ โดยไม่รวม Alarm"
      />

      <section className="activity-stat-grid">
        <StatCard
          label="Total Events"
          value={loading ? '...' : summary.total}
          hint="จำนวนเหตุการณ์ทั้งหมด"
        />
        <StatCard
          label="Sign-ins"
          value={loading ? '...' : summary.signIns}
          hint="จำนวนการเข้าสู่ระบบ"
          tone="success"
        />
        <StatCard
          label="Changes"
          value={loading ? '...' : summary.changes}
          hint="การแก้ไข Device, Metric และการตั้งค่า"
          tone="warning"
        />
        <StatCard
          label="Page Views"
          value={loading ? '...' : summary.pageViews}
          hint="จำนวนการเปิดส่วนต่าง ๆ ของระบบ"
          tone="success"
        />
      </section>

      <section className="app-card history-filter-card activity-filter-card activity-standalone-filter-card">
        <div className="history-section-title">
          <div>
            <h2>Filter</h2>
            <p>เลือก Device, ช่วงวันที่ และประเภท Activity ที่ต้องการตรวจสอบ</p>
          </div>
          <div className="filter-header-actions">
            <button
              type="button"
              className="secondary-button filter-refresh-button"
              onClick={() => {
                const currentDate = getLocalDateInputValue()
                setStartDate(currentDate)
                setEndDate(currentDate)
                loadActivity({ quiet: true })
              }}
              disabled={refreshing}
            >
              <RefreshCw size={16} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <FilterActionsMenu
              label="Activity filter actions"
              items={[
                {
                  key: 'clear',
                  label: 'Clear Data',
                  icon: Trash2,
                  tone: 'danger',
                  disabled:
                    loading ||
                    clearingActivities ||
                    filteredActivities.length === 0,
                  onSelect: openClearActivityDialog,
                },
              ]}
            />
          </div>
        </div>

        <div className="history-filter-grid activity-history-filter-grid">
          <label>
            <span>Device</span>
            <UnifiedSelect
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
            >
              <option value="">All Devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name || device.device_code}
                </option>
              ))}
            </UnifiedSelect>
          </label>

          <div className="history-filter-field">
            <label htmlFor="activity-start-date-input">Start Date</label>
            <div className="history-date-picker">
              <input
                id="activity-start-date-input"
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
                aria-label="วันที่เริ่มต้น Activity"
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(startDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันเริ่มต้น Activity"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="history-filter-field">
            <label htmlFor="activity-end-date-input">End Date</label>
            <div className="history-date-picker">
              <input
                id="activity-end-date-input"
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
                aria-label="วันที่สิ้นสุด Activity"
              />
              <button
                type="button"
                className="history-date-picker-button"
                onClick={() => showDatePicker(endDateInputRef)}
                aria-label="เปิดปฏิทินเลือกวันสิ้นสุด Activity"
              >
                <CalendarDays size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <label>
            <span>Activity Type</span>
            <UnifiedSelect
              value={activityTypeFilter}
              onChange={(event) => setActivityTypeFilter(event.target.value)}
              aria-label="กรองตามประเภท Activity"
            >
              <option value="all">All Activity Types</option>
              <option value="session">Sign-in / Sign-out</option>
              <option value="navigation">Page Views</option>
              <option value="changes">Changes</option>
              <option value="device">Device Events</option>
              <option value="other">Other</option>
            </UnifiedSelect>
          </label>
        </div>
      </section>

      <section className="app-card activity-feed-card">
        <div className="app-section-title activity-section-heading">
          <div>
            <h2>Recent Activity</h2>
            <p>รายการใช้งานตามตัวกรองและลำดับเวลาที่เลือก</p>
          </div>

          <div className="activity-table-actions">
            <label>
              <span>Show</span>
              <UnifiedSelect
                value={activityPageSize}
                onChange={(event) => setActivityPageSize(Number(event.target.value))}
                aria-label="จำนวนแถว Operations Activity ต่อหน้า"
              >
                {ACTIVITY_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </UnifiedSelect>
            </label>

            <label>
              <span>Sort</span>
              <UnifiedSelect
                value={activitySortOrder}
                onChange={(event) => setActivitySortOrder(event.target.value)}
                aria-label="ลำดับ Operations Activity"
              >
                <option value="desc">ล่าสุด</option>
                <option value="asc">เก่าสุด</option>
              </UnifiedSelect>
            </label>
          </div>
        </div>

        {loading ? (
          <EmptyState
            title="Loading activity"
            description="กำลังดึงข้อมูล Operations Activity ล่าสุดจากระบบ"
          />
        ) : sortedActivities.length === 0 ? (
          <EmptyState
            title="ยังไม่มี Activity"
            description="เมื่อมีการ Login เข้าหน้า หรือเปลี่ยนค่าระบบ รายการจะแสดงที่นี่"
          />
        ) : (
          <>
            <div className="history-table-wrap activity-table-wrap">
              <table className="history-table activity-history-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Device</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Occurred</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedActivities.map((item, index) => {
                    const createdAt = item.created_at || item.createdAt
                    const severity = String(item.severity || 'info').toLowerCase()

                    return (
                      <tr key={item.id || `${item.activity_type}-${createdAt}-${index}`}>
                        <td className="activity-message-cell">
                          <strong>{item.title || 'System activity'}</strong>
                          <span>{item.description || '--'}</span>
                        </td>
                        <td>
                          <strong>{item.device_name || 'System'}</strong>
                          <span>{item.device_code || 'Account activity'}</span>
                        </td>
                        <td>
                          <span className="activity-type-badge">
                            {formatActivityType(item.activity_type)}
                          </span>
                        </td>
                        <td>
                          <span className={`status ${severity}`}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </span>
                        </td>
                        <td>
                          <strong>{formatActivityDate(createdAt)}</strong>
                          <span>{formatRelativeActivityTime(createdAt)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <TablePagination
              page={safeActivityPage}
              pageSize={activityPageSize}
              total={sortedActivities.length}
              onPageChange={setActivityPage}
            />
          </>
        )}
      </section>

      <ClearFilteredDataDialog
        open={clearDialogOpen}
        idPrefix="operations-activity-clear"
        title="ยืนยันการ Clear Operations Activity"
        description="Operations Activity ที่ตรงกับตัวกรองจะถูกลบอย่างถาวรสำหรับบัญชีนี้ และไม่กลับมาเมื่อ Refresh หน้า"
        summaryItems={[
          {
            label: 'Device',
            value:
              selectedDeviceId === ''
                ? 'All Devices'
                : devices.find(
                    (device) => String(device.id) === String(selectedDeviceId)
                  )?.name || selectedDeviceId,
          },
          { label: 'Start Date', value: startDate || 'All Dates' },
          { label: 'End Date', value: endDate || 'All Dates' },
          {
            label: 'Activity Type',
            value: ACTIVITY_TYPE_LABELS[activityTypeFilter],
          },
          {
            label: 'Records',
            value: `${filteredActivities.length.toLocaleString('th-TH')} rows`,
          },
        ]}
        confirmationKeyword="Delete"
        confirmationHelp="ตรวจสอบ Device, ช่วงวันที่ และ Activity Type ให้ถูกต้องก่อนยืนยัน"
        confirmLabel="Delete Activity"
        busyLabel="กำลังลบ Operations Activity..."
        busy={clearingActivities}
        onClose={closeClearActivityDialog}
        onConfirm={handleClearActivities}
      />
    </div>
  )
}

export default ActivityCenter
