import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { listDevices } from '@/api/devices';
import { Screen } from '@/components/Screen';
import { theme } from '@/theme';
import {
  formatDateTime,
  getDeviceName,
  getStatusColor
} from '@/utils/device';

export default function DevicesScreen() {
  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices
  });

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={devicesQuery.isRefetching}
          onRefresh={devicesQuery.refetch}
          tintColor={theme.colors.primary}
        />
      }
    >
      <Text style={styles.title}>Devices</Text>
      <Text style={styles.subtitle}>
        อุปกรณ์ทั้งหมดภายใต้บัญชีของคุณ
      </Text>

      {devicesQuery.isLoading ? (
        <ActivityIndicator
          style={styles.loading}
          size="large"
          color={theme.colors.primary}
        />
      ) : null}

      {(devicesQuery.data || []).map((device) => (
        <Pressable
          key={String(device.id)}
          onPress={() => router.push(`/devices/${device.id}`)}
          style={({ pressed }) => [
            styles.card,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.nameRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(device.status) }
                ]}
              />
              <Text style={styles.name}>{getDeviceName(device)}</Text>
            </View>
            <Text style={styles.status}>{device.status || 'unknown'}</Text>
          </View>
          <Text style={styles.meta}>
            Last seen: {formatDateTime(device.last_seen_at || device.last_ingest_at)}
          </Text>
          {device.model_name ? (
            <Text style={styles.meta}>Model: {device.model_name}</Text>
          ) : null}
        </Pressable>
      ))}

      {!devicesQuery.isLoading && (devicesQuery.data || []).length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>ยังไม่มีอุปกรณ์</Text>
          <Text style={styles.emptyText}>
            เพิ่มอุปกรณ์ผ่าน Web Dashboard แล้วดึงหน้าจอนี้ลงเพื่อรีเฟรช
          </Text>
        </View>
      ) : null}

      {devicesQuery.isError ? (
        <Text style={styles.error}>{devicesQuery.error.message}</Text>
      ) : null}
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
  loading: {
    marginTop: theme.spacing.xl
  },
  card: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  pressed: {
    opacity: 0.75
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 99
  },
  name: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  status: {
    color: theme.colors.textMuted,
    textTransform: 'capitalize'
  },
  meta: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    fontSize: 13
  },
  empty: {
    alignItems: 'center',
    padding: theme.spacing.xl,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  emptyText: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.textMuted
  },
  error: {
    color: theme.colors.danger
  }
});
