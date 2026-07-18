export interface DeviceMetric {
  id?: number | string;
  device_id?: number | string;
  metric_key: string;
  source_key?: string | null;
  metric_name: string;
  metric_type?: string | null;
  unit: string;
  icon?: string | null;
  visible: boolean;
  sort_order: number;
  decimal_places: number;
}

export interface DeviceMetricSettings {
  record_interval_seconds?: number;
}

export interface DeviceMetricsResponse {
  metrics?: unknown[];
  settings?: DeviceMetricSettings;
  data?: {
    metrics?: unknown[];
    settings?: DeviceMetricSettings;
  };
}
