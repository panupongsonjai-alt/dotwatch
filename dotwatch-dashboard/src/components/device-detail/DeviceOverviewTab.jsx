import { lazy, Suspense } from 'react'
import { SectionHeader } from '../common'
import DeviceInfoGrid from './DeviceInfoGrid'
import { formatShortTime, getDeviceHealthLabel } from './deviceDetailUtils'

const ChartWidget = lazy(() => import('../ChartWidget.jsx'))

function ChartLoading() {
  return (
    <section className="panel app-card device-chart-loading-ds">
      <SectionHeader
        title="Realtime Trend"
        description="กำลังโหลดกราฟข้อมูลย้อนหลัง"
      />
      <div className="app-empty-state">
        <h3>Loading chart...</h3>
        <p>กำลังเตรียมข้อมูลกราฟสำหรับ Device นี้</p>
      </div>
    </section>
  )
}

function DeviceOverviewTab({ device, deviceId }) {
  return (
    <div className="device-detail-tab-panel">
      <section className={`device-health-banner-ds ${device.status || 'offline'}`}>
        <div className="device-health-dot-ds" />
        <div>
          <strong>{getDeviceHealthLabel(device.status)}</strong>
          <p>
            {device.status === 'online'
              ? 'Device is sending telemetry normally.'
              : 'No fresh telemetry has been received from this device.'}
          </p>
        </div>
        <span>Last ingest: {formatShortTime(device.last_ingest_at)}</span>
      </section>

      <section className="panel app-card device-overview-grid-card-ds">
        <SectionHeader
          title="Overview"
          description="ภาพรวมสถานะและข้อมูลล่าสุดของ Device นี้"
        />
        <DeviceInfoGrid device={device} />
      </section>

      <Suspense fallback={<ChartLoading />}>
        <ChartWidget defaultDeviceId={deviceId} />
      </Suspense>
    </div>
  )
}

export default DeviceOverviewTab
