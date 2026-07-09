# dotWatch Rollback Checklist

Use this checklist when a deployment causes backend 500 errors, dashboard white screen, ingest failures, or database migration issues.

## Immediate triage

1. Check live health:

```powershell
npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503
```

2. Check Render logs for:

- `uncaught_exception`
- `unhandled_rejection`
- `shutdown_start`
- HTTP 500 records
- matching `requestId`

3. Check whether the issue affects:

- backend only
- dashboard/admin only
- database/migration
- Pi/ESP32 ingest only

## Backend rollback

1. In Render, open the backend service.
2. Go to deploy history.
3. Redeploy the last known good deploy.
4. After rollback, run:

```powershell
npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503
```

If backend code was rolled back but database migration had already changed schema, run database preflight before further changes.

## Dashboard/Admin rollback

1. Roll back the frontend service deploy in Render.
2. Confirm the frontend loads.
3. Confirm API URL still points to the correct backend.
4. Run:

```powershell
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com" `
  -AdminUrl "https://dotwatch-admin.onrender.com" `
  -AllowReady503
```

## Database rollback

Database rollback is highest risk. Prefer fixing forward unless data is corrupted.

Before any restore:

```powershell
npm run db:backup
npm run db:preflight
npm run db:health
```

Restore dry-run:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump"
```

Restore actual:

```powershell
npm run db:restore -- -BackupFile "D:\IoT Project\dotwatch\_backups\database\dotwatch-full-YYYYMMDD-HHMMSS.dump" -Apply
```

After restore:

```powershell
npm run db:preflight
npm run db:health
npm run ops:backend-report
```

## Device ingest rollback

If devices stopped sending after firmware/agent changes:

- Keep backend stable first.
- Revert Pi agent files from the last working zip.
- For ESP32, reflash the last working firmware.
- Verify with field tools:

```powershell
npm run check:pi:field -- -PiHost 192.168.1.237 -PiUser pi -Cycles 3 -Send -ServiceStatus
npm run check:esp32:field
```

## Decision rule

- If only UI is broken: rollback dashboard/admin first.
- If backend health is down: rollback backend first.
- If backend is healthy but data is wrong: pause deploys, backup database, run DB preflight/health, then decide fix-forward vs restore.
- If only one device is broken: do not rollback platform; fix the device/agent path.
