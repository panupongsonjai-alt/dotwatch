import { useEffect, useMemo, useState } from 'react'
import { PageHeader, SectionHeader, StatCard, UnifiedSelect } from '../components/common'
import {
  getDevices,
  getNotificationPreferences,
  testNotificationChannel,
  updateNotificationPreferences,
} from '../services/api'
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
import { showErrorToast, showSuccessToast } from '../utils/uiFeedback'
import {
  LANGUAGE_OPTIONS,
  languageText,
  readLanguage,
  writeLanguage,
} from '../utils/languagePreferences'

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
  const [language, setLanguage] = useState(() => readLanguage())
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [recordDevices, setRecordDevices] = useState([])
  const [recordDeviceId, setRecordDeviceId] = useState('')
  const [recordIntervalSeconds, setRecordIntervalSeconds] = useState(30)
  const [recordLoading, setRecordLoading] = useState(true)
  const [recordSaving, setRecordSaving] = useState(false)
  const [recordMessage, setRecordMessage] = useState('')
  const [recordMessageTone, setRecordMessageTone] = useState('info')
  const [notificationSettings, setNotificationSettings] = useState({
    lineEnabled: false,
    lineTargetId: '',
    emailEnabled: false,
    emailAddress: '',
    accountEmail: '',
    notifyOnTrigger: true,
    notifyOnRecovery: true,
    providers: { lineConfigured: false, emailConfigured: false },
  })
  const [notificationLoading, setNotificationLoading] = useState(true)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationTesting, setNotificationTesting] = useState('')

  useEffect(() => {
    const nextPreferences = readUiPreferences()

    setShowDataOverview(localStorage.getItem('showDataOverview') !== 'false')
    setShowDeviceOverview(
      localStorage.getItem('showDeviceOverview') !== 'false'
    )
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

    getNotificationPreferences()
      .then((result) => {
        if (!cancelled) setNotificationSettings((current) => ({ ...current, ...result }))
      })
      .catch((error) => {
        if (!cancelled) showErrorToast(error.message || 'โหลดการตั้งค่าแจ้งเตือนไม่สำเร็จ')
      })
      .finally(() => {
        if (!cancelled) setNotificationLoading(false)
      })

    return () => { cancelled = true }
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

        setRecordIntervalSeconds(Number(result?.record_interval_seconds || 30))
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
    writeLanguage(language)

    window.dispatchEvent(new Event('dashboardSettingsChanged'))
    broadcastUiPreferencesChanged(savedPreferences)

    showSuccessToast(
      languageText(language, 'บันทึกการตั้งค่าเรียบร้อย', 'Settings saved successfully')
    )
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
      setRecordMessage(
        'บันทึก Interval Record เรียบร้อย ค่าถัดไปจะถูกบันทึกทันที'
      )
      setRecordMessageTone('success')
      showSuccessToast('บันทึก Interval Record เรียบร้อย')

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
      const message = error.message || 'บันทึก Interval Record ไม่สำเร็จ'
      setRecordMessage(message)
      setRecordMessageTone('error')
      showErrorToast(message)
    } finally {
      setRecordSaving(false)
    }
  }

  function updateNotificationField(field, value) {
    setNotificationSettings((current) => ({ ...current, [field]: value }))
  }

  async function handleSaveNotifications() {
    if (notificationSaving) return
    try {
      setNotificationSaving(true)
      await updateNotificationPreferences({
        lineEnabled: notificationSettings.lineEnabled,
        lineTargetId: notificationSettings.lineTargetId.trim(),
        emailEnabled: notificationSettings.emailEnabled,
        emailAddress: notificationSettings.emailAddress.trim(),
        notifyOnTrigger: notificationSettings.notifyOnTrigger,
        notifyOnRecovery: notificationSettings.notifyOnRecovery,
      })
      showSuccessToast('บันทึกช่องทางแจ้งเตือนเรียบร้อย')
      return true
    } catch (error) {
      showErrorToast(error.message || 'บันทึกช่องทางแจ้งเตือนไม่สำเร็จ')
      return false
    } finally {
      setNotificationSaving(false)
    }
  }

  async function handleTestNotification(channel) {
    if (notificationTesting) return
    try {
      setNotificationTesting(channel)
      const saved = await handleSaveNotifications()
      if (!saved) return
      await testNotificationChannel(channel)
      showSuccessToast(`ส่งข้อความทดสอบทาง ${channel === 'line' ? 'LINE' : 'Email'} แล้ว`)
    } catch (error) {
      showErrorToast(error.message || 'ส่งข้อความทดสอบไม่สำเร็จ')
    } finally {
      setNotificationTesting('')
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
            hint={item.hint}
            tone={item.tone}
            compact
          />
        ))}
      </section>

      <section className="settings-v3-layout settings-v3-list">
        <section className="app-card settings-v3-card">
          <SectionHeader
            title="Interface Preferences"
            description="เลือกสีหลักของระบบ dotWatch Dashboard โดยไม่กระทบปุ่ม Dark / Light Theme ด้านบน"
          />

          <div className="settings-interface-field">
            <label htmlFor="dashboard-accent">
              <strong>Accent Color</strong>
              <span>เลือกสีหลักที่ใช้กับปุ่ม กราฟ และสถานะสำคัญของ Dashboard</span>
            </label>
            <UnifiedSelect
              id="dashboard-accent"
              value={accent}
              aria-label="Dashboard accent color"
              onChange={(event) => setAccent(event.target.value)}
            >
              {ACCENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} data-swatch={option.color}>
                  {option.label}
                </option>
              ))}
            </UnifiedSelect>
          </div>

          <div className="settings-interface-field">
            <label htmlFor="dashboard-language">
              <strong>{languageText(language, 'ภาษา', 'Language')}</strong>
              <span>
                {languageText(
                  language,
                  'เลือกภาษาที่ใช้ใน Dashboard ระบบจะจำค่าไว้ใน Browser นี้',
                  'Choose the Dashboard language. This browser will remember your selection.'
                )}
              </span>
            </label>
            <UnifiedSelect
              id="dashboard-language"
              value={language}
              aria-label={languageText(language, 'ภาษา Dashboard', 'Dashboard language')}
              onChange={(event) => {
                const nextLanguage = event.target.value
                setLanguage(nextLanguage)
                writeLanguage(nextLanguage)
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </UnifiedSelect>
          </div>

          <div className="settings-preference-group">
            <div className="settings-preference-group-header">
              <strong>Interface Density</strong>
              <span>เลือกความแน่นของ UI ให้เหมาะกับหน้าจอ</span>
            </div>

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
          </div>

          <div className="settings-preference-group">
            <div className="settings-preference-group-header">
              <strong>Product UX</strong>
              <span>ตั้งค่าการใช้งานเพิ่มเติม</span>
            </div>

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
                  <span>
                    ลด Animation สำหรับเครื่องที่ต้องการประหยัดทรัพยากร
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(event) => setReduceMotion(event.target.checked)}
                />
              </label>
            </div>
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
              <UnifiedSelect
                value={recordDeviceId}
                onChange={(event) => setRecordDeviceId(event.target.value)}
                disabled={
                  recordLoading || recordSaving || !recordDevices.length
                }
              >
                {!recordDevices.length && (
                  <option value="">No device available</option>
                )}
                {recordDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name ||
                      device.device_code ||
                      `Device ${device.id}`}
                  </option>
                ))}
              </UnifiedSelect>
            </label>

            <label className="settings-recording-field settings-recording-interval-row">
              <span>Interval Record</span>
              <UnifiedSelect
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
              </UnifiedSelect>
            </label>
          </div>

          <div className="settings-recording-footer">
            <span
              className={`settings-recording-message ${recordMessageTone}`}
              role={recordMessageTone === 'error' ? 'alert' : 'status'}
            >
              {recordMessage ||
                'Interval นี้ควบคุมการบันทึกข้อมูลจริงลง Trend Graph และ History Table'}
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

        <section className="app-card settings-v3-card notification-settings-card">
          <SectionHeader
            title="Alarm Notifications"
            description="ส่ง Alarm ผ่าน LINE Messaging API และอีเมล เมื่อ Alarm เริ่มทำงานหรือกลับสู่ภาวะปกติ"
          />

          <div className="notification-provider-list">
            <div className="notification-provider-item">
              <label className="settings-v3-toggle-item">
                <div>
                  <strong>LINE</strong>
                  <span>{notificationSettings.providers.lineConfigured ? 'Backend พร้อมใช้งาน' : 'ต้องตั้ง LINE_CHANNEL_ACCESS_TOKEN บน Render'}</span>
                </div>
                <input type="checkbox" checked={notificationSettings.lineEnabled}
                  onChange={(event) => updateNotificationField('lineEnabled', event.target.checked)}
                  disabled={notificationLoading} />
              </label>
              <label className="notification-destination-field">
                <span>LINE User / Group / Room ID</span>
                <input type="text" value={notificationSettings.lineTargetId}
                  onChange={(event) => updateNotificationField('lineTargetId', event.target.value)}
                  placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" maxLength={128}
                  disabled={notificationLoading || !notificationSettings.lineEnabled} />
              </label>
              <button type="button" className="secondary-button"
                onClick={() => handleTestNotification('line')}
                disabled={notificationLoading || notificationTesting || !notificationSettings.lineEnabled}>
                {notificationTesting === 'line' ? 'Sending...' : 'Test LINE'}
              </button>
            </div>

            <div className="notification-provider-item">
              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Email</strong>
                  <span>{notificationSettings.providers.emailConfigured ? 'Email API พร้อมใช้งาน' : 'ต้องตั้ง RESEND_API_KEY บน Render'}</span>
                </div>
                <input type="checkbox" checked={notificationSettings.emailEnabled}
                  onChange={(event) => updateNotificationField('emailEnabled', event.target.checked)}
                  disabled={notificationLoading} />
              </label>
              <label className="notification-destination-field">
                <span>Destination email</span>
                <input type="email" value={notificationSettings.emailAddress}
                  onChange={(event) => updateNotificationField('emailAddress', event.target.value)}
                  placeholder={notificationSettings.accountEmail || 'name@example.com'} maxLength={320}
                  disabled={notificationLoading || !notificationSettings.emailEnabled} />
                <small>เว้นว่างเพื่อใช้อีเมลของบัญชี</small>
              </label>
              <button type="button" className="secondary-button"
                onClick={() => handleTestNotification('email')}
                disabled={notificationLoading || notificationTesting || !notificationSettings.emailEnabled}>
                {notificationTesting === 'email' ? 'Sending...' : 'Test Email'}
              </button>
            </div>
          </div>

          <div className="settings-v3-toggle-list compact">
            <label className="settings-v3-toggle-item">
              <div><strong>Alarm triggered</strong><span>แจ้งเมื่อค่าเริ่มเข้าเงื่อนไข Alarm</span></div>
              <input type="checkbox" checked={notificationSettings.notifyOnTrigger}
                onChange={(event) => updateNotificationField('notifyOnTrigger', event.target.checked)} />
            </label>
            <label className="settings-v3-toggle-item">
              <div><strong>Alarm recovered</strong><span>แจ้งเมื่อค่ากลับสู่ภาวะปกติ</span></div>
              <input type="checkbox" checked={notificationSettings.notifyOnRecovery}
                onChange={(event) => updateNotificationField('notifyOnRecovery', event.target.checked)} />
            </label>
          </div>

          <div className="settings-recording-footer">
            <span className="settings-recording-message">LINE token และ Email API key เก็บใน Render เท่านั้น</span>
            <button type="button" className="primary-button" onClick={handleSaveNotifications}
              disabled={notificationLoading || notificationSaving}>
              {notificationSaving ? 'Saving...' : 'Save Notifications'}
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
                <span>
                  แสดงค่าล่าสุดของ Value ที่เปิด Visible ใน Dashboard
                </span>
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
      </section>
    </div>
  )
}

export default Settings
