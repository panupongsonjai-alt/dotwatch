import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { theme } from '@/theme';

export default function SettingsScreen() {
  const { user, signOutUser } = useAuth();

  const handleSignOut = async () => {
    await signOutUser();
    router.replace('/login');
  };

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.email || user?.uid || '-'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Mobile Foundation</Text>
        <Text style={styles.description}>
          Firebase Authentication, Render REST API, Device list,
          Temperature/Humidity และ WebSocket realtime
        </Text>
      </View>

      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.pressed
        ]}
      >
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
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
  logoutButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.danger
  },
  pressed: {
    opacity: 0.75
  },
  logoutText: {
    color: theme.colors.danger,
    fontWeight: '800'
  }
});
