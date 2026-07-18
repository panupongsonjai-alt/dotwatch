import { env } from './env';

const REQUIRED_ENV_VALUES = [
  ['EXPO_PUBLIC_API_URL', env.apiUrl],
  ['EXPO_PUBLIC_WS_URL', env.wsUrl],
  ['EXPO_PUBLIC_FIREBASE_API_KEY', env.firebase.apiKey],
  ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', env.firebase.authDomain],
  ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', env.firebase.projectId],
  ['EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', env.firebase.storageBucket],
  [
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    env.firebase.messagingSenderId
  ],
  ['EXPO_PUBLIC_FIREBASE_APP_ID', env.firebase.appId]
] as const;

export function getPublicEnvironmentError(): string | null {
  const missing = REQUIRED_ENV_VALUES.filter(([, value]) => !value).map(
    ([name]) => name
  );

  if (missing.length > 0) {
    return `Missing mobile environment variables: ${missing.join(', ')}`;
  }

  if (!/^https:\/\//i.test(env.apiUrl)) {
    return 'EXPO_PUBLIC_API_URL must use https://';
  }

  if (!/^wss:\/\//i.test(env.wsUrl)) {
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
