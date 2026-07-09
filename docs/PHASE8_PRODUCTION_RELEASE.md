# dotWatch Phase 8 — Production Release

Phase 8 turns the previous hardening work into a repeatable production release flow.

## Goals

- Use Render PostgreSQL as the production source of truth.
- Keep local development separate from production.
- Backup production before every production migration.
- Run post-release health checks after migration/deploy.
- Keep a private audit trail in `_reports/phase8-release/`.
- Rotate exposed secrets after the release is confirmed.

## Production target model

```text
Local backend/dashboard/admin  -> local PostgreSQL only for development
Render backend/dashboard/admin -> Render PostgreSQL for production
Pi / ESP32                     -> Render backend only in field use
```

Local and Render should use the same code and migrations. They do not need to share live data. If local needs to match production data, restore a verified Render backup into local intentionally.

## Important Phase 8 changes

- `scripts/db-backup.ps1` now defaults to `postgres:18-alpine` for Docker fallback because the current Render PostgreSQL server may be PostgreSQL 18.
- `scripts/db-restore.ps1` also defaults to `postgres:18-alpine`.
- `scripts/phase8-render-release.ps1` runs the production release sequence in a safer order:
  1. static Phase 8 verify
  2. Render DB env check
  3. secret scan
  4. optional build checks
  5. Render database backup
  6. Render migration
  7. tenant report
  8. backend/dashboard/admin health check

## Required environment before production release

Set `DATABASE_URL` to the real Render **External Database URL** in the current PowerShell session:

```powershell
$env:DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require'
```

Do not use localhost with `-RequireRender`.

## Verify Phase 8 files

```powershell
cd "D:\IoT Project\dotwatch"
npm run verify:phase8:release
```

## Manual production release flow

```powershell
cd "D:\IoT Project\dotwatch"

$env:DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require'

npm run db:env:check -- -RequireDockerOrPgDump -RequireRender
npm run db:backup -- -DockerImage postgres:18-alpine
npm run backend:migrate
npm run report:tenant
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -AllowReady503
```

## One-command production release flow

```powershell
npm run release:render -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com" `
  -PostgresDockerImage "postgres:18-alpine"
```

If the dashboard or admin site is not deployed yet, omit those URLs.

## Backup verification

After backup, check the latest dump:

```powershell
Get-ChildItem ".\_backups\database" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 5 FullName,Length,LastWriteTime
```

For a deeper check:

```powershell
$Docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$BackupDir = Join-Path (Get-Location) "_backups\database"

& $Docker run --rm `
  -v "${BackupDir}:/backup" `
  postgres:18-alpine `
  sh -lc 'pg_restore --list /backup/dotwatch-full-YYYYMMDD-HHMMSS.dump | head -40'
```

## Post-release checks

Run these after Render deploy or migration:

```powershell
npm run ops:health -- `
  -BackendUrl "https://dotwatch-backend.onrender.com" `
  -DashboardUrl "https://dotwatch.onrender.com" `
  -AllowReady503

npm run report:tenant
```

## Secret rotation requirement

If a real `DATABASE_URL`, Firebase private key, device secret, or admin token was pasted into chat, screenshots, logs, or a committed file, rotate it after the release is confirmed. For the database, rotate/reset the Render database password and then update Render backend `DATABASE_URL`.

See `docs/SECRETS_ROTATION_AFTER_EXPOSURE.md`.

## Definition of done

- Phase 8 verify passes.
- Render `DATABASE_URL` check passes with `-RequireRender`.
- Production backup exists and has non-zero size.
- Migration completes against Render DB.
- Tenant report completes against Render DB.
- Backend health check is OK.
- Dashboard/admin health checks are OK if deployed.
- Exposed secrets are rotated.
- The release report exists in `_reports/phase8-release/`.
