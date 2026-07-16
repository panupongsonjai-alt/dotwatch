import { apiRequest } from './client';
import type { HistoryPoint, HistoryRange } from '@/types/history';
const MS: Record<HistoryRange, number> = { '1h':3600000,'6h':21600000,'24h':86400000,'7d':604800000 };
const RES: Record<HistoryRange, string> = { '1h':'raw','6h':'raw','24h':'5m','7d':'30m' };
export async function getMetricHistory({deviceId,metricKey,range}:{deviceId:number|string;metricKey:string;range:HistoryRange;}):Promise<HistoryPoint[]> {
  const to=new Date(); const from=new Date(to.getTime()-MS[range]);
  const q=new URLSearchParams({metricKey,from:from.toISOString(),to:to.toISOString(),resolution:RES[range],limit:'300'});
  return apiRequest<HistoryPoint[]>(`/api/devices/${encodeURIComponent(String(deviceId))}/history?${q}`);
}
