import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { theme } from '@/theme';
import type { HistoryPoint } from '@/types/history';

interface HistoryChartProps {
  title: string;
  unit: string;
  points: HistoryPoint[];
}

const WIDTH = 320;
const HEIGHT = 150;
const PADDING = 14;

function toNumber(point: HistoryPoint): number | null {
  const raw = point.avg_value ?? point.value;
  const value = typeof raw === 'number' ? raw : Number(raw);

  return Number.isFinite(value) ? value : null;
}

export function HistoryChart({
  title,
  unit,
  points
}: HistoryChartProps) {
  const chart = useMemo(() => {
    const values = points
      .map(toNumber)
      .filter((value): value is number => value !== null);

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = values.at(-1) ?? values[0] ?? 0;
    const range = max - min || 1;
    const drawableWidth = WIDTH - PADDING * 2;
    const drawableHeight = HEIGHT - PADDING * 2;

    const coordinates = values.map((value, index) => {
      const x =
        PADDING +
        (values.length === 1
          ? drawableWidth / 2
          : (index / (values.length - 1)) * drawableWidth);

      const y = PADDING + ((max - value) / range) * drawableHeight;

      return `${x},${y}`;
    });

    return {
      min,
      max,
      latest,
      coordinates: coordinates.join(' ')
    };
  }, [points]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.muted}>
            {chart
              ? `${chart.min.toFixed(1)}–${chart.max.toFixed(1)} ${unit}`
              : 'ยังไม่มีข้อมูล'}
          </Text>
        </View>

        <Text style={styles.latest}>
          {chart ? `${chart.latest.toFixed(1)} ${unit}` : '--'}
        </Text>
      </View>

      {chart ? (
        <Svg
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
        >
          <Line
            stroke={theme.colors.border}
            strokeWidth="1"
            x1={PADDING}
            x2={WIDTH - PADDING}
            y1={PADDING}
            y2={PADDING}
          />
          <Line
            stroke={theme.colors.border}
            strokeWidth="1"
            x1={PADDING}
            x2={WIDTH - PADDING}
            y1={HEIGHT - PADDING}
            y2={HEIGHT - PADDING}
          />
          <Polyline
            fill="none"
            points={chart.coordinates}
            stroke={theme.colors.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </Svg>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.muted}>No history data</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  muted: {
    marginTop: 4,
    color: theme.colors.textMuted,
    fontSize: 12
  },
  latest: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: '800'
  },
  empty: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
