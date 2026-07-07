import {
  Activity,
  Battery,
  Cpu,
  Droplets,
  Gauge,
  Power,
  Thermometer,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react'

const ICON_MAP = {
  Activity,
  Thermometer,
  Droplets,
  Gauge,
  Zap,
  Battery,
  Wifi,
  Wind,
  Power,
  Cpu,
}

export const METRIC_ICON_OPTIONS = Object.keys(ICON_MAP)

export function MetricIcon({ name = 'Activity', size = 16 }) {
  const Icon = ICON_MAP[name] || Activity

  return <Icon size={size} />
}
