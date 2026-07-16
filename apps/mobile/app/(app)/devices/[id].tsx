import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { getDevice } from '@/api/devices';
import { getMetricHistory } from '@/api/history';
import { HistoryChart } from '@/components/HistoryChart';
import { MetricCard } from '@/components/MetricCard';
import { RangeSelector } from '@/components/RangeSelector';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { connectRealtime } from '@/services/realtime';
import { theme } from '@/theme';
import type { HistoryRange } from '@/types/history';
import {
  formatDateTime,
  getDeviceName,
  getLatestMetric,
  getStatusColor
} from '@/utils/device';

export default function DeviceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>('24h');

  const deviceQuery = useQuery({
    queryKey: ['device', id],
    queryFn: () => getDevice(id || ''),
    enabled: Boolean(id)
  });

  const temperatureHistory = useQuery({
    queryKey: ['history', id, 'temperature', historyRange],
    queryFn: () =>
      getMetricHistory({
        deviceId: id || '',
        metricKey: 'temperature',
        range: historyRange
      }),
    enabled: Boolean(id)
  });

  const humidityHistory = useQuery({
    queryKey: ['history', id, 'humidity', historyRange],
    queryFn: () =>
      getMetricHistory({
        deviceId: id || '',
        metricKey: 'humidity',
        range: historyRange
      }),
    enabled: Boolean(id)
  });

  useEffect(() => {
    if (!user || !id) return;

    return connectRealtime(
      user,
      (message) => {
        const data =
          message.data && typeof message.data === 'object'
            ? (message.data as Record<string, unknown>)
            : null;
        const changedId = data?.id ?? data?.device_id ?? data?.deviceId;

        if (
          message.type === 'device:update' ||
          message.type === 'sensor:update'
        ) {
          if (!changedId || String(changedId) === String(id)) {
            void queryClient.invalidateQueries({
              queryKey: ['device', id]
            });
          }
        }

        if (message.type === 'alarm' || message.type === 'alarm:triggered') {
          void queryClient.invalidateQueries({ queryKey: ['alarms'] });
        }
      },
      setRealtimeConnected
    );
  }, [id, queryClient, user]);

  const refreshAll = async () => {
    await Promise.all([
      deviceQuery.refetch(),
      temperatureHistory.refetch(),
      humidityHistory.refetch()
    ]);
  };

  const refreshing =
    deviceQuery.isRefetching ||
    temperatureHistory.isRefetching ||
    humidityHistory.isRefetching;

  if (deviceQuery.isLoading) {
    return (
      <Screen contentStyle={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

  if (!deviceQuery.data) {
    return (
      <Screen contentStyle={styles.center}>
        <Text style={styles.error}>
          {deviceQuery.error?.message || 'ไม่พบอุปกรณ์'}
        </Text>
      </Screen>
    );
  }

  const device = deviceQuery.data;
  const temperature = getLatestMetric(device, [
    'temperature',
    'temp',
    'metric_1'
  ]);
  const humidity = getLatestMetric(device, [
    'humidity',
    'hum',
    'metric_2'
  ]);

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshAll}
          tintColor={theme.colors.primary}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{getDeviceName(device)}</Text>
          <Text style={styles.code}>
            {device.device_code || `ID ${device.id}`}
          </Text>
        </View>

        <View style={styles.statusWrap}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(device.status) }
            ]}
          />
          <Text style={styles.status}>{device.status || 'unknown'}</Text>
        </View>
      </View>

      <View style={styles.connectionRow}>
        <View
          style={[
            styles.connectionDot,
            {
              backgroundColor: realtimeConnected
                ? theme.colors.success
                : theme.colors.offline
            }
          ]}
        />
        <Text style={styles.connectionText}>
          {realtimeConnected ? 'Realtime connected' : 'Realtime reconnecting'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard label="Temperature" value={temperature} unit="°C" />
        <MetricCard label="Humidity" value={humidity} unit="%" />
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>History Trend</Text>
        <Text style={styles.sectionSubtitle}>
          ข้อมูลย้อนหลังสูงสุด 300 จุดต่อ metric
        </Text>
      </View>

      <RangeSelector value={historyRange} onChange={setHistoryRange} />

      <View style={styles.chartList}>
        <HistoryChart
          title="Temperature"
          unit="°C"
          points={temperatureHistory.data || []}
        />
        <HistoryChart
          title="Humidity"
          unit="%"
          points={humidityHistory.data || []}
        />
      </View>

      {temperatureHistory.isError ? (
        <Text style={styles.error}>
          Temperature history: {temperatureHistory.error.message}
        </Text>
      ) : null}

      {humidityHistory.isError ? (
        <Text style={styles.error}>
          Humidity history: {humidityHistory.error.message}
        </Text>
      ) : null}

      <View style={styles.infoCard}>
        <InfoRow
          label="Last seen"
          value={formatDateTime(
            device.last_seen_at ||
              device.last_ingest_at ||
              device.latest_time
          )}
        />
        <InfoRow
          label="Model"
          value={device.model_name || device.model_key || '-'}
        />
        <InfoRow
          label="Firmware"
          value={device.firmware_version || '-'}
        />
      </View>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md
  },
  headerText: {
    flex: 1
  },
  title: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '800'
  },
  code: {
    marginTop: 4,
    color: theme.colors.textMuted
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 99
  },
  status: {
    color: theme.colors.textMuted,
    textTransform: 'capitalize'
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: theme.spacing.lg
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 99
  },
  connectionText: {
    color: theme.colors.textMuted,
    fontSize: 13
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md
  },
  historyHeader: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '800'
  },
  sectionSubtitle: {
    marginTop: 4,
    color: theme.colors.textMuted,
    fontSize: 12
  },
  chartList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md
  },
  infoCard: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  infoLabel: {
    color: theme.colors.textMuted
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: theme.colors.text
  },
  error: {
    marginTop: theme.spacing.sm,
    color: theme.colors.danger
  }
});
