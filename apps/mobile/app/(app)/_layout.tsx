import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { theme } from '@/theme';

export default function AppTabsLayout() {
  const { user, initializing } = useAuth();

  if (!initializing && !user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="grid-outline" size={size} />
          )
        }}
      />
      <Tabs.Screen
        name="devices/index"
        options={{
          title: 'Devices',
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="hardware-chip-outline" size={size} />
          )
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="settings-outline" size={size} />
          )
        }}
      />
      <Tabs.Screen
        name="devices/[id]"
        options={{
          href: null,
          title: 'Device Detail'
        }}
      />
    </Tabs>
  );
}
