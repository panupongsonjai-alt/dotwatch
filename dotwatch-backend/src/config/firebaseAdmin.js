import admin from "firebase-admin";
import { env } from "./env.js";

let firebaseReady = false;

console.log("Firebase Project:", env.firebaseProjectId);
console.log("Firebase Email:", env.firebaseClientEmail);
console.log(
  "Firebase Private Key:",
  env.firebasePrivateKey ? "FOUND" : "MISSING",
);

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
  });

  firebaseReady = true;
  console.log("Firebase Admin initialized");
} else {
  console.log("Firebase Admin skipped: development mode");
}

export { admin, firebaseReady };
