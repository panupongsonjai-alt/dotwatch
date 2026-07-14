import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import { env } from './env';

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(env.firebase);

export const firebaseAuth = getAuth(firebaseApp);
