# dotWatch Operations Runbook

Use this runbook after applying Phase 6, especially before and after Render deploys.

## 1. Local pre-deploy check

From the repo root:

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase6:ops
npm run ops:release-check -- -SkipBuild
```

Run a full build check when dependencies are installed:

```powershell
npm run ops:release-check
```

## 2. Database check before deploy

Set `DATABASE_URL` only in the current PowerShell session:

```powershell
$env:DATABASE_URL="วาง Render External Database URL ตรงนี้"
npm run db:preflight
npm run db:health
npm run ops:backend-report
```

Recommended order before risky backend/database changes:

```powershell
npm run db:backup
npm run db:preflight
npm run backend:migrate
npm run db:preflight
npm run db:health
npm run ops:backend-report
```

## 3. Render post-deploy check

```powershell
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com" `
  -AdminUrl "https://dotwatch-admin.onrender.com"
```

If `/health/ready` returns `503`, check:

- `DATABASE_URL`
- PostgreSQL availability
- Firebase Admin environment variables
- backend logs around the matching `requestId`

## 4. Using request IDs

Every backend response includes `requestId`. When the dashboard shows an error or `ApiStatusBanner`, copy the request ID and search the backend logs for the same value.

For manual checks, `ops-health-check.ps1` sends `X-Request-ID` and stores the response `requestId` in the report.

## 5. Backend logs

Phase 6 backend logs are structured JSON. Useful fields:

- `requestId`
- `event`
- `method`
- `path`
- `statusCode`
- `responseTime`
- `userId`
- `deviceCode`
- `slowRequest`

Recommended Render log searches:

- `requestId=<copied value>`
- `event=shutdown_start`
- `event=uncaught_exception`
- `slowRequest=true`
- `statusCode=500`

## 6. When a device stops updating

1. Check backend ready health.
2. Check database health report.
3. Check latest ingest window:

```powershell
$env:DATABASE_URL="วาง Render External Database URL ตรงนี้"
npm run ops:backend-report
```

4. Check the device side:

```powershell
npm run check:pi:field -- -PiHost 192.168.1.237 -PiUser pi -ServiceStatus -TailLogs
```

For ESP32:

```powershell
npm run check:esp32:field
```

## 7. Report retention

Reports under `_reports/ops/` are local operational artifacts. Keep recent reports for troubleshooting, but do not commit or export them.
