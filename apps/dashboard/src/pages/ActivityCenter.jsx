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

  return (
    <div className="page app-page activity-center-page">
      <PageHeader
        eyebrow="Activity Center"
        title="Operations Activity"
        description="Audit trail การใช้งานตั้งแต่ Login การเข้าหน้า และการเปลี่ยนค่าระบบ โดยไม่รวม Alarm"
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
          description="รายการใช้งานล่าสุดจะถูกเพิ่มอัตโนมัติเมื่อผู้ใช้ดำเนินการสำเร็จ"
        />

        <ActivityList
          activities={activities}
          loading={loading}
          emptyTitle="ยังไม่มี Activity"
          emptyDescription="เมื่อมีการ Login เข้าหน้า หรือเปลี่ยนค่าระบบ รายการจะแสดงที่นี่"
        />
      </section>
    </div>
  )
}

export default ActivityCenter
