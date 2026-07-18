function normalize(value: string | undefined): string {
  return value?.trim() ?? '';
}

export const env = {
  apiUrl: normalize(process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, ''),
  wsUrl: normalize(process.env.EXPO_PUBLIC_WS_URL).replace(/\/+$/, ''),
  firebase: {
    apiKey: normalize(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: normalize(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: normalize(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: normalize(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: normalize(
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    ),
    appId: normalize(process.env.EXPO_PUBLIC_FIREBASE_APP_ID)
  }
} as const;
