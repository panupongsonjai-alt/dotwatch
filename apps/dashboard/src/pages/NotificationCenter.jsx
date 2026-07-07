import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CheckCheck,
  RefreshCcw,
  Search,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../components/common'
import { getAlarms, getDevices } from '../services/api'
import { auth } from '../services/firebase'
import { connectRealtime } from '../services/realtime'

const READ_STORAGE_KEY = 'dotwatchReadNotifications'

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

function buildAlarmNotification(alarm) {
  const id = `alarm-${alarm.id}-${alarm.status || 'active'}`
  const metric = alarm.metric_name || alarm.metric || 'Metric'
  const unit = alarm.unit || ''
  const valueText = alarm.value != null ? `${alarm.value}${unit ? ` ${unit}` : ''}` : '--'
  const thresholdText = alarm.threshold != null ? `${alarm.operator || ''} ${alarm.threshold}${unit ? ` ${unit}` : ''}` : '--'

  return {
    id,
    type: 'alarm',
    severity: alarm.severity || 'warning',
    status: alarm.status || 'active',
    title: getAlarmTitle(alarm),
    description: `${metric} value ${valueText} matched rule ${thresholdText}`,
    source: alarm.device_name || alarm.device_code || 'Unknown Device',
    time: alarm.triggered_at || alarm.acknowledged_at,
    icon: ShieldAlert,
  }
}

function buildDeviceNotification(device) {
  const status = device.status || 'offline'
  const id = `device-${device.id || device.device_code}-${status}`
  const isOffline = status === 'offline'

  return {
    id,
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

function NotificationCenter() {
  const [alarms, setAlarms] = useState([])
  const [devices, setDevices] = useState([])
  const [readIds, setReadIds] = useState(() => new Set(readStoredIds()))
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  async function loadData() {
    try {
      setLoading(true)
      const [alarmData, deviceData] = await Promise.all([getAlarms(), getDevices()])

      setAlarms(Array.isArray(alarmData) ? alarmData : [])
      setDevices(Array.isArray(deviceData) ? deviceData : [])
    } catch (error) {
      console.error('Load notifications error:', error)
      setAlarms([])
      setDevices([])
    } finally {
      setLoading(false)
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
            const exists = prev.some((device) => isSameRealtimeDevice(device, reading))

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
            prev.filter((device) => !isSameRealtimeDevice(device, deletedDevice))
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
    const activeAlarms = alarms.map(buildAlarmNotification)
    const deviceAlerts = devices
      .filter((device) => ['offline', 'warning'].includes(device.status))
      .map(buildDeviceNotification)

    return [...activeAlarms, ...deviceAlerts].sort((a, b) => {
      const aTime = new Date(a.time || 0).getTime()
      const bTime = new Date(b.time || 0).getTime()
      return bTime - aTime
    })
  }, [alarms, devices])

  const filteredNotifications = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return notifications.filter((item) => {
      const matchesFilter =
        filter === 'all' ||
        item.type === filter ||
        item.status === filter ||
        item.severity === filter ||
        (filter === 'unread' && !readIds.has(item.id))

      const matchesSearch =
        !keyword ||
        [item.title, item.description, item.source, item.type, item.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword)

      return matchesFilter && matchesSearch
    })
  }, [filter, notifications, readIds, search])

  const unreadCount = notifications.filter((item) => !readIds.has(item.id)).length
  const criticalCount = notifications.filter((item) => item.severity === 'critical').length
  const deviceCount = notifications.filter((item) => item.type === 'device').length
  const alarmCount = notifications.filter((item) => item.type === 'alarm').length

  return (
    <div className="page app-page notifications-page">
      <PageHeader
        eyebrow="Notification Center"
        title="Notifications"
        description="รวมเหตุการณ์สำคัญของระบบ เช่น Alarm, Device Offline และ Warning เพื่อให้ติดตามได้ในหน้าเดียว"
        actions={
          <>
            <button type="button" className="secondary-button" onClick={loadData}>
              <RefreshCcw size={16} />
              Refresh
            </button>

            <button type="button" className="primary-button" onClick={markAllAsRead}>
              <CheckCheck size={16} />
              Mark all read
            </button>
          </>
        }
      />

      <section className="notifications-stat-grid">
        <StatCard label="Unread" value={loading ? '...' : unreadCount} tone={unreadCount > 0 ? 'warning' : 'success'} />
        <StatCard label="Critical" value={loading ? '...' : criticalCount} tone={criticalCount > 0 ? 'danger' : 'success'} />
        <StatCard label="Alarm Events" value={loading ? '...' : alarmCount} />
        <StatCard label="Device Alerts" value={loading ? '...' : deviceCount} />
      </section>

      <section className="app-card notifications-panel">
        <SectionHeader
          title="Notification Feed"
          description="รายการแจ้งเตือนเรียงตามเวลาล่าสุด ใช้สำหรับตรวจสอบเหตุการณ์ที่ต้องติดตาม"
          actions={<span className="notification-count-chip">{filteredNotifications.length} items</span>}
        />

        <div className="notifications-toolbar">
          <div className="notifications-search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notifications..."
            />
          </div>

          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All notifications</option>
            <option value="unread">Unread</option>
            <option value="alarm">Alarm events</option>
            <option value="device">Device alerts</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </div>

        {loading ? (
          <EmptyState title="Loading notifications" description="กำลังดึงข้อมูล Notification ล่าสุดจากระบบ" />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState title="No notifications" description="ยังไม่มี Notification ตามเงื่อนไขที่เลือก" />
        ) : (
          <div className="notification-list">
            {filteredNotifications.map((item) => {
              const Icon = item.icon || Bell
              const isUnread = !readIds.has(item.id)

              return (
                <article
                  key={item.id}
                  className={`notification-card ${item.severity} ${isUnread ? 'unread' : ''}`}
                >
                  <div className="notification-icon">
                    <Icon size={20} />
                  </div>

                  <div className="notification-content">
                    <div className="notification-title-row">
                      <h3>{item.title}</h3>
                      <div className="notification-badges">
                        {isUnread && <span className="notification-unread-dot">New</span>}
                        <StatusBadge status={item.severity} size="sm" />
                      </div>
                    </div>

                    <p>{item.description}</p>

                    <div className="notification-meta">
                      <span>{item.source}</span>
                      <span>{formatDate(item.time)}</span>
                      <strong>{getRelativeTime(item.time)}</strong>
                    </div>
                  </div>

                  <div className="notification-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!isUnread}
                      onClick={() => markAsRead(item.id)}
                    >
                      {isUnread ? 'Mark read' : 'Read'}
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

export default NotificationCenter
