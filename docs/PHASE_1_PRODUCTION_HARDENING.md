# Phase 1 - Production Hardening

This phase makes dotWatch safer and easier to operate on Render or any production server.

## Backend hardening

### Health endpoints

| Endpoint | Purpose |
| --- | --- |
| `/health/live` | Lightweight liveness check. Does not query database. Best for Render health check. |
| `/health/ready` | Readiness check. Confirms database and production Firebase readiness. |
| `/health` | Backward-compatible readiness check. |

### Request ID

Every request now gets an `x-request-id` response header and `requestId` in JSON error/health responses. This makes debugging Render logs easier.

### Safer CORS failure

Blocked CORS origins now return a controlled 403 error instead of being treated as an internal server error.

### Configurable production limits

These can be set in `services/backend/.env` or Render environment variables:

```text
API_RATE_LIMIT_PER_MINUTE=600
INGEST_RATE_LIMIT_PER_MINUTE=50000
JSON_BODY_LIMIT=128kb
WS_SUBSCRIBE_TIMEOUT_MS=15000
WS_MAX_CLIENTS_PER_USER=5
DEVICE_WARNING_AFTER_SECONDS=30
DEVICE_OFFLINE_AFTER_SECONDS=60
DEVICE_STATUS_CHECK_SECONDS=30
HEALTH_DB_TIMEOUT_MS=3000
SHUTDOWN_TIMEOUT_MS=10000
```

### Device status detection

Before this patch, the backend could repeatedly broadcast/create offline activity for the same already-offline device during each status scan. Phase 1 changes this so the activity/broadcast path only runs for devices newly changed to offline by `markOfflineDevices()`.

### Graceful shutdown

The backend now handles `SIGTERM` and `SIGINT` by:

1. stopping recurring intervals,
2. closing WebSocket clients,
3. closing the HTTP server,
4. closing the PostgreSQL pool,
5. exiting cleanly.

This is useful during Render deploys/restarts.

## Verify

```powershell
npm run verify:phase1
```

If backend is running:

```powershell
npm run smoke:backend
```

For Render:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-smoke-test.ps1 -BaseUrl "https://dotwatch-backend.onrender.com"
```

## Recommended Render health check path

Use:

```text
/health/live
```

Reason: liveness should prove the web server is alive. Database readiness is better checked separately with `/health/ready` because temporary database latency should not always force Render to restart the service.
