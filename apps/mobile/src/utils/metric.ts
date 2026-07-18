import type { Device } from '@/types/device';
import type { DeviceMetric } from '@/types/metric';

const DEFAULT_DECIMAL_PLACES = 2;

function normalizeKey(value: unknown): string {
  return String(value || '').trim();
}

function humanizeMetricKey(metricKey: string): string {
  return metricKey
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeDeviceMetric(
  raw: unknown,
  index: number
): DeviceMetric | null {
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as Record<string, unknown>;
  const metricKey = normalizeKey(source.metric_key ?? source.key);

  if (!metricKey) return null;

  const metricName =
    normalizeKey(source.metric_name ?? source.name) ||
    humanizeMetricKey(metricKey);
  const decimalPlacesRaw = Number(
    source.decimal_places ?? source.decimalPlaces
  );
  const sortOrderRaw = Number(source.sort_order ?? source.sortOrder);

  return {
    id:
      typeof source.id === 'number' || typeof source.id === 'string'
        ? source.id
        : undefined,
    device_id:
      typeof source.device_id === 'number' ||
      typeof source.device_id === 'string'
        ? source.device_id
        : undefined,
    metric_key: metricKey,
    source_key: normalizeKey(source.source_key ?? source.sourceKey) || null,
    metric_name: metricName,
    metric_type: normalizeKey(source.metric_type ?? source.type) || null,
    unit: normalizeKey(source.unit),
    icon: normalizeKey(source.icon) || null,
    visible: source.visible !== false,
    sort_order: Number.isFinite(sortOrderRaw) ? sortOrderRaw : index + 1,
    decimal_places: Number.isInteger(decimalPlacesRaw)
      ? Math.min(6, Math.max(0, decimalPlacesRaw))
      : DEFAULT_DECIMAL_PLACES
  };
}

export function normalizeDeviceMetrics(rawMetrics: unknown[]): DeviceMetric[] {
  return rawMetrics
    .map(normalizeDeviceMetric)
    .filter((metric): metric is DeviceMetric => metric !== null)
    .sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }

      return left.metric_name.localeCompare(right.metric_name);
    });
}

export function deriveMetricsFromLatest(device: Device): DeviceMetric[] {
  const metrics = device.latest_metrics;

  if (!metrics || typeof metrics !== 'object') return [];

  return Object.keys(metrics)
    .filter((key) => {
      const value = Number(metrics[key]);
      return Number.isFinite(value);
    })
    .map((metricKey, index) => ({
      metric_key: metricKey,
      source_key: metricKey,
      metric_name: humanizeMetricKey(metricKey),
      metric_type: 'custom',
      unit: '',
      visible: true,
      sort_order: index + 1,
      decimal_places: DEFAULT_DECIMAL_PLACES
    }));
}

export function getMetricLatestValue(
  device: Device,
  metric: DeviceMetric
): number | null {
  const latest = device.latest_metrics;

  if (!latest || typeof latest !== 'object') return null;

  const keys = [metric.metric_key, metric.source_key]
    .map((value) => normalizeKey(value))
    .filter(Boolean);

  for (const key of keys) {
    const value = Number(latest[key]);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}
