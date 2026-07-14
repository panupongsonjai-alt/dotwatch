function required(name: keyof NodeJS.ProcessEnv, fallback = ''): string {
  const value = process.env[name]?.trim() || fallback;

  if (!value) {
    console.warn(`[dotWatch mobile] Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  apiUrl: required(
    'EXPO_PUBLIC_API_URL',
    'https://dotwatch-backend.onrender.com'
  ).replace(/\/+$/, ''),
  wsUrl: required(
    'EXPO_PUBLIC_WS_URL',
    'wss://dotwatch-backend.onrender.com'
  ).replace(/\/+$/, ''),
  firebase: {
    apiKey: required('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: required('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: required('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: required('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('EXPO_PUBLIC_FIREBASE_APP_ID')
  }
} as const;
