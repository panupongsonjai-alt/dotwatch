import { SectionHeader } from '../common'
import DeviceInfoGrid from './DeviceInfoGrid'

function DeviceInformationTab({ device }) {
  return (
    <section className="panel app-card device-info-panel-ds device-detail-tab-panel">
      <SectionHeader
        title="Device Information"
        description="รายละเอียดอุปกรณ์และตำแหน่งติดตั้ง"
      />
      <DeviceInfoGrid device={device} />
    </section>
  )
}

export default DeviceInformationTab
