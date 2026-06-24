import { useEffect, useMemo, useState } from 'react'
import { PageHeader, SectionHeader, StatCard } from '../components/common'

const ACCENT_OPTIONS = [
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'emerald', label: 'Emerald', color: '#10b981' },
  { value: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { value: 'red', label: 'dotWatch Red', color: '#ef4444' },
]

const DENSITY_OPTIONS = [
  {
    value: 'comfortable',
    label: 'Comfortable',
    description: 'ระยะห่างมาตรฐาน อ่านง่าย เหมาะกับการใช้งานทั่วไป',
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'ลดระยะห่าง เพื่อแสดงข้อมูลได้มากขึ้นในหน้าจอเดียว',
  },
]

function applyUiSettings({ accent, density, reduceMotion, compactCards }) {
  const root = document.documentElement

  root.setAttribute('data-accent', accent)
  root.setAttribute('data-density', density)
  root.setAttribute('data-reduce-motion', reduceMotion ? 'true' : 'false')
  root.setAttribute('data-compact-cards', compactCards ? 'true' : 'false')
}

function Settings() {
  const [showDeviceOverview, setShowDeviceOverview] = useState(true)
  const [showDeviceMap, setShowDeviceMap] = useState(true)
  const [accent, setAccent] = useState('blue')
  const [density, setDensity] = useState('comfortable')
  const [reduceMotion, setReduceMotion] = useState(false)
  const [compactCards, setCompactCards] = useState(false)

  useEffect(() => {
    const nextAccent = localStorage.getItem('dotwatchAccent') || 'blue'
    const nextDensity = localStorage.getItem('dotwatchDensity') || 'comfortable'
    const nextReduceMotion =
      localStorage.getItem('dotwatchReduceMotion') === 'true'

    setShowDeviceOverview(localStorage.getItem('showDeviceOverview') !== 'false')
    setShowDeviceMap(localStorage.getItem('showDeviceMap') !== 'false')
    setAccent(nextAccent)
    setDensity(nextDensity)
    setReduceMotion(nextReduceMotion)
    setCompactCards(localStorage.getItem('dotwatchCompactCards') === 'true')

    applyUiSettings({
      accent: nextAccent,
      density: nextDensity,
      reduceMotion: nextReduceMotion,
      compactCards: localStorage.getItem('dotwatchCompactCards') === 'true',
    })
  }, [])

  const settingsSummary = useMemo(
    () => [
      {
        label: 'Accent',
        value:
          ACCENT_OPTIONS.find((item) => item.value === accent)?.label || 'Blue',
        tone: 'default',
      },
      {
        label: 'Density',
        value: density === 'compact' ? 'Compact' : 'Comfortable',
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
          [showDeviceOverview && 'Overview', showDeviceMap && 'Map']
            .filter(Boolean)
            .join(' + ') || 'Minimal',
        tone: 'success',
      },
    ],
    [accent, density, reduceMotion, showDeviceOverview, showDeviceMap]
  )

  function handleSave() {
    localStorage.setItem('showDeviceOverview', String(showDeviceOverview))
    localStorage.setItem('showDeviceMap', String(showDeviceMap))
    localStorage.setItem('dotwatchAccent', accent)
    localStorage.setItem('dotwatchDensity', density)
    localStorage.setItem('dotwatchReduceMotion', String(reduceMotion))
    localStorage.setItem('dotwatchCompactCards', String(compactCards))

    applyUiSettings({ accent, density, reduceMotion, compactCards })

    window.dispatchEvent(new Event('dashboardSettingsChanged'))
    window.dispatchEvent(new Event('dotwatchUiSettingsChanged'))

    alert('บันทึกการตั้งค่าเรียบร้อย')
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
              description="Theme ให้ใช้ปุ่มไอคอนด้านบนเป็นจุดเดียว ส่วนนี้ใช้สำหรับปรับ Accent Color และความแน่นของ UI"
            />

            <div className="settings-v3-accent-grid">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`settings-v3-accent ${
                    accent === option.value ? 'active' : ''
                  }`}
                  onClick={() => setAccent(option.value)}
                >
                  <span style={{ background: option.color }} />
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="app-card settings-v3-card">
            <SectionHeader
              title="Dashboard Display"
              description="เลือก Widget ที่ต้องการแสดงบนหน้า Dashboard"
            />

            <div className="settings-v3-toggle-list">
              <label className="settings-v3-toggle-item">
                <div>
                  <strong>Devices Overview</strong>
                  <span>แสดงการ์ดค่าล่าสุดของอุปกรณ์ทั้งหมดใน Dashboard</span>
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
                  <span>แสดงตำแหน่งอุปกรณ์บนแผนที่ใน Dashboard</span>
                </div>
                <input
                  type="checkbox"
                  checked={showDeviceMap}
                  onChange={(event) => setShowDeviceMap(event.target.checked)}
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
                <strong>Phase 21</strong>
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
