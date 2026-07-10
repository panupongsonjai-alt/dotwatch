import { EmptyState, MetricCard, SectionHeader } from '../common'
import { getVisibleMetricsForDevice } from '../../utils/esp32Dht3Utils.js'
import { MetricIcon } from '../../utils/metricIcons.jsx'
import {
  formatMetricNumber,
  getMetricValueFromDevice,
} from './deviceDetailUtils'

function DeviceMetricsTab({ device, visibleMetrics, metricSummary }) {
  const effectiveVisibleMetrics = getVisibleMetricsForDevice(
    device,
    visibleMetrics
  )
  const effectiveMetricSummary = {
    active: effectiveVisibleMetrics.length,
    empty: Math.max(0, Number(metricSummary?.empty || 0)),
  }

  return (
    <div className="device-detail-tab-panel">
      <section className="panel app-card device-overview-grid-card-ds device-detail-unified-card device-metrics-panel-ds">
        <SectionHeader
          title="Live Metrics"
          description="à¸„à¹ˆà¸²à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸ˆà¸²à¸ Device à¸•à¸²à¸¡ Metric Config"
          actions={
            <span className="device-detail-section-badge">
              {effectiveMetricSummary.active} active â€¢ {effectiveMetricSummary.empty} empty
            </span>
          }
        />

        {effectiveVisibleMetrics.length === 0 ? (
          <EmptyState
            title="à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ Metric"
            description="à¹„à¸›à¸—à¸µà¹ˆà¸«à¸™à¹‰à¸² Device à¹€à¸žà¸·à¹ˆà¸­à¸à¸³à¸«à¸™à¸” Metric Display à¸à¹ˆà¸­à¸™"
          />
        ) : (
          <div className="device-metrics-ds-grid device-detail-content-grid">
            {effectiveVisibleMetrics.map((metric) => {
              const value = getMetricValueFromDevice(device, metric)

              return (
                <MetricCard
                  key={metric.metric_key}
                  name={metric.metric_name || metric.metric_key}
                  value={formatMetricNumber(value)}
                  unit={metric.unit}
                  icon={
                    <MetricIcon
                      name={metric.icon}
                      size={18}
                      strokeWidth={2.25}
                    />
                  }
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




