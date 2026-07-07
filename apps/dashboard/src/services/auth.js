import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
} from 'firebase/auth'

import { auth, firebaseConfigError } from './firebase'

function requireAuth() {
  if (!auth) {
    throw new Error(
      firebaseConfigError ||
        'Firebase Auth is not configured. Please check apps/dashboard/.env.local'
    )
  }

  return auth
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(requireAuth(), email, password)
}

export async function registerWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(
    requireAuth(),
    email,
    password
  )

  if (result.user) {
    await sendEmailVerification(result.user)
  }

  return result
}

export function logout() {
  if (!auth) return Promise.resolve()

  return signOut(auth)
}

export function resetPassword(email) {
  return sendPasswordResetEmail(requireAuth(), email)
}

export function listenAuthState(callback) {
  if (!auth) {
    callback(null)
    return () => {}
  }

  return onAuthStateChanged(auth, callback)
}

export async function resendVerificationEmail() {
  const authInstance = requireAuth()

  if (!authInstance.currentUser) {
    throw new Error('No current user')
  }

  return sendEmailVerification(authInstance.currentUser)
}
