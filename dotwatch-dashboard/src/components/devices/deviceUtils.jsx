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
  return device?.model_name || device?.model_key || 'Unknown Model'
}
