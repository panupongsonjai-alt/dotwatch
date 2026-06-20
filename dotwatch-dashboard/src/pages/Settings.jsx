import React, { useState, useEffect } from 'react'

function Settings() {
  const [projectName, setProjectName] = useState('')
  const [refreshInterval, setRefreshInterval] = useState('5000')

  const [showDeviceOverview, setShowDeviceOverview] = useState(true)
  const [showDeviceMap, setShowDeviceMap] = useState(true)

  useEffect(() => {
    setProjectName(localStorage.getItem('projectName') || 'dotWatch')

    setRefreshInterval(localStorage.getItem('refreshInterval') || '5000')

    setShowDeviceOverview(
      localStorage.getItem('showDeviceOverview') !== 'false'
    )

    setShowDeviceMap(localStorage.getItem('showDeviceMap') !== 'false')
  }, [])

  const handleSave = () => {
    localStorage.setItem('projectName', projectName)

    localStorage.setItem('refreshInterval', refreshInterval)

    localStorage.setItem('showDeviceOverview', String(showDeviceOverview))

    localStorage.setItem('showDeviceMap', String(showDeviceMap))

    window.dispatchEvent(new Event('dashboardSettingsChanged'))

    alert('บันทึกการตั้งค่าเรียบร้อย')
  }

  return (
    <div className="page">
      <section className="panel settings-panel">
        <div className="section-title">
          <h2>Settings</h2>
          <p>ตั้งค่าระบบและการแสดงผล Dashboard</p>
        </div>

        <div className="settings-section">
          <h3>General</h3>

          <div className="form-grid">
            <label>
              Project Name
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="dotWatch"
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>Dashboard Display</h3>

          <div className="settings-toggle-list">
            <label className="settings-toggle-item">
              <div>
                <strong>Devices Overview</strong>

                <span>แสดงการ์ดอุณหภูมิและความชื้นของอุปกรณ์</span>
              </div>

              <input
                type="checkbox"
                checked={showDeviceOverview}
                onChange={(e) => setShowDeviceOverview(e.target.checked)}
              />
            </label>

            <label className="settings-toggle-item">
              <div>
                <strong>Device Map</strong>

                <span>แสดงตำแหน่งอุปกรณ์บนแผนที่</span>
              </div>

              <input
                type="checkbox"
                checked={showDeviceMap}
                onChange={(e) => setShowDeviceMap(e.target.checked)}
              />
            </label>
          </div>
        </div>

        <button className="primary-button" onClick={handleSave}>
          Save Settings
        </button>
      </section>
    </div>
  )
}

export default Settings
