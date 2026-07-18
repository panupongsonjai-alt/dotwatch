import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { Platform } from 'react-native';

import { env } from './env';
import { getPublicEnvironmentError } from './validateEnv';

export const mobileEnvironmentError = getPublicEnvironmentError();

const safeFirebaseConfig = mobileEnvironmentError
  ? {
      apiKey: 'invalid-mobile-environment',
      authDomain: 'invalid.local',
      projectId: 'invalid-mobile-environment',
      storageBucket: 'invalid-mobile-environment',
      messagingSenderId: '0',
      appId: '1:0:web:invalid-mobile-environment'
    }
  : env.firebase;

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(safeFirebaseConfig);

type ReactNativePersistenceFactory = (
  storage: typeof AsyncStorage
) => FirebaseAuth.Persistence;

const getReactNativePersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: ReactNativePersistenceFactory;
  }
).getReactNativePersistence;

function createFirebaseAuth(): FirebaseAuth.Auth {
  if (Platform.OS === 'web') {
    return FirebaseAuth.getAuth(firebaseApp);
  }

  try {
    if (typeof getReactNativePersistence !== 'function') {
      throw new Error(
        'Firebase React Native persistence adapter is unavailable'
      );
    }

    return FirebaseAuth.initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';

    if (code === 'auth/already-initialized') {
      return FirebaseAuth.getAuth(firebaseApp);
    }

    throw error;
  }
}

export const firebaseAuth = createFirebaseAuth();
