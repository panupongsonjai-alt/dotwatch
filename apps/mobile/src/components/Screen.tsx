import type { PropsWithChildren } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type ViewStyle
} from 'react-native';

import { theme } from '@/theme';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  contentStyle?: ViewStyle;
  refreshControl?: ScrollViewProps['refreshControl'];
}

export function Screen({
  children,
  scroll = false,
  contentStyle,
  refreshControl
}: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SafeAreaView style={[styles.content, contentStyle]}>
        {children}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.md
  }
});
