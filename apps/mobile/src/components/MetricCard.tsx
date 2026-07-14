import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

interface MetricCardProps {
  label: string;
  value: number | null;
  unit: string;
}

export function MetricCard({ label, value, unit }: MetricCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>
          {value === null ? '--' : value.toFixed(1)}
        </Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 14
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: theme.spacing.sm
  },
  value: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '700'
  },
  unit: {
    color: theme.colors.textMuted,
    fontSize: 16,
    paddingBottom: 5
  }
});
