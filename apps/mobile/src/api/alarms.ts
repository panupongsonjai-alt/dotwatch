import { apiRequest } from './client';
import type { AlarmEvent, AlarmSummary } from '@/types/alarm';
export const listAlarmEvents = () => apiRequest<AlarmEvent[]>('/api/alarms');
export const listActiveAlarms = () => apiRequest<AlarmEvent[]>('/api/alarms/active');
export const getAlarmSummary = () => apiRequest<AlarmSummary>('/api/alarms/summary');
export const acknowledgeAlarm = (id: number | string) =>
  apiRequest<AlarmEvent>(`/api/alarms/${encodeURIComponent(String(id))}/acknowledge`, { method: 'POST' });
