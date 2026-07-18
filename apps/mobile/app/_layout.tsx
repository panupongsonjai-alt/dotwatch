import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { BackendStatusBanner } from '@/components/BackendStatusBanner';
import { mobileEnvironmentError } from '@/config/firebase';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { AppProviders } from '@/providers/AppProviders';
import { theme } from '@/theme';

export default function RootLayout() {
  useNotificationNavigation();

  if (mobileEnvironmentError) {
    return (
      <View style={styles.environmentScreen}>
        <StatusBar style="light" />
        <View style={styles.environmentCard}>
          <Text style={styles.environmentTitle}>
            Mobile environment is not configured
          </Text>
          <Text style={styles.environmentMessage}>
            {mobileEnvironmentError}
          </Text>
          <Text style={styles.environmentHint}>
            ตั้งค่า EXPO_PUBLIC_* ใน apps/mobile/.env สำหรับเครื่องพัฒนา
            หรือกำหนดค่าเดียวกันใน EAS Build Environment แล้วสร้างแอปใหม่
          </Text>
        </View>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <AppProviders>
        <StatusBar style="light" />
        <BackendStatusBanner />

        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.background
            },
            headerTintColor: theme.colors.text,
            contentStyle: {
              backgroundColor: theme.colors.background
            }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </AppProviders>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  environmentScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background
  },
  environmentCard: {
    width: '100%',
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface
  },
  environmentTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800'
  },
  environmentMessage: {
    marginTop: theme.spacing.sm,
    color: theme.colors.danger,
    lineHeight: 20
  },
  environmentHint: {
    marginTop: theme.spacing.md,
    color: theme.colors.textMuted,
    lineHeight: 21
  }
});
