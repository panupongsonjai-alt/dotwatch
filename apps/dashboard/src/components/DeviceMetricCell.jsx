import { useDeviceMetrics } from '../hooks/useDeviceMetrics'
import MetricValueList from './MetricValueList'

export default function DeviceMetricCell({ device }) {
  const { metrics, loading } = useDeviceMetrics(device.id)

  if (loading) {
    return <span className="muted-text">Loading metrics...</span>
  }

  return <MetricValueList device={device} metrics={metrics} />
}
