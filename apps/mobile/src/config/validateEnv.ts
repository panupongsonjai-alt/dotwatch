const REQUIRED_ENV_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_WS_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID'
] as const;

function readValue(key: (typeof REQUIRED_ENV_KEYS)[number]): string {
  return process.env[key]?.trim() || '';
}

export function getPublicEnvironmentError(): string | null {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !readValue(key));

  if (missing.length > 0) {
    return `Missing mobile environment variables: ${missing.join(', ')}`;
  }

  const apiUrl = readValue('EXPO_PUBLIC_API_URL');
  const wsUrl = readValue('EXPO_PUBLIC_WS_URL');

  if (!/^https:\/\//i.test(apiUrl)) {
    return 'EXPO_PUBLIC_API_URL must use https://';
  }

  if (!/^wss:\/\//i.test(wsUrl)) {
    return 'EXPO_PUBLIC_WS_URL must use wss://';
  }

  return null;
}

export function validatePublicEnvironment(): void {
  const error = getPublicEnvironmentError();

  if (error) {
    throw new Error(error);
  }
}
