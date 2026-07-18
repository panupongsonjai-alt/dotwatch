import { apiRequest } from './client';
import type {
  DeviceMetricSettings,
  DeviceMetricsResponse
} from '@/types/metric';
import type { DeviceMetric } from '@/types/metric';
import { normalizeDeviceMetrics } from '@/utils/metric';

export interface DeviceMetricsResult {
  metrics: DeviceMetric[];
  settings: DeviceMetricSettings;
}

export async function getDeviceMetrics(
  deviceId: number | string
): Promise<DeviceMetricsResult> {
  const payload = await apiRequest<DeviceMetricsResponse>(
    `/api/devices/${encodeURIComponent(String(deviceId))}/metrics`
  );
  const source = payload.data ?? payload;
  const rawMetrics = Array.isArray(source.metrics) ? source.metrics : [];

  return {
    metrics: normalizeDeviceMetrics(rawMetrics),
    settings: source.settings || {}
  };
}
