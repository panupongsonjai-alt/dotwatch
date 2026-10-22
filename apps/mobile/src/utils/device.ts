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

const REALTIME_DEVICE_FIELDS = [
  'status',
  'last_seen_at',
  'last_ingest_at',
  'latest_time',
  'latest_metrics',
  'firmware_version'
] as const;

export function getRealtimeDeviceId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const id = record.id ?? record.device_id ?? record.deviceId;
  return id == null ? null : String(id);
}

/**
 * Applies a realtime `reading` / `device:update` payload to a cached device
 * without refetching. The backend sends `reading` for every ingest, so
 * refetching the whole list per message would multiply API traffic.
 */
export function mergeRealtimeDevice(device: Device, data: unknown): Device {
  if (!data || typeof data !== 'object') return device;
  const record = data as Record<string, unknown>;
  const next: Record<string, unknown> = { ...device };

  for (const field of REALTIME_DEVICE_FIELDS) {
    if (field === 'latest_metrics') continue;
    if (record[field] !== undefined) next[field] = record[field];
  }

  const incoming =
    record.latest_metrics && typeof record.latest_metrics === 'object'
      ? (record.latest_metrics as Record<string, unknown>)
      : record.metrics && typeof record.metrics === 'object'
        ? (record.metrics as Record<string, unknown>)
        : null;

  if (incoming) {
    // A reading carries only the values in that payload; keep the others.
    // An empty object (device went offline) clears the values.
    next.latest_metrics =
      Object.keys(incoming).length === 0
        ? {}
        : { ...(device.latest_metrics || {}), ...incoming };
  }

  return next as unknown as Device;
}
