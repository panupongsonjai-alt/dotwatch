export type DeviceStatus = 'online' | 'warning' | 'critical' | 'offline' | string;

export interface Device {
  id: number | string;
  device_code?: string;
  name?: string;
  status?: DeviceStatus;
  last_seen_at?: string | null;
  last_ingest_at?: string | null;
  latest_time?: string | null;
  latest_metrics?: Record<string, unknown> | null;
  model_key?: string | null;
  model_name?: string | null;
  firmware_version?: string | null;
}

export interface DeviceListResponse {
  data?: Device[];
  devices?: Device[];
}

export interface DeviceResponse {
  data?: Device;
  device?: Device;
}
