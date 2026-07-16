import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PUSH_TOKEN_STORAGE_KEY = '@dotwatch/expo-push-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function requestExpoPushToken(): Promise<string> {
  if (!Device.isDevice) {
    throw new Error(
      'Push Notification ต้องทดสอบบนอุปกรณ์จริงหรือ Development Build'
    );
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'dotWatch Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250]
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    throw new Error('ไม่ได้รับสิทธิ์ Notification');
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error('ยังไม่ได้ตั้งค่า EAS projectId ใน app.json');
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId
    })
  ).data;

  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  return token;
}

export function getStoredExpoPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function clearStoredExpoPushToken(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}
