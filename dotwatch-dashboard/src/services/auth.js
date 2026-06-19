import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
} from "firebase/auth";

import { auth } from "./firebase";

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  if (result.user) {
    await sendEmailVerification(result.user);
  }

  return result;
}

export function logout() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function listenAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) {
    throw new Error("No current user");
  }

  return sendEmailVerification(auth.currentUser);
}
