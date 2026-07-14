import { apiRequest } from './client';
import type {
  Device,
  DeviceListResponse,
  DeviceResponse
} from '@/types/device';

function normalizeDeviceList(payload: Device[] | DeviceListResponse): Device[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.devices)) return payload.devices;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export async function listDevices(): Promise<Device[]> {
  const payload = await apiRequest<Device[] | DeviceListResponse>('/api/devices');
  return normalizeDeviceList(payload);
}

export async function getDevice(id: string): Promise<Device> {
  const payload = await apiRequest<Device | DeviceResponse>(
    `/api/devices/${encodeURIComponent(id)}`
  );

  if ('device' in payload && payload.device) return payload.device;
  if ('data' in payload && payload.data) return payload.data;
  return payload as Device;
}
