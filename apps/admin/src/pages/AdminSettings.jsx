import { useEffect, useMemo, useState } from 'react'
import {
  PageHeader,
  SectionHeader,
  StatCard,
} from '../components/common'
import UnifiedSelect from '../components/common/UnifiedSelect'
import {
  ACCENT_OPTIONS,
  ADMIN_SETTINGS_EVENT,
  DENSITY_OPTIONS,
  applyAdminUiPreferences,
  broadcastAdminSettingsChanged,
  getAccentLabel,
  getDensityLabel,
  readAdminOverviewPreferences,
  readAdminUiPreferences,
  writeAdminOverviewPreferences,
  writeAdminUiPreferences,
} from '../utils/adminUiPreferences'
import { showAdminToast } from '../utils/uiFeedback'
import {
  LANGUAGE_OPTIONS,
  languageText,
  readLanguage,
  writeLanguage,
} from '../utils/languagePreferences'

const ADMIN_API_URL =
  import.meta.env.VITE_API_URL || 'Not configured'

function AdminSettings({ adminUser }) {
  const [initialPreferences] = useState(() => ({
    ui: readAdminUiPreferences(),
    overview: readAdminOverviewPreferences(),
  }))
  const [accent, setAccent] = useState(initialPreferences.ui.accent)
  const [density, setDensity] = useState(initialPreferences.ui.density)
  const [reduceMotion, setReduceMotion] = useState(
    initialPreferences.ui.reduceMotion
  )
  const [compactCards, setCompactCards] = useState(
    initialPreferences.ui.compactCards
  )
  const [language, setLanguage] = useState(() => readLanguage())
  const [showSummaryCards, setShowSummaryCards] = useState(
    initialPreferences.overview.showSummaryCards
  )
  const [showRecentUsers, setShowRecentUsers] = useState(
    initialPreferences.overview.showRecentUsers
  )
  const [showLatestDevices, setShowLatestDevices] = useState(
    initialPreferences.overview.showLatestDevices
  )

  useEffect(() => {
    applyAdminUiPreferences({
      accent,
      density,
      reduceMotion,
      compactCards,
    })
  }, [accent, compactCards, density, reduceMotion])

  const visibleOverviewSections = useMemo(
    () =>
      [showSummaryCards, showRecentUsers, showLatestDevices].filter(Boolean)
        .length,
    [showLatestDevices, showRecentUsers, showSummaryCards]
  )

  const settingsSummary = useMemo(
    () => [
      {
        label: 'Accent',
        value: getAccentLabel(accent),
        tone: accent === 'red' ? 'danger' : 'default',
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
        label: 'Overview',
        value: `${visibleOverviewSections}/3 Sections`,
        tone: visibleOverviewSections === 3 ? 'success' : 'warning',
      },
    ],
    [accent, density, reduceMotion, visibleOverviewSections]
  )

  function handleSave() {
    const savedUi = writeAdminUiPreferences({
      accent,
      density,
      reduceMotion,
      compactCards,
    })
    const savedOverview = writeAdminOverviewPreferences({
      showSummaryCards,
      showRecentUsers,
      showLatestDevices,
    })

    applyAdminUiPreferences(savedUi)
    writeLanguage(language)
    broadcastAdminSettingsChanged({
      ui: savedUi,
      overview: savedOverview,
    })

    showAdminToast({
      type: 'success',
      title: languageText(language, 'บันทึกการตั้งค่าแล้ว', 'Admin settings saved'),
      message: languageText(
        language,
        'บันทึกการตั้งค่า Admin Console เรียบร้อย',
        'Admin Console settings were saved successfully.'
      ),
    })
  }

  return (
    <section className="admin-page admin-settings-page">
      <PageHeader
        eyebrow="System Settings"
        title="Settings"
        description="ตั้งค่าการแสดงผล Accent Color และพฤติกรรมของ dotWatch Admin Console"
        actions={
          <button type="button" className="primary-button" onClick={handleSave}>
            Save Settings
          </button>
        }
      />

      <section className="admin-stat-grid admin-settings-stat-grid">
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

      <section className="admin-settings-list">
        <article className="admin-panel admin-settings-card admin-interface-preferences-card">
          <SectionHeader
            title="Interface Preferences"
            description="เลือกสีหลักของ Admin Console โดยไม่กระทบปุ่ม Dark / Light Theme บน Top Header"
          />

          <div className="admin-settings-interface-field">
            <label htmlFor="admin-accent">
              <strong>Accent Color</strong>
              <span>เลือกสีหลักที่ใช้กับปุ่ม กราฟ และสถานะสำคัญของ Admin Console</span>
            </label>
            <UnifiedSelect
              id="admin-accent"
              value={accent}
              aria-label="Admin accent color"
              onChange={(event) => setAccent(event.target.value)}
            >
              {ACCENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} data-swatch={option.color}>
                  {option.label}
                </option>
              ))}
            </UnifiedSelect>
          </div>

          <div className="admin-settings-interface-field">
            <label htmlFor="admin-language">
              <strong>{languageText(language, 'ภาษา', 'Language')}</strong>
              <span>
                {languageText(
                  language,
                  'เลือกภาษาที่ใช้ใน Admin Console ระบบจะจำค่าไว้ใน Browser นี้',
                  'Choose the Admin Console language. This browser will remember your selection.'
                )}
              </span>
            </label>
            <UnifiedSelect
              id="admin-language"
              value={language}
              aria-label={languageText(language, 'ภาษา Admin', 'Admin language')}
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

          <div className="admin-settings-preference-group">
            <div className="admin-settings-preference-group-header">
              <strong>Interface Density</strong>
              <span>เลือกความหนาแน่นของ UI ให้เหมาะกับขนาดหน้าจอและจำนวนข้อมูล</span>
            </div>

            <div className="admin-settings-option-grid">
              {DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`admin-settings-density-option ${
                    density === option.value ? 'active' : ''
                  }`}
                  onClick={() => setDensity(option.value)}
                  aria-pressed={density === option.value}
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-settings-preference-group">
            <div className="admin-settings-preference-group-header">
              <strong>Product UX</strong>
              <span>ตั้งค่าพฤติกรรมของ Admin Console สำหรับเครื่องที่ใช้งานอยู่</span>
            </div>

            <div className="admin-settings-toggle-list">
              <label className="admin-settings-toggle-item">
                <div>
                  <strong>Compact Stat Cards</strong>
                  <span>ลดความสูงของ StatCard เพื่อแสดงข้อมูลได้มากขึ้น</span>
                </div>
                <input
                  type="checkbox"
                  checked={compactCards}
                  onChange={(event) => setCompactCards(event.target.checked)}
                />
              </label>

              <label className="admin-settings-toggle-item">
                <div>
                  <strong>Reduce Motion</strong>
                  <span>ลด Animation และ Transition เพื่อประหยัดทรัพยากร</span>
                </div>
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(event) => setReduceMotion(event.target.checked)}
                />
              </label>
            </div>
          </div>
        </article>

        <article className="admin-panel admin-settings-card">
          <SectionHeader
            title="Admin Overview Display"
            description="เลือกส่วนที่ต้องการให้แสดงในหน้า Overview ของ Admin"
          />

          <div className="admin-settings-toggle-list">
            <label className="admin-settings-toggle-item">
              <div>
                <strong>Platform Summary</strong>
                <span>แสดง StatCard สรุป Users และ Devices ทั้งระบบ</span>
              </div>
              <input
                type="checkbox"
                checked={showSummaryCards}
                onChange={(event) =>
                  setShowSummaryCards(event.target.checked)
                }
              />
            </label>

            <label className="admin-settings-toggle-item">
              <div>
                <strong>Recent Users</strong>
                <span>แสดงรายการ User ล่าสุดและ Database Usage</span>
              </div>
              <input
                type="checkbox"
                checked={showRecentUsers}
                onChange={(event) =>
                  setShowRecentUsers(event.target.checked)
                }
              />
            </label>

            <label className="admin-settings-toggle-item">
              <div>
                <strong>Latest Devices</strong>
                <span>แสดงรายการ Device ล่าสุดจากทุก User</span>
              </div>
              <input
                type="checkbox"
                checked={showLatestDevices}
                onChange={(event) =>
                  setShowLatestDevices(event.target.checked)
                }
              />
            </label>
          </div>
        </article>

        <article className="admin-panel admin-settings-card admin-settings-system-card">
          <SectionHeader
            title="System"
            description="ข้อมูลระบบ Admin Console ปัจจุบัน"
          />

          <div className="admin-settings-system-list">
            <div>
              <span>Platform</span>
              <strong>dotWatch Admin</strong>
            </div>
            <div>
              <span>Signed-in Admin</span>
              <strong>
                {adminUser?.email || adminUser?.displayName || 'Authenticated admin'}
              </strong>
            </div>
            <div>
              <span>API URL</span>
              <strong title={ADMIN_API_URL}>{ADMIN_API_URL}</strong>
            </div>
            <div>
              <span>Theme Control</span>
              <strong>Top Header Toggle</strong>
            </div>
            <div>
              <span>Preference Storage</span>
              <strong>Local Browser Storage</strong>
            </div>
            <div>
              <span>Settings Event</span>
              <strong>{ADMIN_SETTINGS_EVENT}</strong>
            </div>
          </div>
        </article>
      </section>
    </section>
  )
}

export default AdminSettings
