import { MetricIcon } from '../utils/../utils/metricIcons.jsx'
import {
  formatMetricValue,
  getVisibleMetrics,
} from '../utils/metricDisplayConfig'

export default function MetricValueList({ device, metrics = [] }) {
  const visibleMetrics = getVisibleMetrics(metrics)

  if (!visibleMetrics.length) {
    return null
  }

  return (
    <div className="metric-value-list">
      {visibleMetrics.map((metric) => (
        <div className="metric-value-item" key={metric.metric_key}>
          <MetricIcon name={metric.icon} size={16} />
          <div>
            <span>{metric.metric_name}</span>
            <strong>{formatMetricValue(device, metric)}</strong>
          </div>
        </div>
      ))}
    </div>
  )
}
