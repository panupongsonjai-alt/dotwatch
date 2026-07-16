const REQUIRED_ENV_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_WS_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID'
] as const;

export function validatePublicEnvironment(): void {
  const missing = REQUIRED_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return !value || !value.trim();
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing mobile environment variables: ${missing.join(', ')}`
    );
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const wsUrl = process.env.EXPO_PUBLIC_WS_URL || '';

  if (!/^https:\/\//i.test(apiUrl)) {
    throw new Error('EXPO_PUBLIC_API_URL must use https://');
  }

  if (!/^wss:\/\//i.test(wsUrl)) {
    throw new Error('EXPO_PUBLIC_WS_URL must use wss://');
  }
}
