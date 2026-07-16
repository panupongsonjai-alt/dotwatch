export interface HistoryPoint {
  time?: string; bucket_time?: string; metric_key?: string;
  value?: number | string | null; avg_value?: number | string | null;
  min_value?: number | string | null; max_value?: number | string | null;
  sample_count?: number | string | null;
}
export type HistoryRange = '1h' | '6h' | '24h' | '7d';
