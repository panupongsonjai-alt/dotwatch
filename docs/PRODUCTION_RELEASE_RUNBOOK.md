# dotWatch Production Release Runbook

Use this runbook for every production release.

## 0. Confirm target

```powershell
cd "D:\IoT Project\dotwatch"
$env:DATABASE_URL
```

- Render release: URL must be the Render External Database URL.
- Local test: URL may be localhost, but do not use production commands.

## 1. Pre-release checks

```powershell
npm run verify:phase8:release
npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run ops:health -- -BackendUrl "https://dotwatch-backend.onrender.com" -AllowReady503
```

## 2. Backup

```powershell
npm run db:backup -- -DockerImage postgres:18-alpine
```

Do not migrate production without a verified backup.

## 3. Migrate

```powershell
npm run backend:migrate
```

Check that output shows the Render host, not `localhost`.

## 4. Report

```powershell
npm run report:tenant
```

## 5. Deploy backend/dashboard/admin

On Render, trigger the backend deploy after code changes are pushed or uploaded by your chosen workflow.

Backend environment essentials:

```text
NODE_ENV=production
DATABASE_URL=<Render External Database URL>
CORS_ORIGIN=https://dotwatch.onrender.com,https://dotwatch-admin.onrender.com
DEV_AUTH_BYPASS=false
DEVICE_SECRET_ENCRYPTION_KEY=<new 32 byte base64 key>
LOG_LEVEL=info
HTTP_LOG_ENABLED=true
OPS_SUMMARY_INTERVAL_SECONDS=0
```

Dashboard/admin environment essentials:

```text
VITE_API_URL=https://dotwatch-backend.onrender.com
VITE_WS_URL=wss://dotwatch-backend.onrender.com
VITE_DEMO_MODE=false
VITE_USE_MOCK_ADMIN_API=false
```

## 6. Post-release health

```powershell
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com" `
  -AdminUrl "https://dotwatch-admin.onrender.com" `
  -AllowReady503
```

Omit `-AdminUrl` if admin is not deployed.

## 7. Rollback trigger points

Rollback or stop the release if:

- `db:env:check` does not identify Render.
- backup does not exist or has zero size.
- migration errors.
- `/health/ready` stays failed after retry/warmup.
- tenant report fails.
- dashboard cannot load after deployment.

## 8. After release

- Save release report from `_reports/phase8-release/`.
- Save backup file privately.
- Rotate exposed database password if it appeared in chat/logs/screenshots.
- Update Render backend `DATABASE_URL` after rotation.
