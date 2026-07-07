import { SectionHeader } from '../common'
import DeviceInfoGrid from './DeviceInfoGrid'

function DeviceOverviewTab({ device }) {
  return (
    <div className="device-detail-tab-panel">
      <section className="panel app-card device-overview-grid-card-ds device-detail-unified-card">
        <SectionHeader
          title="Overview"
          description="ภาพรวมสถานะและข้อมูลล่าสุดของ Device นี้"
        />
        <DeviceInfoGrid device={device} />
      </section>
    </div>
  )
}

export default DeviceOverviewTab
