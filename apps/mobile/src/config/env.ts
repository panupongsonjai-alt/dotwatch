function read(name: keyof NodeJS.ProcessEnv): string {
  return process.env[name]?.trim() || '';
}

export const env = {
  apiUrl: read('EXPO_PUBLIC_API_URL').replace(/\/+$/, ''),
  wsUrl: read('EXPO_PUBLIC_WS_URL').replace(/\/+$/, ''),
  firebase: {
    apiKey: read('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: read('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: read('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: read('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: read('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: read('EXPO_PUBLIC_FIREBASE_APP_ID')
  }
} as const;
