import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { BackendStatusBanner } from '@/components/BackendStatusBanner';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { AppProviders } from '@/providers/AppProviders';
import { theme } from '@/theme';

export default function RootLayout() {
  useNotificationNavigation();

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
          <Stack.Screen
            name="index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="login"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="(app)"
            options={{ headerShown: false }}
          />
        </Stack>
      </AppProviders>
    </AppErrorBoundary>
  );
}
