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

const FIREBASE_ENV_NAMES = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
}

function isBlankOrPlaceholder(value) {
  const text = String(value || '').trim()

  if (!text) return true

  return /^(your-|YOUR_|ใส่|วาง|placeholder|changeme)/i.test(text)
}

export const missingFirebaseKeys = REQUIRED_FIREBASE_KEYS.filter((key) =>
  isBlankOrPlaceholder(firebaseConfig[key])
)

export const missingFirebaseEnvNames = missingFirebaseKeys.map(
  (key) => FIREBASE_ENV_NAMES[key]
)

export const optionalMissingFirebaseEnvNames = [
  'storageBucket',
  'messagingSenderId',
]
  .filter((key) => isBlankOrPlaceholder(firebaseConfig[key]))
  .map((key) => FIREBASE_ENV_NAMES[key])

export const isFirebaseConfigured = missingFirebaseKeys.length === 0

export const firebaseConfigError = isFirebaseConfigured
  ? ''
  : `Missing Firebase dashboard config: ${missingFirebaseKeys.join(', ')}`

export const firebaseConfigHelp = {
  localEnvFile: 'apps/dashboard/.env.local',
  requiredEnvNames: missingFirebaseEnvNames,
  optionalEnvNames: optionalMissingFirebaseEnvNames,
}

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
