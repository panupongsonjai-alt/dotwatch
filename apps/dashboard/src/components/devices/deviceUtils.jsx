import { AlertTriangle, Wifi, WifiOff } from 'lucide-react'

export function getStatus(device) {
  return device?.status || 'offline'
}

export function getStatusLabel(status) {
  if (status === 'online') return 'Online'
  if (status === 'warning') return 'Warning'
  return 'Offline'
}

export function getStatusIcon(status) {
  if (status === 'online') return <Wifi size={15} />
  if (status === 'warning') return <AlertTriangle size={15} />
  return <WifiOff size={15} />
}

export function formatDate(value) {
  if (!value) return '--'

  try {
    return new Date(value).toLocaleString('th-TH')
  } catch {
    return value
  }
}

export function getLastSeen(device) {
  return formatDate(device?.latest_time || device?.last_seen_at)
}

export function getDeviceDisplayName(device) {
  return device?.name || device?.device_code || 'Unnamed Device'
}

export function getModelLabel(device) {
  const modelKey = String(device?.model_key || device?.modelKey || '')
    .trim()
    .toLowerCase()

  if (modelKey === 'esp32_dht3') return 'dot-TH-W1'
  if (modelKey === 'weather_api_demo') return 'dot-WT-W1'

  return device?.model_name || device?.modelName || device?.model_key || 'Unknown Model'
}
