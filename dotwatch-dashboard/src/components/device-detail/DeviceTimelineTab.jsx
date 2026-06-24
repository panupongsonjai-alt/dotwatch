import { SectionHeader } from '../common'
import { formatDate, formatShortTime } from './deviceDetailUtils'

function DeviceTimelineTab({ timeline }) {
  return (
    <section className="panel app-card device-timeline-panel-ds device-detail-tab-panel">
      <SectionHeader
        title="Device Timeline"
        description="เหตุการณ์ล่าสุดที่เกี่ยวข้องกับ Device นี้"
        actions={
          <span className="device-live-count-ds">{timeline.length} events</span>
        }
      />

      <div className="device-timeline-list-ds">
        {timeline.map((item) => (
          <article
            key={item.id}
            className={`device-timeline-item-ds ${item.tone}`}
          >
            <div className="device-timeline-dot-ds" />
            <div className="device-timeline-content-ds">
              <div className="device-timeline-title-row-ds">
                <h3>{item.title}</h3>
                <time>{formatShortTime(item.time)}</time>
              </div>
              <p>{item.description}</p>
              <small>{formatDate(item.time)}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default DeviceTimelineTab
