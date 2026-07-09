# Phase 10E - Dashboard Auth Environment Setup

This phase improves the dashboard login experience when Firebase Web SDK config is missing.

## Why this phase exists

The dashboard can connect to the backend only after the user signs in with Firebase Auth. If the Vite environment variables for Firebase are missing, the login page used to show a generic error while the browser console showed:

```text
Missing Firebase dashboard config: apiKey, authDomain, projectId, appId
```

Phase 10E makes that state visible on the login page and adds a verification command.

## Required local file

Create this file locally and do not commit it:

```text
apps/dashboard/.env.local
```

Start from:

```text
apps/dashboard/.env.local.example
```

Minimum required variables:

```env
VITE_API_URL=https://dotwatch-backend.onrender.com
VITE_WS_URL=wss://dotwatch-backend.onrender.com
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Recommended full set:

```env
VITE_API_URL=https://dotwatch-backend.onrender.com
VITE_WS_URL=wss://dotwatch-backend.onrender.com
VITE_DEMO_MODE=false
VITE_REQUEST_TIMEOUT_MS=20000
VITE_API_CACHE_TTL_MS=6000
VITE_API_SLOW_CACHE_TTL_MS=12000
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Get Firebase values

Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config.

Copy `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId` into the matching `VITE_FIREBASE_*` variables.

## Verify

```powershell
npm run verify:phase10e:dashboard-auth
```

## Restart dashboard dev server

Vite reads `.env.local` only when the dev server starts. After editing the env file, stop the dashboard server and start it again:

```powershell
npm run dashboard:dev
```

## Render dashboard deployment

Set the same `VITE_*` values in the Render dashboard service Environment tab, then redeploy the dashboard.
