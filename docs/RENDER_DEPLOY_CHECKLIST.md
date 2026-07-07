# Render Deploy Checklist

## Backend service

### Build command

```bash
npm install && npm run migrate
```

or if Render runs inside `services/backend`:

```bash
npm install && npm run migrate
```

### Start command

```bash
npm start
```

### Health check path

```text
/health/live
```

### Required environment variables

```text
NODE_ENV=production
DATABASE_URL=postgres://...
CORS_ORIGIN=https://dotwatch.onrender.com,https://your-admin-domain
DEV_AUTH_BYPASS=false
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
DEVICE_SECRET_ENCRYPTION_KEY=...
```

### Recommended environment variables

```text
INGEST_MIN_INTERVAL_SECONDS=5
DEVICE_WARNING_AFTER_SECONDS=30
DEVICE_OFFLINE_AFTER_SECONDS=60
DEVICE_STATUS_CHECK_SECONDS=30
API_RATE_LIMIT_PER_MINUTE=600
INGEST_RATE_LIMIT_PER_MINUTE=50000
JSON_BODY_LIMIT=128kb
WS_SUBSCRIBE_TIMEOUT_MS=15000
WS_MAX_CLIENTS_PER_USER=5
HEALTH_DB_TIMEOUT_MS=3000
SHUTDOWN_TIMEOUT_MS=10000
```

## After deploy

Run from your PC:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-smoke-test.ps1 -BaseUrl "https://dotwatch-backend.onrender.com"
```

Check:

- `/health/live` returns `ok: true`.
- `/health/ready` returns `database: connected`.
- `/api/devices` returns 401 without token, or 200 in local dev bypass.
- Render logs do not show Firebase private key, database password, or device secrets.
