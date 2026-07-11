import { useEffect, useMemo, useState } from 'react'
import { PageHeader, SectionHeader, StatCard } from '../components/common'
import { getDevices } from '../services/api'
import {
  getDeviceRecordSettings,
  updateDeviceRecordSettings,
} from '../services/metricDisplayApi'
import {
  ACCENT_OPTIONS,
  DENSITY_OPTIONS,
  applyUiPreferences,
  broadcastUiPreferencesChanged,
  getAccentLabel,
  getDensityLabel,
  readUiPreferences,
  writeUiPreferences,
} from '../utils/uiPreferences'

const RECORD_INTERVAL_OPTIONS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
]

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.devices)) return payload.devices
  return []
}

function Settings() {
  const [showDataOverview, setShowDataOverview] = useState(true)
  const [showDeviceOverview, setShowDeviceOverview] = useState(true)
  const [showDeviceMap, setShowDeviceMap] = useState(true)
  const [showLatestActiveAlarms, setShowLatestActiveAlarms] = useState(true)
  const [accent, setAccent] = useState('blue')
  const [density, setDensity] = useState('comfortable')
  const [reduceMotion, setReduceMotion] = useState(false)
  const [compactCards, setCompactCards] = useState(false)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [recordDevices, setRecordDevices] = useState([])
  const [recordDeviceId, setRecordDeviceId] = useState('')
  const [recordIntervalSeconds, setRecordIntervalSeconds] = useState(30)
  const [recordLoading, setRecordLoading] = useState(true)
  const [recordSaving, setRecordSaving] = useState(false)
  const [recordMessage, setRecordMessage] = useState('')
  const [recordMessageTone, setRecordMessageTone] = useState('info')

  useEffect(() => {
    const nextPreferences = readUiPreferences()

    setShowDataOverview(localStorage.getItem('showDataOverview') !== 'false')
    setShowDeviceOverview(localStorage.getItem('showDeviceOverview') !== 'false')
    setShowDeviceMap(localStorage.getItem('showDeviceMap') !== 'false')
    setShowLatestActiveAlarms(
      localStorage.getItem('showLatestActiveAlarms') !== 'false'
    )
    setAccent(nextPreferences.accent)
    setDensity(nextPreferences.density)
    setReduceMotion(nextPreferences.reduceMotion)
    setCompactCards(nextPreferences.compactCards)

    applyUiPreferences(nextPreferences)
    setPreferencesLoaded(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadRecordDevices() {
      try {
        setRecordLoading(true)
        setRecordMessage('')

        const result = await getDevices()
        const nextDevices = toArray(result)

        if (cancelled) return

        setRecordDevices(nextDevices)
        setRecordDeviceId((current) => {
          const stillExists = nextDevices.some(
            (device) => String(device.id) === String(current)
          )

          if (current && stillExists) return current
          return nextDevices[0] ? String(nextDevices[0].id) : ''
        })
      } catch (error) {
        if (cancelled) return

        console.error('Settings load devices error:', error)
        setRecordDevices([])
        setRecordDeviceId('')
        setRecordMessage(error.message || 'โหลดรายการ Device ไม่สำเร็จ')
        setRecordMessageTone('error')
      } finally {
        if (!cancelled) setRecordLoading(false)
      }
    }

    loadRecordDevices()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadRecordSettings() {
      if (!recordDeviceId) {
        setRecordIntervalSeconds(30)
        return
      }

      try {
        setRecordLoading(true)
        setRecordMessage('')

        const result = await getDeviceRecordSettings(recordDeviceId)

        if (cancelled) return

        setRecordIntervalSeconds(
          Number(result?.record_interval_seconds || 30)
        )
      } catch (error) {
        if (cancelled) return

        console.error('Settings load record interval error:', error)
        setRecordMessage(error.message || 'โหลด Interval Record ไม่สำเร็จ')
        setRecordMessageTone('error')
      } finally {
        if (!cancelled) setRecordLoading(false)
      }
    }

    loadRecordSettings()

    return () => {
      cancelled = true
    }
  }, [recordDeviceId])

  useEffect(() => {
    if (!preferencesLoaded) return

    const nextPreferences = applyUiPreferences({
      accent,
      density,
      reduceMotion,
      compactCards,
    })
    broadcastUiPreferencesChanged(nextPreferences)
  }, [accent, compactCards, density, preferencesLoaded, reduceMotion])

  const settingsSummary = useMemo(
    () => [
      {
        label: 'Accent',
        value: getAccentLabel(accent),
        tone: 'default',
      },
      {
        label: 'Density',
        value: getDensityLabel(density),
        tone: density === 'compact' ? 'warning' : 'default',
      },
      {
        label: 'Motion',
        value: reduceMotion ? 'Reduced' : 'Standard',
        tone: reduceMotion ? 'warning' : 'success',
      },
      {
        label: 'Dashboard',
        value:
          [
            showDataOverview && 'Data',
            showDeviceOverview && 'Devices',
            showDeviceMap && 'Map',
            showLatestActiveAlarms && 'Alarms',
          ]
            .filter(Boolean)
            .join(' + ') || 'Minimal',
        tone: 'success',
      },
    ],
    [
      accent,
      density,
      reduceMotion,
      showDataOverview,
      showDeviceOverview,
      showDeviceMap,
      showLatestActiveAlarms,
    ]
  )

  function handleSave() {
    localStorage.setItem('showDataOverview', String(showDataOverview))
    localStorage.setItem('showDeviceOverview', String(showDeviceOverview))
    localStorage.setItem('showDeviceMap', String(showDeviceMap))
    localStorage.setItem(
      'showLatestActiveAlarms',
      String(showLatestActiveAlarms)
    )
    const savedPreferences = writeUiPreferences({
      accent,
      density,
      reduceMotion,
      compactCards,
    })

    applyUiPreferences(savedPreferences)

    window.dispatchEvent(new Event('dashboardSettingsChanged'))
    broadcastUiPreferencesChanged(savedPreferences)

    alert('บันทึกการตั้งค่าเรียบร้อย')
  }

  async function handleSaveRecordInterval() {
    if (!recordDeviceId || recordSaving) return

    try {
      setRecordSaving(true)
      setRecordMessage('กำลังบันทึก Interval Record...')
      setRecordMessageTone('info')

      const result = await updateDeviceRecordSettings(
        recordDeviceId,
        recordIntervalSeconds
      )

      setRecordIntervalSeconds(
        Number(result?.record_interval_seconds || recordIntervalSeconds)
      )
      setRecordMessage('บันทึก Interval Record เรียบร้อย ค่าถัดไปจะถูกบันทึกทันที')
      setRecordMessageTone('success')

      window.dispatchEvent(
        new CustomEvent('dotwatchRecordSettingsChanged', {
          detail: {
            deviceId: recordDeviceId,
            recordIntervalSeconds: Number(
              result?.record_interval_seconds || recordIntervalSeconds
            ),
          },
        })
      )
    } catch (error) {
      console.error('Settings save record interval error:', error)
      setRecordMessage(error.message || 'บันทึก Interval Record ไม่สำเร็จ')
      setRecordMessageTone('error')
    } finally {
      setRecordSaving(false)
    }
  }

  return (
    <div className="page app-page settings-page settings-v3-page">
      <PageHeader
        eyebrow="System Settings"
        title="Settings"
        description="ตั้งค่าการแสดงผล Dashboard, Accent Color และพฤติกรรมของระบบ dotWatch"
        actions={
          <button type="button" className="primary-button" onClick={handleSave}>
            Save Settings
          </button>
        }
      />

      <section className="settings-v3-stat-grid">
        {settingsSummary.map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            tone={item.tone}
            compact
          />
        ))}
      </section>

      <section className="settings-v3-layout">
        <div className="settings-v3-main">
          <section className="app-card settings-v3-card">
            <SectionHeader
              title="Interface Preferences"
              description="เลือกสีหลักของระบบ dotWatch Dashboard โดยไม่กระทบปุ่ม Dark / Light Theme ด้านบน"
            />

            <div className="settings-v3-accent-grid">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-v3-accent settings-v3-accent-option ${
                    accent === option.value ? 'active' : ''
                  }`}
                  onClick={() => setAccent(option.value)}
                >
                  <span
                    className="settings-v3-accent-dot"
                    style={{ background: option.color }}
                  />
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="app-card settings-v3-card settings-recording-card">
            <SectionHeader
              title="Data Recording"
              description="กำหนด Interval Record แยกตาม Device สำหรับบันทึกข้อมูลลง History Analytics"
            />

            <div className="settings-recording-fields">
              <label className="settings-recording-field">
                <span>Device</span>
                <select
                  value={recordDeviceId}
                  onChange={(event) => setRecordDeviceId(event.target.value)}
                  disabled={recordLoading || recordSaving || !recordDevices.length}
                >
                  {!recordDevices.length && (
                    <option value="">No device available</option>
                  )}
                  {recordDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name || device.device_code || `Device ${device.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-recording-field settings-recording-interval-row">
                <span>Interval Record</span>
                <select
                  value={Number(recordIntervalSeconds)}
                  onChange={(event) =>
                    setRecordIntervalSeconds(Number(event.target.value))
                  }
                  disabled={recordLoading || recordSaving || !recordDeviceId}
                >
                  {RECORD_INTERVAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-recording-footer">
              <span
                className={`settings-recording-message ${recordMessageTone}`}
                role={recordMessageTone === 'error' ? 'alert' : 'status'}
              >
                {recordMessage || 'Interval นี้ควบคุมการบันทึกข้อมูลจริงลง Trend Graph และ History Table'}
              </span>
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveRecordInterval}
                disabled={recordLoading || recordSaving || !recordDeviceId}
              >
                {recordSaving ? 'Saving...' : 'Save Interval'}
              </button>
            </div>
          </section>

          <section className="app-card settings-v3-card">
            <SectionHeader
              title="Dashboard Display"
              description="เลือกส่วนที่ต้องการให้แสดงบนหน้า Dashboard"
            />

            <div className="settings-v3-toggle-list dashboard-display-toggle-list">
              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Data Overview</strong>
                  <span>แสดงค่าล่าสุดของ Metric ที่เปิด Visible ใน Dashboard</span>
                </div>
                <input
                  type="checkbox"
                  checked={showDataOverview}
                  onChange={(event) =>
                    setShowDataOverview(event.target.checked)
                  }
                />
              </label>

              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Devices Overview</strong>
                  <span>แสดงภาพรวมสถานะอุปกรณ์ทั้งหมดใน Dashboard</span>
                </div>
                <input
                  type="checkbox"
                  checked={showDeviceOverview}
                  onChange={(event) =>
                    setShowDeviceOverview(event.target.checked)
                  }
                />
              </label>

              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Device Map</strong>
                  <span>แสดงตำแหน่ง Device และสถานะล่าสุดบนแผนที่</span>
                </div>
                <input
                  type="checkbox"
                  checked={showDeviceMap}
                  onChange={(event) => setShowDeviceMap(event.target.checked)}
                />
              </label>

              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Latest Active Alarms</strong>
                  <span>แสดงรายการ Alarm ที่ยัง Active อยู่ล่าสุด</span>
                </div>
                <input
                  type="checkbox"
                  checked={showLatestActiveAlarms}
                  onChange={(event) =>
                    setShowLatestActiveAlarms(event.target.checked)
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="settings-v3-side">
          <section className="app-card settings-v3-card">
            <SectionHeader
              title="Interface Density"
              description="เลือกความแน่นของ UI ให้เหมาะกับหน้าจอ"
            />

            <div className="settings-v3-option-grid">
              {DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-v3-density ${
                    density === option.value ? 'active' : ''
                  }`}
                  onClick={() => setDensity(option.value)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="app-card settings-v3-card">
            <SectionHeader title="Product UX" description="ตั้งค่าการใช้งานเพิ่มเติม" />

            <div className="settings-v3-toggle-list compact">
              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Compact Stat Cards</strong>
                  <span>ลดความสูงของ StatCard ในหน้าหลัก</span>
                </div>
                <input
                  type="checkbox"
                  checked={compactCards}
                  onChange={(event) => setCompactCards(event.target.checked)}
                />
              </label>

              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Reduce Motion</strong>
                  <span>ลด Animation สำหรับเครื่องที่ต้องการประหยัดทรัพยากร</span>
                </div>
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(event) => setReduceMotion(event.target.checked)}
                />
              </label>
            </div>
          </section>

          <section className="app-card settings-v3-card settings-v3-system-card">
            <SectionHeader title="System" description="ข้อมูลระบบปัจจุบัน" />

            <div className="settings-v3-system-list">
              <div>
                <span>Platform</span>
                <strong>dotWatch Dashboard</strong>
              </div>
              <div>
                <span>UI Version</span>
                <strong>Phase 3 UX</strong>
              </div>
              <div>
                <span>Theme Control</span>
                <strong>Top Header Toggle</strong>
              </div>
              <div>
                <span>Storage</span>
                <strong>Local Preferences</strong>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  )
}

export default Settings
