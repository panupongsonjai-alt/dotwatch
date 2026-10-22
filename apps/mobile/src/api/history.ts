import { apiRequest } from './client';
import type { HistoryPoint, HistoryRange } from '@/types/history';

const MS: Record<HistoryRange, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000
};

// Keep every range under the request limit below so the newest points are
// never cut off (6h of raw 10 s data is 2,160 rows).
const RESOLUTION: Record<HistoryRange, string> = {
  '1h': 'raw',
  '6h': '1m',
  '24h': '5m',
  '7d': '30m'
};

interface HistoryResponse {
  data?: HistoryPoint[];
  history?: HistoryPoint[];
  rows?: HistoryPoint[];
}

function normalizeHistory(
  payload: HistoryPoint[] | HistoryResponse
): HistoryPoint[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.history)) return payload.history;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

export async function getMetricHistory({
  deviceId,
  metricKey,
  range
}: {
  deviceId: number | string;
  metricKey: string;
  range: HistoryRange;
}): Promise<HistoryPoint[]> {
  const to = new Date();
  const from = new Date(to.getTime() - MS[range]);
  const query = new URLSearchParams({
    metricKey,
    from: from.toISOString(),
    to: to.toISOString(),
    resolution: RESOLUTION[range],
    limit: '500'
  });
  const payload = await apiRequest<HistoryPoint[] | HistoryResponse>(
    `/api/devices/${encodeURIComponent(String(deviceId))}/history?${query}`
  );

  return normalizeHistory(payload);
}
