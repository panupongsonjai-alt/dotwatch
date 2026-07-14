import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';

import { listDevices } from '@/api/devices';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { connectRealtime } from '@/services/realtime';
import { theme } from '@/theme';
import { getDeviceName, getStatusColor } from '@/utils/device';

export default function DashboardScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    enabled: Boolean(user)
  });

  useEffect(() => {
    if (!user) return;

    return connectRealtime(
      user,
      (message) => {
        if (message.type === 'device:update' || message.type === 'sensor:update') {
          void queryClient.invalidateQueries({ queryKey: ['devices'] });
        }
      },
      setRealtimeConnected
    );
  }, [queryClient, user]);

  const summary = useMemo(() => {
    const devices = devicesQuery.data || [];

    return {
      total: devices.length,
      online: devices.filter((item) => item.status === 'online').length,
      warning: devices.filter((item) =>
        ['warning', 'critical'].includes(String(item.status))
      ).length,
      offline: devices.filter((item) => item.status === 'offline').length
    };
  }, [devicesQuery.data]);

  if (devicesQuery.isLoading) {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

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
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>OPERATIONS CENTER</Text>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <View style={styles.realtime}>
          <View
            style={[
              styles.realtimeDot,
              {
                backgroundColor: realtimeConnected
                  ? theme.colors.success
                  : theme.colors.offline
              }
            ]}
          />
          <Text style={styles.realtimeText}>
            {realtimeConnected ? 'Realtime' : 'Reconnect'}
          </Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Devices" value={summary.total} />
        <SummaryCard label="Online" value={summary.online} />
        <SummaryCard label="Warning" value={summary.warning} />
        <SummaryCard label="Offline" value={summary.offline} />
      </View>

      <Text style={styles.sectionTitle}>Device Overview</Text>

      {(devicesQuery.data || []).slice(0, 5).map((device) => (
        <Pressable
          key={String(device.id)}
          onPress={() => router.push(`/devices/${device.id}`)}
          style={({ pressed }) => [
            styles.deviceRow,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.deviceTitleRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(device.status) }
              ]}
            />
            <Text style={styles.deviceName}>{getDeviceName(device)}</Text>
          </View>
          <Text style={styles.deviceStatus}>{device.status || 'unknown'}</Text>
        </Pressable>
      ))}

      {devicesQuery.isError ? (
        <Text style={styles.error}>
          โหลดข้อมูลไม่สำเร็จ: {devicesQuery.error.message}
        </Text>
      ) : null}
    </Screen>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  title: {
    marginTop: 4,
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800'
  },
  realtime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  realtimeDot: {
    width: 9,
    height: 9,
    borderRadius: 99
  },
  realtimeText: {
    color: theme.colors.textMuted,
    fontSize: 12
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm
  },
  summaryCard: {
    width: '48%',
    minHeight: 100,
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800'
  },
  summaryLabel: {
    marginTop: 4,
    color: theme.colors.textMuted
  },
  sectionTitle: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  deviceTitleRow: {
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
  deviceName: {
    color: theme.colors.text,
    fontWeight: '700',
    flexShrink: 1
  },
  deviceStatus: {
    color: theme.colors.textMuted,
    textTransform: 'capitalize'
  },
  error: {
    marginTop: theme.spacing.md,
    color: theme.colors.danger
  }
});
