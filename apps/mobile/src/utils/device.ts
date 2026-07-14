import type { Device, DeviceStatus } from '@/types/device';
import { theme } from '@/theme';

export function getDeviceName(device: Device): string {
  return device.name?.trim() || device.device_code?.trim() || `Device ${device.id}`;
}

export function getStatusColor(status?: DeviceStatus): string {
  switch (String(status || '').toLowerCase()) {
    case 'online':
      return theme.colors.success;
    case 'warning':
      return theme.colors.warning;
    case 'critical':
      return theme.colors.danger;
    default:
      return theme.colors.offline;
  }
}

export function getLatestMetric(
  device: Device,
  aliases: string[]
): number | null {
  const metrics = device.latest_metrics;

  if (!metrics || typeof metrics !== 'object') return null;

  for (const alias of aliases) {
    const raw = metrics[alias];
    const value =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : Number.NaN;

    if (Number.isFinite(value)) return value;
  }

  return null;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return 'ยังไม่มีข้อมูล';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ยังไม่มีข้อมูล';

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}
