import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

interface MetricCardProps {
  label: string;
  value: number | null;
  unit?: string;
  decimalPlaces?: number;
}

export function MetricCard({
  label,
  value,
  unit = '',
  decimalPlaces = 2
}: MetricCardProps) {
  const normalizedDecimalPlaces = Math.min(
    Math.max(Math.trunc(decimalPlaces), 0),
    6
  );

  return (
    <View style={styles.card}>
      <Text numberOfLines={2} style={styles.label}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text numberOfLines={1} style={styles.value}>
          {value === null ? '--' : value.toFixed(normalizedDecimalPlaces)}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
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
    minHeight: 36,
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
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '700'
  },
  unit: {
    color: theme.colors.textMuted,
    fontSize: 15,
    paddingBottom: 4
  }
});
