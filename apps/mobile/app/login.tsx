import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Redirect, router } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { theme } from '@/theme';

export default function LoginScreen() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    return <Redirect href="/(app)" />;
  }

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await signIn(email, password);
      router.replace('/(app)');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>dotWatch</Text>
        <Text style={styles.title}>Mobile Monitoring</Text>
        <Text style={styles.subtitle}>
          เข้าสู่ระบบด้วยบัญชีเดียวกับ Web Dashboard
        </Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={email}
        />

        <TextInput
          autoCapitalize="none"
          autoComplete="password"
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
          placeholder="Password"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={submitting}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            submitting && styles.buttonDisabled
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background
  },
  card: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  brand: {
    color: theme.colors.primary,
    fontSize: 30,
    fontWeight: '800'
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    marginBottom: theme.spacing.sm
  },
  input: {
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceRaised
  },
  error: {
    color: theme.colors.danger
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary
  },
  buttonPressed: {
    opacity: 0.85
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: theme.colors.background,
    fontWeight: '800',
    fontSize: 16
  }
});
