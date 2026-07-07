import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const REQUIRED_FIREBASE_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
]

const missingFirebaseKeys = REQUIRED_FIREBASE_KEYS.filter(
  (key) => !String(firebaseConfig[key] || '').trim()
)

export const isFirebaseConfigured = missingFirebaseKeys.length === 0

export const firebaseConfigError = isFirebaseConfigured
  ? ''
  : `Missing Firebase dashboard config: ${missingFirebaseKeys.join(', ')}`

let app = null
let authInstance = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  authInstance = getAuth(app)
} else if (import.meta.env.DEV) {
  console.error(firebaseConfigError)
}

export const auth = authInstance

export default app
