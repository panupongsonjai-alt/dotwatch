import {
  Component,
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { theme } from '@/theme';

interface State {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<
  PropsWithChildren,
  State
> {
  state: State = {
    hasError: false,
    message: ''
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Unknown application error'
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('dotWatch mobile render error:', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
  }

  private reset = () => {
    this.setState({
      hasError: false,
      message: ''
    });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>เกิดข้อผิดพลาดในแอป</Text>
          <Text style={styles.message}>{this.state.message}</Text>

          <Pressable
            onPress={this.reset}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed
            ]}
          >
            <Text style={styles.buttonText}>ลองเปิดหน้าจอใหม่</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background
  },
  card: {
    width: '100%',
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800'
  },
  message: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    lineHeight: 20
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary
  },
  buttonText: {
    color: theme.colors.background,
    fontWeight: '800'
  },
  pressed: {
    opacity: 0.8
  }
});
