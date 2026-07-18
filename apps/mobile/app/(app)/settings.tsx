import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { unregisterStoredPushToken } from '@/services/pushRegistration';
import { theme } from '@/theme';

export default function SettingsScreen() {
  const { user, signOutUser } = useAuth();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError('');

    try {
      await unregisterStoredPushToken();
      await signOutUser();
      queryClient.clear();
      router.replace('/login');
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? `ออกจากระบบไม่สำเร็จ: ${error.message}`
          : 'ออกจากระบบไม่สำเร็จ กรุณาลองใหม่'
      );
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.email || user?.uid || '-'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Mobile Monitoring</Text>
        <Text style={styles.description}>
          Firebase session persistence, dynamic Values, History,
          Alarm monitoring, WebSocket realtime และ Push Notification
        </Text>
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Safe logout</Text>
        <Text style={styles.noticeText}>
          แอปจะยกเลิก Push Token ของอุปกรณ์นี้ก่อนออกจากระบบ
          เพื่อไม่ให้บัญชีเดิมได้รับ Alarm Notification หลัง Logout
        </Text>
      </View>

      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}

      <Pressable
        disabled={signingOut}
        onPress={handleSignOut}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.pressed,
          signingOut && styles.disabled
        ]}
      >
        {signingOut ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.danger} />
            <Text style={styles.logoutText}>กำลังออกจากระบบ...</Text>
          </View>
        ) : (
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: theme.spacing.lg
  },
  card: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 13
  },
  value: {
    marginTop: 6,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  description: {
    marginTop: 6,
    color: theme.colors.text,
    lineHeight: 22
  },
  noticeCard: {
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.surface
  },
  noticeTitle: {
    color: theme.colors.warning,
    fontWeight: '800'
  },
  noticeText: {
    marginTop: 6,
    color: theme.colors.textMuted,
    lineHeight: 21
  },
  logoutButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.danger
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm
  },
  pressed: {
    opacity: 0.75
  },
  disabled: {
    opacity: 0.6
  },
  logoutText: {
    color: theme.colors.danger,
    fontWeight: '800'
  },
  error: {
    marginTop: theme.spacing.md,
    color: theme.colors.danger,
    lineHeight: 20
  }
});
