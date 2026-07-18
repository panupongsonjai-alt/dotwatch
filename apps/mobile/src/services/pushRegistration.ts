import { unregisterPushToken } from '@/api/pushNotifications';
import {
  clearStoredExpoPushToken,
  getStoredExpoPushToken
} from '@/services/notifications';

export interface PushCleanupResult {
  hadStoredToken: boolean;
  unregistered: boolean;
}

export async function unregisterStoredPushToken(): Promise<PushCleanupResult> {
  const token = await getStoredExpoPushToken();

  if (!token) {
    return {
      hadStoredToken: false,
      unregistered: false
    };
  }

  await unregisterPushToken(token);
  await clearStoredExpoPushToken();

  return {
    hadStoredToken: true,
    unregistered: true
  };
}
