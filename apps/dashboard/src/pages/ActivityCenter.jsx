import { useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { auth } from '../services/firebase'
import { getActivityLogs, getDevices } from '../services/api'
import { connectRealtime } from '../services/realtime'
import {
  ActivityList,
  PageHeader,
  SectionHeader,
  StatCard,
  UnifiedSelect,
} from '../components/common'

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
  const [activities, setActivities] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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

      setActivities(Array.isArray(activityData) ? activityData : [])
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

  const summary = useMemo(() => {
    const total = activities.length
    const alarms = activities.filter(
      (item) => item.activity_type === 'alarm.triggered'
    ).length
    const deviceEvents = activities.filter((item) =>
      String(item.activity_type || '').startsWith('device.')
    ).length
    const critical = activities.filter(
      (item) => item.severity === 'critical' || item.severity === 'danger'
    ).length

    return { total, alarms, deviceEvents, critical }
  }, [activities])

  return (
    <div className="page app-page activity-center-page">
      <PageHeader
        eyebrow="Activity Center"
        title="Operations Activity"
        description="ติดตามเหตุการณ์ล่าสุดของ Device, Alarm, และระบบแบบ realtime"
        actions={
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadActivity({ quiet: true })}
            disabled={refreshing}
          >
            <RefreshCw size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <section className="activity-stat-grid">
        <StatCard
          label="Total Events"
          value={loading ? '...' : summary.total}
          hint="จำนวนเหตุการณ์ทั้งหมด"
        />
        <StatCard
          label="Device Events"
          value={loading ? '...' : summary.deviceEvents}
          hint="จำนวนเหตุการณ์อุปกรณ์"
          tone="success"
        />
        <StatCard
          label="Alarm Events"
          value={loading ? '...' : summary.alarms}
          hint="จำนวนเหตุการณ์ Alarm ที่เกิดขึ้น"
          tone={summary.alarms > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Critical"
          value={loading ? '...' : summary.critical}
          hint="จำนวนเหตุการณ์ที่มีความสำคัญสูง"
          tone={summary.critical > 0 ? 'danger' : 'success'}
        />
      </section>

      <section className="app-card activity-filter-card">
        <SectionHeader
          title="Filter Activity"
          description="เลือกดูทุกอุปกรณ์ หรือเจาะจงเฉพาะ Device ที่ต้องการ"
        />

        <div className="activity-filter-row">
          <label>
            Device
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
        </div>
      </section>

      <section className="app-card activity-feed-card">
        <SectionHeader
          title="Recent Activity"
          description="เหตุการณ์ล่าสุดจะเพิ่มเข้ามาอัตโนมัติเมื่อ WebSocket ส่ง activity event"
        />

        <ActivityList
          items={activities}
          loading={loading}
          emptyTitle="ยังไม่มี Activity"
          emptyDescription="เมื่อ Device ส่งข้อมูล หรือมี Alarm เกิดขึ้น รายการจะแสดงที่นี่"
        />
      </section>
    </div>
  )
}

export default ActivityCenter
