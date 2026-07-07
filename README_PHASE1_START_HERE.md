# dotWatch Phase 1 Start Here

Phase 1 focuses on production hardening without changing the main dashboard or device workflow.

## Copy files

Copy this patch into the root `dotwatch` folder and allow overwrite.

## Verify after copy

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase1
```

If the backend is running locally:

```powershell
npm run backend:dev
```

Open another PowerShell window and run:

```powershell
npm run smoke:backend
```

For Render, use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backend-smoke-test.ps1 -BaseUrl "https://dotwatch-backend.onrender.com"
```

## Important Render settings

In Render backend environment variables, confirm:

```text
NODE_ENV=production
DEV_AUTH_BYPASS=false
CORS_ORIGIN=https://your-dashboard-domain,https://your-admin-domain
DEVICE_WARNING_AFTER_SECONDS=30
DEVICE_OFFLINE_AFTER_SECONDS=60
DEVICE_STATUS_CHECK_SECONDS=30
```

Render health check path can use:

```text
/health/live
```

Use `/health/ready` when you want to confirm the database is connected.

## What changed

- Added request id to every response.
- Added `/health/live` and `/health/ready`.
- Kept `/health` for backward compatibility.
- Added safer production CORS errors.
- Added configurable API/WebSocket/ingest limits.
- Added graceful shutdown for Render deploy/restart.
- Prevented repeated offline activity spam by broadcasting only newly changed offline devices.
- Sanitized Firebase Admin startup logs.
