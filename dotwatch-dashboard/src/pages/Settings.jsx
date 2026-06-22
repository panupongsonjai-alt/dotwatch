import React, { useEffect, useState } from 'react'

function Settings() {
  const [refreshInterval, setRefreshInterval] = useState('5000')
  const [showDeviceOverview, setShowDeviceOverview] = useState(true)
  const [showDeviceMap, setShowDeviceMap] = useState(true)

  useEffect(() => {
    setRefreshInterval(localStorage.getItem('refreshInterval') || '5000')
    setShowDeviceOverview(
      localStorage.getItem('showDeviceOverview') !== 'false'
    )
    setShowDeviceMap(localStorage.getItem('showDeviceMap') !== 'false')
  }, [])

  function handleSave() {
    localStorage.setItem('refreshInterval', refreshInterval)
    localStorage.setItem('showDeviceOverview', String(showDeviceOverview))
    localStorage.setItem('showDeviceMap', String(showDeviceMap))
    window.dispatchEvent(new Event('dashboardSettingsChanged'))
    alert('บันทึกการตั้งค่าเรียบร้อย')
  }

  return (
    <div className="page app-page settings-page">
      <section className="app-page-header">
        <div>
          <span className="page-eyebrow">System</span>
          <h2>Settings</h2>
          <p>ตั้งค่าระบบ การรีเฟรชข้อมูล และการแสดงผล Dashboard</p>
        </div>

        <div className="app-page-actions">
          <button type="button" className="primary-button" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </section>

      <section className="app-card settings-panel">
        <div className="app-section-title">
          <h3>General</h3>
          <p>กำหนดค่าการทำงานพื้นฐานของ Dashboard</p>
        </div>

        <div className="app-form-grid">
          <label>
            Refresh Interval
            <select
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(event.target.value)}
            >
              <option value="3000">3 seconds</option>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds</option>
              <option value="30000">30 seconds</option>
            </select>
          </label>
        </div>
      </section>

      <section className="app-card settings-panel">
        <div className="app-section-title">
          <h3>Dashboard Display</h3>
          <p>เลือกส่วนที่ต้องการแสดงบนหน้า Dashboard</p>
        </div>

        <div className="app-toggle-list">
          <label className="app-toggle-item">
            <div>
              <strong>Devices Overview</strong>
              <span>แสดงการ์ดอุณหภูมิและความชื้นของอุปกรณ์</span>
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
    </div>
  )
}

export default Settings
