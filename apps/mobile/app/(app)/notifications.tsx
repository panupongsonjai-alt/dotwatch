import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import {
  getPushStatus,
  registerPushToken,
  unregisterPushToken
} from '@/api/pushNotifications';
import { Screen } from '@/components/Screen';
import {
  clearStoredExpoPushToken,
  getStoredExpoPushToken,
  requestExpoPushToken
} from '@/services/notifications';
import { theme } from '@/theme';

export default function NotificationsScreen() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['push-status'],
    queryFn: getPushStatus
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const token = await requestExpoPushToken();

      await registerPushToken({
        token,
        platform: Platform.OS,
        deviceName: Device.deviceName || Device.modelName || undefined
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['push-status'] });
    }
  });

  const unregisterMutation = useMutation({
    mutationFn: async () => {
      const token = await getStoredExpoPushToken();

      if (!token) {
        throw new Error('ไม่พบ Push Token ที่บันทึกไว้ในอุปกรณ์นี้');
      }

      await unregisterPushToken(token);
      await clearStoredExpoPushToken();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['push-status'] });
    }
  });

  const isBusy =
    registerMutation.isPending || unregisterMutation.isPending;

  return (
    <Screen>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>
        จัดการ Push Notification สำหรับ Alarm ของ dotWatch
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Registered devices</Text>
        <Text style={styles.value}>
          {statusQuery.data?.activeTokens ?? '--'}
        </Text>
      </View>

      <Pressable
        disabled={isBusy}
        onPress={() => registerMutation.mutate()}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.pressed,
          isBusy && styles.disabled
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {registerMutation.isPending
            ? 'กำลังลงทะเบียน...'
            : 'Enable Push Notifications'}
        </Text>
      </Pressable>

      <Pressable
        disabled={isBusy}
        onPress={() => unregisterMutation.mutate()}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.pressed,
          isBusy && styles.disabled
        ]}
      >
        <Text style={styles.secondaryButtonText}>
          {unregisterMutation.isPending
            ? 'กำลังปิด...'
            : 'Disable on this device'}
        </Text>
      </Pressable>

      {registerMutation.isSuccess ? (
        <Text style={styles.success}>
          ลงทะเบียน Push Token สำเร็จ
        </Text>
      ) : null}

      {unregisterMutation.isSuccess ? (
        <Text style={styles.success}>
          ปิด Push Notification บนอุปกรณ์นี้แล้ว
        </Text>
      ) : null}

      {registerMutation.isError ? (
        <Text style={styles.error}>
          {registerMutation.error.message}
        </Text>
      ) : null}

      {unregisterMutation.isError ? (
        <Text style={styles.error}>
          {unregisterMutation.error.message}
        </Text>
      ) : null}

      <Text style={styles.note}>
        Remote Push บน Android ต้องทดสอบผ่าน Development Build
        หรือ Release Build ไม่ใช่ Expo Go
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 4,
    marginBottom: theme.spacing.lg,
    color: theme.colors.textMuted
  },
  card: {
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface
  },
  label: {
    color: theme.colors.textMuted
  },
  value: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800'
  },
  primaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontWeight: '800'
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.sm
  },
  secondaryButtonText: {
    color: theme.colors.danger,
    fontWeight: '800'
  },
  pressed: {
    opacity: 0.8
  },
  disabled: {
    opacity: 0.5
  },
  success: {
    marginTop: theme.spacing.md,
    color: theme.colors.success
  },
  error: {
    marginTop: theme.spacing.md,
    color: theme.colors.danger
  },
  note: {
    marginTop: theme.spacing.lg,
    color: theme.colors.textMuted,
    lineHeight: 20
  }
});
