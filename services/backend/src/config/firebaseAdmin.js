import admin from 'firebase-admin'
import { env } from './env.js'

let firebaseReady = false

const firebaseConfigStatus = {
  projectId: env.firebaseProjectId ? 'configured' : 'missing',
  clientEmail: env.firebaseClientEmail ? 'configured' : 'missing',
  privateKey: env.firebasePrivateKey ? 'configured' : 'missing',
}

console.log('Firebase Admin config:', firebaseConfigStatus)

if (
  env.firebaseProjectId &&
  env.firebaseClientEmail &&
  env.firebasePrivateKey
) {
  admin.initializeApp({
    projectId: env.firebaseProjectId,
    credential: admin.credential.cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  })

  firebaseReady = true
  console.log('Firebase Admin initialized')
} else if (env.isDevelopment) {
  console.log('Firebase Admin skipped: development mode')
} else {
  console.warn('Firebase Admin not initialized')
}

export { admin, firebaseReady }
