# dotWatch Production Readiness Checklist

## Backend
- [ ] Set `NODE_ENV=production` on Render.
- [ ] Set `DATABASE_URL` to the production Timescale/PostgreSQL connection string.
- [ ] Set `CORS_ORIGIN` to the deployed dashboard URL only.
- [ ] Set Firebase Admin variables: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
- [ ] Confirm `/health` returns `ok: true` and `database: connected`.
- [ ] Confirm `/debug/*` endpoints return 404 in production.
- [ ] Confirm realtime WebSocket reconnects after refresh and device ingest.

## Dashboard
- [ ] Create `dotwatch-dashboard/.env` from `.env.example`.
- [ ] Set `VITE_API_URL` to the backend URL.
- [ ] Run `npm run build` before deploy.
- [ ] Check Dashboard, Devices, Device Detail, History, Alarms, Notifications, System Health, Profile and Settings.

## Database
- [ ] Confirm device ownership maps to the correct `users.id` and `firebase_uid`.
- [ ] Confirm Raspberry Pi device belongs to the real dashboard user.
- [ ] Confirm retention/compression jobs are active if using TimescaleDB.

## Realtime
- [ ] Open System Health and confirm WebSocket status is connected.
- [ ] Send one ingest payload from Raspberry Pi.
- [ ] Confirm Dashboard and Device Detail values change without refresh.
- [ ] Confirm backend logs show `WS broadcast sent` for `reading`.
