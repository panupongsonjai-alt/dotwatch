import { apiRequest } from './client'

export interface PushStatus {
  activeTokens: number
}

export function registerPushToken(input: {
  token: string
  platform: string
  deviceName?: string
}) {
  return apiRequest('/api/mobile-push/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function unregisterPushToken(token: string) {
  return apiRequest('/api/mobile-push/unregister', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export function getPushStatus(): Promise<PushStatus> {
  return apiRequest<PushStatus>('/api/mobile-push/status')
}
