export interface AlarmEvent {
  id: number | string;
  device_id: number | string;
  device_code?: string;
  device_name?: string;
  metric?: string;
  metric_name?: string;
  unit?: string;
  operator?: string;
  threshold?: number | string | null;
  value?: number | string | null;
  current_value?: number | string | null;
  severity?: string;
  status?: string;
  state?: string;
  notification_message?: string | null;
  triggered_at?: string | null;
  acknowledged_at?: string | null;
  updated_at?: string | null;
}
export interface AlarmSummary {
  active: number; warning: number; critical: number;
  total_events: number; active_events: number;
  acknowledged_events: number; resolved_events: number;
}
