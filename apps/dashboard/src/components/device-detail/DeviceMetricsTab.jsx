import { EmptyState, MetricCard, SectionHeader } from '../common'
import {
  formatMetricNumber,
  getMetricIcon,
  getMetricValueFromDevice,
} from './deviceDetailUtils'

function DeviceMetricsTab({ device, visibleMetrics, metricSummary }) {
  return (
    <div className="device-detail-tab-panel">
      <section className="panel app-card device-overview-grid-card-ds device-detail-unified-card device-metrics-panel-ds">
        <SectionHeader
          title="Live Metrics"
          description="ค่าล่าสุดจาก Device ตาม Metric Config"
          actions={
            <span className="device-detail-section-badge">
              {metricSummary.active} active • {metricSummary.empty} empty
            </span>
          }
        />

        {visibleMetrics.length === 0 ? (
          <EmptyState
            title="ยังไม่มี Metric"
            description="ไปที่หน้า Device เพื่อกำหนด Metric Display ก่อน"
          />
        ) : (
          <div className="device-metrics-ds-grid device-detail-content-grid">
            {visibleMetrics.map((metric) => {
              const value = getMetricValueFromDevice(device, metric)

              return (
                <MetricCard
                  key={metric.metric_key}
                  name={metric.metric_name || metric.metric_key}
                  value={formatMetricNumber(value)}
                  unit={metric.unit}
                  icon={getMetricIcon(metric)}
                  metricKey={metric.metric_key}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default DeviceMetricsTab
