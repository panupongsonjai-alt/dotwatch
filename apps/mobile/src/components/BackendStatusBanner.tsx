import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { getBackendHealth } from '@/api/health';
import { theme } from '@/theme';

export function BackendStatusBanner() {
  const healthQuery = useQuery({
    queryKey: ['backend-health'],
    queryFn: getBackendHealth,
    refetchInterval: 30_000,
    retry: 1
  });

  if (healthQuery.isLoading || healthQuery.data?.ok) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <View style={styles.dot} />
      <Text style={styles.text}>
        ไม่สามารถเชื่อมต่อ dotWatch Backend ได้ กำลังลองใหม่
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.danger,
    backgroundColor: theme.colors.surface
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: theme.colors.danger
  },
  text: {
    flex: 1,
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '700'
  }
});
