import admin from 'firebase-admin';
import { env } from './env.js';

let firebaseReady = false;

if (env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });
  firebaseReady = true;
  console.log('Firebase Admin initialized');
} else {
  console.log('Firebase Admin skipped: development mode');
}

export { admin, firebaseReady };
