import React, { useEffect, useState } from 'react'
import { PageHeader, SectionHeader, StatCard } from '../components/common'

function Settings() {
  const [showDeviceOverview, setShowDeviceOverview] = useState(true)
  const [showDeviceMap, setShowDeviceMap] = useState(true)

  useEffect(() => {
    setShowDeviceOverview(localStorage.getItem('showDeviceOverview') !== 'false')
    setShowDeviceMap(localStorage.getItem('showDeviceMap') !== 'false')
  }, [])

  function handleSave() {
    localStorage.setItem('showDeviceOverview', String(showDeviceOverview))
    localStorage.setItem('showDeviceMap', String(showDeviceMap))
    window.dispatchEvent(new Event('dashboardSettingsChanged'))
    alert('บันทึกการตั้งค่าเรียบร้อย')
  }

  return (
    <div className="page app-page settings-page settings-v3-page">
      <PageHeader
        eyebrow="System Control"
        title="Settings"
        description="ตั้งค่าการแสดงผล Dashboard และพฤติกรรมพื้นฐานของระบบ dotWatch"
        meta={
          <>
            <span>Dashboard Display</span>
            <span>Local Preferences</span>
          </>
        }
        actions={
          <button type="button" className="primary-button" onClick={handleSave}>
            Save Settings
          </button>
        }
      />

      <section className="settings-v3-stat-grid">
        <StatCard
          label="Device Overview"
          value={showDeviceOverview ? 'On' : 'Off'}
          hint="Dashboard section"
          tone={showDeviceOverview ? 'success' : 'default'}
        />
        <StatCard
          label="Device Map"
          value={showDeviceMap ? 'On' : 'Off'}
          hint="Location visibility"
          tone={showDeviceMap ? 'success' : 'default'}
        />
        <StatCard label="Theme" value="Auto" hint="Using app theme" />
        <StatCard label="Storage" value="Local" hint="Browser preferences" />
      </section>

      <section className="settings-v3-grid">
        <section className="app-card settings-panel">
          <SectionHeader
            title="Dashboard Display"
            description="เลือกส่วนที่ต้องการแสดงบนหน้า Dashboard"
          />

          <div className="app-toggle-list settings-v3-toggle-list">
            <label className="app-toggle-item">
              <div>
                <strong>Devices Overview</strong>
                <span>แสดงการ์ดค่าล่าสุดของอุปกรณ์ทั้งหมด</span>
              </div>
              <input
                type="checkbox"
                checked={showDeviceOverview}
                onChange={(event) => setShowDeviceOverview(event.target.checked)}
              />
            </label>

            <label className="app-toggle-item">
              <div>
                <strong>Device Map</strong>
                <span>แสดงตำแหน่งอุปกรณ์บนแผนที่</span>
              </div>
              <input
                type="checkbox"
                checked={showDeviceMap}
                onChange={(event) => setShowDeviceMap(event.target.checked)}
              />
            </label>
          </div>
        </section>

        <aside className="app-card settings-v3-help-card">
          <SectionHeader
            title="Preference Scope"
            description="การตั้งค่านี้ถูกบันทึกไว้ใน Browser เครื่องนี้"
          />
          <div className="settings-v3-help-list">
            <div>
              <strong>Realtime Safe</strong>
              <span>ไม่กระทบการรับข้อมูลจาก Device</span>
            </div>
            <div>
              <strong>Dashboard Only</strong>
              <span>มีผลเฉพาะการแสดงผลบน Dashboard</span>
            </div>
            <div>
              <strong>Instant Apply</strong>
              <span>ระบบจะส่ง event ให้ Dashboard อัปเดตทันที</span>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}

export default Settings
